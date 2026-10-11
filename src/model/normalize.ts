// Turns any parsed JSON into a complete, valid Character.
// Philosophy: be forgiving. Missing fields get defaults, wrong types are coerced when the
// intent is obvious, and everything that was changed or dropped is reported as a warning.
// Only a few things are fatal (not an object, a newer schema version than we know).
//
// Unknown fields are never dropped (since schema version 2): a field the app does not know is kept
// as it is, in the same place, and exported again; the import dialog lists it. That way a file
// written by a newer app, or by hand with extra notes, survives a round trip through this app.
import { SRD_CONDITIONS, srdClass } from '../data/srd'
import { base64Bytes, parseImageDataUrl } from './images'
import { isMarkColor } from './mapMarks'
import { isBuiltinCategory } from './categories'
import { DEFAULT_CONTAINER, chainOf, withoutItemLink } from './containers'
import { nameKey } from './crafting'
import { newId } from './id'
import { DEFAULT_CREATURE_PREFS, creatureHpMax, tidyCreature } from './creatures'
import { evalFormula, hitDicePool, pactSlots, spellSlots } from './rules'
import {
  ABILITIES,
  ABILITY_SCORE_MODES,
  ACTIVATIONS,
  ATTACK_ORDERS,
  COINS,
  CREATURE_LONG_RESTS,
  CREATURE_PLACES,
  CREATURE_ROW_FIELDS,
  CREATURE_SHORT_RESTS,
  CREATURE_TEXT_FIELDS,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_GEAR_PREFS,
  GEAR_GROUPINGS,
  GEAR_SHOW_FIELDS,
  GEAR_VIEWS,
  MAP_LAYERS,
  MARK_SIZES,
  PHONE_STARTS,
  RECHARGES,
  SKILL_IDS,
  SOURCE_TYPES,
  USES_RESOURCES,
  type Ability,
  type Activation,
  type Attack,
  type Character,
  type CharacterImage,
  type MapPin,
  type MapPoint,
  type MapRoute,
  type MapScale,
  type MapToken,
  PIN_ICONS,
  type ClassEntry,
  type Container,
  type Creature,
  type CreatureAction,
  type CreatureField,
  type CreatureInstance,
  type CreaturePrefs,
  type DayTimer,
  type Feature,
  type Formula,
  type GearPrefs,
  type Item,
  type ItemAbilityScore,
  type ItemCategory,
  type ItemPower,
  type ItemTemplate,
  type PlayCounter,
  type PowerCost,
  type Recharge,
  type Recipe,
  type RecipePart,
  type SessionNote,
  type SkillProficiency,
  type SourceType,
  type Spell,
  type Uses,
  type XpEntry,
} from './types'

export class ImportError extends Error {}

export interface NormalizeResult {
  character: Character
  warnings: string[]
  /**
   * The pictures an exported file carried, by image id, as data URLs. They are NOT part of the
   * character: whoever imports stores them in the image store (imageStore.ts). Empty for a character
   * read from the browser, and for a file without pictures.
   */
  imageData: Record<string, string>
  /** Whether the input had an `images` field at all. A file without one says nothing about images: on "Replace existing" the browser's images are kept. */
  imagesInFile: boolean
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export { newId }

function makeReader(warnings: string[]) {
  const str = (v: unknown, path: string, def = ''): string => {
    if (v === undefined || v === null) return def
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.join('\n')
    warnings.push(`${path}: expected text, ignored.`)
    return def
  }
  const num = (v: unknown, path: string, def: number, min = -Infinity, max = Infinity): number => {
    if (v === undefined || v === null || v === '') return def
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (!Number.isFinite(n)) {
      warnings.push(`${path}: expected a number, got ${JSON.stringify(v)}; using ${def}.`)
      return def
    }
    if (n < min || n > max) {
      const c = Math.min(max, Math.max(min, n))
      warnings.push(`${path}: ${n} is out of range; using ${c}.`)
      return c
    }
    return n
  }
  const bool = (v: unknown, def = false): boolean => (v === undefined || v === null ? def : Boolean(v))
  const arr = (v: unknown, path: string): unknown[] => {
    if (v === undefined || v === null) return []
    if (Array.isArray(v)) return v
    warnings.push(`${path}: expected a list, ignored.`)
    return []
  }
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], path: string, def: T, aliases: Record<string, T> = {}): T => {
    if (v === undefined || v === null || v === '') return def
    const s = String(v).toLowerCase().trim()
    if ((allowed as readonly string[]).includes(s)) return s as T
    if (aliases[s]) return aliases[s]
    warnings.push(`${path}: "${String(v)}" is not one of ${allowed.join(', ')}; using "${def}".`)
    return def
  }
  const formula = (v: unknown, path: string, def: Formula): Formula => {
    if (typeof v === 'number') return v
    if (typeof v === 'string' && v.trim() !== '') return /^-?\d+$/.test(v.trim()) ? Number(v) : v.trim()
    if (v !== undefined && v !== null) warnings.push(`${path}: expected a number or formula; using ${def}.`)
    return def
  }
  /** Tags: a list of text or "a, b, c". Lowercase, trimmed, no duplicates. Undefined when empty. */
  const tags = (v: unknown, path: string): string[] | undefined => {
    if (v === undefined || v === null || v === '') return undefined
    const list = typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : null
    if (!list) {
      warnings.push(`${path}: expected a list of tags, ignored.`)
      return undefined
    }
    const out = [...new Set(list.map((x) => normalizeTag(String(x ?? ''))).filter(Boolean))]
    return out.length ? out : undefined
  }
  return { str, num, bool, arr, oneOf, formula, tags }
}

/** One tag as stored: lowercase, single spaces, no commas. */
export const normalizeTag = (s: string) => s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Copies every field of `raw` that is not in `known` onto `out`, unchanged, and says so.
 * `known` lists the fields the importer reads (including aliases it consumes, like "race").
 */
function keepUnknown(raw: Obj, out: object, known: readonly string[], path: string, warnings: string[]) {
  for (const [k, v] of Object.entries(raw)) {
    if (known.includes(k) || v === undefined) continue
    ;(out as Obj)[k] = v
    warnings.push(`${path ? `${path}.` : ''}${k}: not a field this app uses; kept unchanged.`)
  }
}

// The fields each object has, as read by normalizeCharacter. Anything else is kept by keepUnknown.
// Exported for tests/aiGuide.test.ts: every field here must be described in AI-GUIDE.md.
export const KNOWN = {
  top: ['schemaVersion', 'id', 'name', 'player', 'species', 'race', 'background', 'alignment', 'xp', 'partySize', 'xpLog', 'classes', 'abilities', 'proficiencies', 'combat', 'conditions', 'exhaustion', 'exhaustionRules', 'heroicInspiration', 'features', 'attacks', 'spellcasting', 'spells', 'inventory', 'items', 'money', 'roleplay', 'sessionNotes', 'timers', 'images', 'creatures', 'recipes', 'playCounters', 'preferences', 'updatedAt'],
  species: ['name', 'size'],
  abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
  class: ['id', 'name', 'level', 'subclass', 'hitDie', 'casterType', 'spellcastingAbility'],
  proficiencies: ['savingThrows', 'skills', 'jackOfAllTrades', 'armor', 'weapons', 'tools', 'languages', 'weaponMasteries'],
  combat: ['unarmoredAc', 'acBonus', 'initiativeBonus', 'speed', 'hp', 'hitDiceUsed', 'deathSaves'],
  hp: ['max', 'current', 'temp'],
  deathSaves: ['successes', 'failures'],
  feature: ['id', 'name', 'source', 'activation', 'uses', 'description', 'level', 'tags', 'poolId', 'cost'],
  source: ['type', 'name'],
  uses: ['max', 'used', 'recharge', 'shortRestRegain', 'regain', 'note', 'resource'],
  attack: ['id', 'name', 'ability', 'proficient', 'bonus', 'damage', 'damageType', 'addAbilityToDamage', 'damageBonus', 'mastery', 'notes', 'itemId'],
  spell: ['id', 'name', 'level', 'source', 'prepared', 'alwaysPrepared', 'ritual', 'concentration', 'school', 'castingTime', 'range', 'components', 'duration', 'description', 'castingAbility', 'freeCasts', 'tags'],
  spellcasting: ['slotsUsed', 'pactSlotsUsed', 'concentration', 'slotsOverride', 'pactOverride', 'bonusSlots'],
  pactOverride: ['slots', 'level'],
  inventory: ['items', 'money', 'containers', 'categories'],
  item: ['id', 'name', 'quantity', 'equipped', 'requiresAttunement', 'attuned', 'weight', 'armor', 'acBonus', 'saveBonus', 'spellDcBonus', 'spellAttackBonus', 'abilityScores', 'saveDc', 'spellAttack', 'charges', 'activation', 'description', 'powers', 'tags', 'containerId', 'category'],
  container: ['id', 'name', 'icon', 'color', 'capacity', 'weightless', 'extradimensional', 'itemId'],
  category: ['id', 'name', 'icon', 'color'],
  preferences: ['gear', 'money', 'play', 'maps', 'creatures'],
  creaturePrefs: ['where', 'pinned', 'row', 'rolls', 'longRest', 'shortRest'],
  mapPrefs: ['size', 'names', 'hide'],
  moneyPrefs: ['coins'],
  playPrefs: ['attackOrder', 'phoneStart', 'editButtons'],
  gearPrefs: ['view', 'groupBy', 'show'],
  gearShow: GEAR_SHOW_FIELDS,
  armor: ['base', 'dexCap'],
  abilityScore: ['ability', 'mode', 'value', 'max'],
  power: ['id', 'name', 'activation', 'cost', 'uses', 'description', 'tags'],
  money: ['cp', 'sp', 'ep', 'gp', 'pp'],
  roleplay: ['appearance', 'personality', 'ideals', 'bonds', 'flaws', 'voice', 'mannerisms', 'goals', 'backstory', 'allies', 'notes'],
  sessionNote: ['id', 'date', 'title', 'text'],
  xpEntry: ['id', 'date', 'kind', 'amount', 'groupXp', 'players'],
  timer: ['id', 'name', 'days', 'start', 'note'],
  image: ['id', 'name', 'width', 'height', 'bytes', 'thumb', 'data', 'pins', 'routes', 'tokens', 'scale'],
  token: ['id', 'name', 'x', 'y', 'label', 'color', 'note'],
  route: ['id', 'name', 'color', 'points', 'perDay'],
  mapPoint: ['x', 'y'],
  mapScale: ['a', 'b', 'distance', 'unit', 'perDay'],
  pin: ['id', 'name', 'x', 'y', 'note', 'color', 'icon'],
  recipe: ['id', 'name', 'inputs', 'output', 'time', 'tool', 'dc', 'note', 'containerId'],
  recipePart: ['name', 'quantity'],
  recipeOutput: ['name', 'quantity', 'template'],
  playCounter: ['name'],
  creature: ['id', 'name', 'kind', 'ac', 'hp', 'hitDice', 'speed', 'abilities', 'saves', 'initiative', ...CREATURE_TEXT_FIELDS, 'actions', 'extra', 'description', 'inPlay'],
  creatureAction: ['id', 'name', 'activation', 'toHit', 'damage', 'damageBonus', 'damageType', 'saveDc', 'saveAbility', 'uses', 'description'],
  creatureExtra: ['label', 'value'],
  creatureInstance: ['id', 'label', 'hp', 'conditions', 'used', 'note'],
} as const

/**
 * Brings an older file up to the current schema, step by step, before it is read.
 * MIGRATIONS[n] turns a raw object of version n into one of version n + 1.
 */
const MIGRATIONS: Record<number, (raw: Obj, warnings: string[]) => Obj> = {
  // v1 -> v2 adds only optional fields (tags on spells, features and items; item powers) and stops
  // dropping unknown fields. Nothing in a v1 file changes meaning, so the step is a plain copy.
  // Item descriptions are NOT split into powers automatically: that would be guessing at rules text.
  1: (raw) => ({ ...raw }),
  // v2 -> v3 adds only new fields with defaults: partySize (5), xpLog ([]) and timers ([]). The XP
  // total already existed and keeps its value. Nothing else changes meaning: a plain copy.
  2: (raw) => ({ ...raw }),
}

// Until 2026-09-29 an item's bonus to spells was a passive power whose NAME was the bonus: "+1 spell
// save DC" (Witch Focus), "+3 spell attack" (Staff of Ages), counted while the item was in Play
// (no attunement needed, or attuned). Now it is the item's spellDcBonus / spellAttackBonus, counted
// like acBonus (equipped too). These are the exact patterns the old app read, so a file converts to
// the same numbers. This runs on every read, not as a version step: schema 3 files saved before the
// change (in the browser) have such powers too. After one save the powers are gone and it does nothing.
const OLD_DC_BONUS = /^\+\s*(\d+)\s+(?:to\s+)?(?:your\s+)?spell\s+save\s+dcs?\s*$/i
const OLD_ATTACK_BONUS = /^\+\s*(\d+)\s+(?:to\s+)?(?:your\s+)?spell\s+attacks?(?:\s+rolls?)?\s*$/i

/**
 * Turns the old bonus powers of one (already normalized) item into its bonus fields: the value goes
 * to the field, the power's text to the end of the item's description, the power is removed. A power
 * with a cost or its own uses is not a plain bonus and stays. If the old app counted the bonus but the
 * item is not equipped (Witch Focus), it is equipped now, so the DC and spell attack stay the same.
 */
export function liftSpellBonusPowers(item: Item, path: string, warnings: string[]) {
  if (!item.powers?.length) return
  const countedBefore = !item.requiresAttunement || item.attuned
  // a field already set by the new app wins; old powers add up only into a field they create
  const fresh = new Set((['spellDcBonus', 'spellAttackBonus'] as const).filter((f) => item[f] === undefined))
  let lifted = 0
  const keep: ItemPower[] = []
  for (const pw of item.powers) {
    const plain = pw.activation === 'passive' && !pw.cost && !pw.uses
    const dc = plain ? OLD_DC_BONUS.exec(pw.name.trim()) : null
    const atk = plain && !dc ? OLD_ATTACK_BONUS.exec(pw.name.trim()) : null
    const m = dc ?? atk
    if (!m) {
      keep.push(pw)
      continue
    }
    const field = dc ? 'spellDcBonus' : 'spellAttackBonus'
    const moved = pw.description.trim() ? '; its text was added to the item description' : ''
    if (fresh.has(field)) {
      item[field] = (item[field] ?? 0) + Number(m[1])
      warnings.push(`${path}: the power "${pw.name}" is now the item's ${field} (${item[field]})${moved}.`)
    } else {
      warnings.push(`${path}: the power "${pw.name}" was removed: the item already has ${field} ${item[field]}${moved}.`)
    }
    lifted++
    if (moved) item.description = [item.description, pw.description].filter((s) => s?.trim()).join('\n\n')
  }
  if (!lifted) return
  if (keep.length) item.powers = keep
  else delete item.powers
  if (countedBefore && !item.equipped) {
    item.equipped = true
    warnings.push(`${path}: "${item.name}" is now equipped: a spell DC or spell attack bonus counts only while the item is equipped (like AC), and it counted before.`)
  }
}

// Since 2026-09-29 an attack can name the item it is made with (Attack.itemId). A file without the
// field (older, or written by hand) gets it on read: the attack is linked to the item whose name its own
// name starts with ("Staff of Ages (+3)" -> "Staff of Ages"; the longest such name wins, an equipped item
// before an unequipped one of the same name). An attack no item matches gets null, so the guess is made
// once: adding a "Chain hook" item later does not quietly link the old "Chain hook" attack. Like the
// spell bonuses above, this runs on every read, not as a version step (schema 3 files exist without it).

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const WORD_CHAR = /[\p{L}\p{N}]/u

/** The item an attack's name starts with (whole words), or undefined. */
export function itemForAttackName(name: string, items: readonly Item[]): Item | undefined {
  const a = normName(name)
  let best: Item | undefined
  for (const i of items) {
    const n = normName(i.name)
    if (!n || !a.startsWith(n)) continue
    // "Staff" must not match "Staffordshire": the item's name ends at a word boundary of the attack's
    if (a.length > n.length && WORD_CHAR.test(a[n.length]) && WORD_CHAR.test(n[n.length - 1])) continue
    const longer = !best || n.length > normName(best.name).length
    const sameButEquipped = !!best && n.length === normName(best.name).length && i.equipped && !best.equipped
    if (longer || sameButEquipped) best = i
  }
  return best
}

/** Links attacks without the field to their item (see above); a link to an item that is gone becomes null. */
export function linkAttacks(attacks: Attack[], items: readonly Item[], warnings: string[]) {
  attacks.forEach((a, i) => {
    const p = `attacks[${i}]`
    if (a.itemId === undefined) {
      const item = itemForAttackName(a.name, items)
      a.itemId = item ? item.id : null
      if (item) warnings.push(`${p}: "${a.name}" is now linked to the item "${item.name}" (by name); change it in the attack's editor.`)
    } else if (a.itemId && !items.some((x) => x.id === a.itemId)) {
      warnings.push(`${p}: "${a.name}" was linked to an item that is not in the inventory; the link was removed.`)
      a.itemId = null
    }
  })
}

// Since 2026-10-03 a feature can spend the uses of another one (Feature.poolId, Feature.cost): Turn Undead
// spends Channel Divinity. The link is an id, like Attack.itemId. A file written by hand may name the pool
// instead ("poolId": "Channel Divinity"): when exactly one other feature has that name the link is made by
// name, and said. A link to nothing is removed and said, so a card never fails to spend in silence.

/** Checks the pool links of the (already read) features, in place. */
export function linkPools(features: Feature[], warnings: string[]) {
  features.forEach((f, i) => {
    if (f.poolId === undefined) return
    const p = `features[${i}]`
    const unlink = () => {
      delete f.poolId
      delete f.cost
    }
    let pool = features.find((x) => x.id === f.poolId)
    if (!pool) {
      const named = features.filter((x) => x !== f && normName(x.name) === normName(f.poolId!))
      if (named.length === 1) {
        pool = named[0]
        warnings.push(`${p}: "${f.name}" now spends the uses of "${pool.name}" (poolId was its name; it is the feature's id now).`)
        f.poolId = pool.id
      }
    }
    if (!pool) {
      warnings.push(`${p}: "${f.name}" spent the uses of a feature that is not in the list (poolId "${f.poolId}"); the link was removed, so its card spends nothing. Set it again in the feature's editor ("Spends uses of").`)
      return unlink()
    }
    if (pool === f) {
      warnings.push(`${p}: "${f.name}" named itself as the feature whose uses it spends (poolId); the link was removed.`)
      return unlink()
    }
    if (!pool.uses) warnings.push(`${p}: "${f.name}" spends the uses of "${pool.name}", which has no counter (uses); its card spends nothing until "${pool.name}" gets one.`)
  })
}

/**
 * Repairs the links between containers and the items they are (Container.itemId), in place:
 * a link to an item that is gone is removed (the container stays, loose); an item two containers claim
 * stays with the first; and a loop (a bag inside itself, possibly through another bag) is broken by
 * removing the link of one bag in it, so every item hangs somewhere. Nothing is deleted.
 */
export function checkContainerItems(containers: Container[], items: readonly Item[], warnings: string[]) {
  const claimed = new Set<string>()
  containers.forEach((k, i) => {
    if (!k.itemId) return
    const item = items.find((x) => x.id === k.itemId)
    const why = !item ? 'an item that is not in the inventory' : claimed.has(k.itemId) ? `"${item.name}", which another container already is` : null
    if (why) {
      warnings.push(`inventory.containers[${i}]: "${k.name}" was linked to ${why}; the link was removed (the container and its items stay).`)
      containers[i] = withoutItemLink(k)
    } else claimed.add(k.itemId)
  })
  const inv = { inventory: { containers, items: items as Item[] } } as Pick<Character, 'inventory'>
  for (let i = 0; i < containers.length; i++) {
    // where things are kept, worn or not: a worn bag in a loop would close it when taken off
    const chain = chainOf(inv, containers[i], { stored: true })
    const last = chain[chain.length - 1]
    if (!last.itemId) continue
    const item = items.find((x) => x.id === last.itemId)
    if (!item) continue
    const where = containers.find((k) => k.id === item.containerId) ?? containers[0]
    if (!chain.includes(where)) continue
    const at = containers.indexOf(last)
    warnings.push(`inventory.containers[${at}]: "${last.name}" was inside itself (through its item "${item.name}"); the link to the item was removed so nothing is lost.`)
    containers[at] = withoutItemLink(last)
    i = -1 // look again from the start: the array changed
  }
}

// Since 2026-10-11 what is spent is checked against what there is: a counter with more used than its
// maximum (a file written by hand: "max": 2, "used": 3; a level typed down), more spell slots or Hit Point
// Dice spent than the hero has. The sheet already showed such a counter as empty, so nothing looks
// different; the number is brought down to the maximum and the import says so. A maximum that is a formula
// the app cannot work out is left alone, as is a Hit Point Die of a size the hero's classes do not have.
// Like the other repairs this runs on every read.

/** Brings every "used" down to its maximum, in place. */
export function checkUsed(c: Character, warnings: string[]) {
  const counter = (u: Uses | undefined, path: string, what: string) => {
    if (!u) return
    const r = evalFormula(c, u.max)
    if (r.error || r.unknown.length || !Number.isFinite(r.value)) return
    const max = Math.max(0, Math.floor(r.value))
    if (u.used <= max) return
    warnings.push(`${path}.used: ${what} has ${u.used} used of a maximum of ${max}; using ${max}.`)
    u.used = max
  }
  c.features.forEach((f, i) => counter(f.uses, `features[${i}].uses`, `"${f.name}"`))
  c.spells.forEach((s, i) => counter(s.freeCasts, `spells[${i}].freeCasts`, `"${s.name}"`))
  c.inventory.items.forEach((it, i) => {
    counter(it.charges, `inventory.items[${i}].charges`, `"${it.name}"`)
    it.powers?.forEach((p, j) => counter(p.uses, `inventory.items[${i}].powers[${j}].uses`, `"${p.name}" of "${it.name}"`))
  })
  // a creature in play: uses spent per action, against the stat block's maximum
  c.creatures?.forEach((k, i) =>
    k.inPlay?.forEach((inst, j) => {
      if (!inst.used) return
      for (const a of k.actions) {
        const used = inst.used[a.id]
        if (!a.uses || used === undefined) continue
        const u = { ...a.uses, used }
        counter(u, `creatures[${i}].inPlay[${j}]`, `"${a.name}" of "${k.name}"`)
        inst.used[a.id] = u.used
      }
    }),
  )
  const slots = spellSlots(c)
  c.spellcasting.slotsUsed.forEach((used, i) => {
    const max = (slots[i] ?? 0) + (c.spellcasting.bonusSlots?.[i] ?? 0)
    if (used <= max) return
    warnings.push(`spellcasting.slotsUsed[${i}]: ${used} level ${i + 1} slots used, the hero has ${max}; using ${max}.`)
    c.spellcasting.slotsUsed[i] = max
  })
  const pact = pactSlots(c).slots
  if (c.spellcasting.pactSlotsUsed > pact) {
    warnings.push(`spellcasting.pactSlotsUsed: ${c.spellcasting.pactSlotsUsed} Pact Magic slots used, the hero has ${pact}; using ${pact}.`)
    c.spellcasting.pactSlotsUsed = pact
  }
  const dice = hitDicePool(c)
  for (const [die, used] of Object.entries(c.combat.hitDiceUsed)) {
    if (dice[die] === undefined || used <= dice[die]) continue
    warnings.push(`combat.hitDiceUsed.${die}: ${used} used, the hero has ${dice[die]}; using ${dice[die]}.`)
    c.combat.hitDiceUsed[die] = dice[die]
  }
}

export function migrate(raw: Obj, from: number, warnings: string[]): Obj {
  let out = raw
  for (let v = Math.max(1, Math.floor(from)); v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (step) out = step(out, warnings)
  }
  return out
}

const ACTIVATION_ALIASES: Record<string, Activation> = {
  'bonus action': 'bonus',
  bonusaction: 'bonus',
  'bonus-action': 'bonus',
  magic: 'action',
  'magic action': 'action',
  none: 'passive',
  always: 'passive',
  'no action': 'free',
}
const RECHARGE_ALIASES: Record<string, Recharge> = {
  'short rest': 'short',
  shortrest: 'short',
  'long rest': 'long',
  longrest: 'long',
  day: 'dawn',
  daily: 'dawn',
}
const SOURCE_ALIASES: Record<string, SourceType> = { race: 'species', magic: 'item', 'magic item': 'item' }
const ABILITY_ALIASES: Record<string, Ability> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

export function normalizeCharacter(input: unknown): NormalizeResult {
  const warnings: string[] = []
  const r = makeReader(warnings)
  if (!isObj(input)) throw new ImportError('The file does not contain a character object (expected { ... }).')
  // a file without schemaVersion is read as the oldest format (1): its fields mean what they meant then
  const version = r.num(input.schemaVersion, 'schemaVersion', 1)
  if (version > CURRENT_SCHEMA_VERSION)
    throw new ImportError(
      `This file uses schema version ${version}, but this app only knows version ${CURRENT_SCHEMA_VERSION}. Update the app: open it while online, press Reload on the "New version ready" row (or close the app and open it again), then import the file again.`,
    )
  const raw = migrate(input, version, warnings)
  const keep = (src: unknown, out: object, known: readonly string[], path: string) => {
    if (isObj(src)) keepUnknown(src, out, known, path, warnings)
  }
  const powerCost = (v: unknown, path: string): PowerCost | undefined => {
    if (v === undefined || v === null || v === '' || v === 0 || v === '0') return undefined
    if (typeof v === 'string' && /^(all|all charges)$/i.test(v.trim())) return 'all'
    const n = r.num(v, path, 0, 0)
    return n > 0 ? Math.round(n) : undefined
  }

  const ability = (v: unknown, path: string): Ability | undefined => {
    const s = String(v ?? '').toLowerCase()
    if ((ABILITIES as readonly string[]).includes(s)) return s as Ability
    if (ABILITY_ALIASES[s]) return ABILITY_ALIASES[s]
    warnings.push(`${path}: unknown ability "${String(v)}", ignored.`)
    return undefined
  }

  const uses = (v: unknown, path: string): Uses | undefined => {
    if (v === undefined || v === null) return undefined
    if (typeof v === 'number' || typeof v === 'string') return { max: r.formula(v, path, 1), used: 0, recharge: 'long' }
    if (!isObj(v)) {
      warnings.push(`${path}: expected an object like { "max": 2, "recharge": "long" }, ignored.`)
      return undefined
    }
    const out: Uses = {
      max: r.formula(v.max, `${path}.max`, 1),
      used: r.num(v.used, `${path}.used`, 0, 0),
      recharge: r.oneOf(v.recharge, RECHARGES, `${path}.recharge`, 'long', RECHARGE_ALIASES),
    }
    if (v.shortRestRegain !== undefined) out.shortRestRegain = r.formula(v.shortRestRegain, `${path}.shortRestRegain`, 0)
    if (v.regain !== undefined && v.regain !== '') out.regain = r.str(v.regain, `${path}.regain`)
    if (v.note !== undefined) out.note = r.str(v.note, `${path}.note`)
    if (v.resource !== undefined && v.resource !== null && v.resource !== '') {
      const res = String(v.resource).toLowerCase().trim()
      if ((USES_RESOURCES as readonly string[]).includes(res)) out.resource = res as Uses['resource']
      else warnings.push(`${path}.resource: "${String(v.resource)}" is not one of ${USES_RESOURCES.join(', ')}; ignored.`)
    }
    keep(v, out, KNOWN.uses, path)
    return out
  }

  // ----- abilities -----
  const abilitiesRaw = isObj(raw.abilities) ? raw.abilities : {}
  if (raw.abilities !== undefined && !isObj(raw.abilities)) warnings.push('abilities: expected an object, using 10s.')
  const abilities = {} as Record<Ability, number>
  for (const a of ABILITIES) {
    const long = Object.entries(ABILITY_ALIASES).find(([, v]) => v === a)![0]
    abilities[a] = r.num(abilitiesRaw[a] ?? abilitiesRaw[long], `abilities.${a}`, 10, 1, 30)
  }
  keep(abilitiesRaw, abilities, KNOWN.abilities, 'abilities')

  // ----- classes -----
  const classes: ClassEntry[] = []
  r.arr(raw.classes, 'classes').forEach((k, i) => {
    const p = `classes[${i}]`
    if (typeof k === 'string') k = { id: k, level: 1 }
    if (!isObj(k)) return warnings.push(`${p}: expected an object, ignored.`)
    const srd = srdClass(String(k.id ?? k.name ?? ''))
    const rawId = r.str(k.id ?? k.name, `${p}.id`, `class-${i + 1}`)
    const id = srd?.id ?? rawId.toLowerCase()
    const entry: ClassEntry = {
      id,
      name: r.str(k.name, `${p}.name`, srd?.name ?? rawId),
      level: Math.round(r.num(k.level, `${p}.level`, 1, 1, 20)),
    }
    if (k.subclass) entry.subclass = r.str(k.subclass, `${p}.subclass`)
    if (k.hitDie !== undefined) {
      const hd = String(k.hitDie).replace(/^d/i, '')
      entry.hitDie = r.num(hd, `${p}.hitDie`, 8, 4, 20)
    } else if (!srd) warnings.push(`${p}: "${entry.name}" is not an SRD class; assuming hit die d8 (set "hitDie").`)
    if (k.casterType !== undefined)
      entry.casterType = r.oneOf(k.casterType, ['full', 'half', 'third', 'pact', 'none'] as const, `${p}.casterType`, 'none')
    if (k.spellcastingAbility !== undefined) entry.spellcastingAbility = ability(k.spellcastingAbility, `${p}.spellcastingAbility`)
    keep(k, entry, KNOWN.class, p)
    classes.push(entry)
  })
  if (classes.length === 0) {
    if (raw.classes !== undefined) warnings.push('classes: no valid class found; added a level 1 Fighter placeholder.')
    classes.push({ id: 'fighter', name: 'Fighter', level: 1 })
  }
  if (classes.reduce((s, k) => s + k.level, 0) > 20) warnings.push('Total level is above 20.')

  // ----- proficiencies -----
  const prof = isObj(raw.proficiencies) ? raw.proficiencies : {}
  const skills: Partial<Record<string, SkillProficiency>> = {}
  const skillsRaw = prof.skills
  const skillKey = (s: string) => {
    const k = s.replace(/[\s_-]+(\w)/g, (_, ch: string) => ch.toUpperCase()).replace(/^\w/, (ch) => ch.toLowerCase())
    return SKILL_IDS.find((id) => id.toLowerCase() === k.toLowerCase())
  }
  if (Array.isArray(skillsRaw)) {
    // ["perception", "stealth"] = proficient
    for (const s of skillsRaw) {
      const id = skillKey(String(s))
      if (id) skills[id] = 'proficient'
      else warnings.push(`proficiencies.skills: unknown skill "${String(s)}".`)
    }
  } else if (isObj(skillsRaw)) {
    for (const [s, v] of Object.entries(skillsRaw)) {
      const id = skillKey(s)
      if (!id) {
        warnings.push(`proficiencies.skills: unknown skill "${s}".`)
        continue
      }
      const val = v === true ? 'proficient' : v === false ? 'none' : v
      skills[id] = r.oneOf(val, ['none', 'proficient', 'expertise'] as const, `proficiencies.skills.${s}`, 'proficient')
    }
  }

  // ----- combat -----
  const combat = isObj(raw.combat) ? raw.combat : {}
  const hpRaw = isObj(combat.hp) ? combat.hp : {}
  const hpMax = r.num(hpRaw.max, 'combat.hp.max', 10, 1)
  const hitDiceUsed: Record<string, number> = {}
  if (isObj(combat.hitDiceUsed))
    for (const [d, n] of Object.entries(combat.hitDiceUsed)) hitDiceUsed[d.startsWith('d') ? d : `d${d}`] = r.num(n, `combat.hitDiceUsed.${d}`, 0, 0)
  const dsRaw = isObj(combat.deathSaves) ? combat.deathSaves : {}

  const speciesRaw = raw.species ?? raw.race
  const species = isObj(speciesRaw)
    ? { name: r.str(speciesRaw.name, 'species.name'), size: r.str(speciesRaw.size, 'species.size', 'Medium') }
    : { name: r.str(speciesRaw, 'species'), size: 'Medium' }

  // ----- features -----
  const features: Feature[] = []
  r.arr(raw.features, 'features').forEach((f, i) => {
    const p = `features[${i}]`
    if (typeof f === 'string') f = { name: f }
    if (!isObj(f)) return warnings.push(`${p}: expected an object, ignored.`)
    let source: Feature['source'] = { type: 'other', name: '' }
    if (isObj(f.source))
      source = { type: r.oneOf(f.source.type, SOURCE_TYPES, `${p}.source.type`, 'other', SOURCE_ALIASES), name: r.str(f.source.name, `${p}.source.name`) }
    else if (typeof f.source === 'string') {
      const t = f.source.toLowerCase()
      source = (SOURCE_TYPES as readonly string[]).includes(t) || SOURCE_ALIASES[t]
        ? { type: (SOURCE_ALIASES[t] ?? t) as SourceType, name: '' }
        : { type: 'other', name: f.source }
    }
    const feat: Feature = {
      id: r.str(f.id, `${p}.id`) || newId(),
      name: r.str(f.name, `${p}.name`, 'Unnamed feature'),
      source,
      activation: r.oneOf(f.activation, ACTIVATIONS, `${p}.activation`, 'passive', ACTIVATION_ALIASES),
      description: r.str(f.description, `${p}.description`),
    }
    if (isObj(f.source)) keep(f.source, feat.source, KNOWN.source, `${p}.source`)
    const u = uses(f.uses, `${p}.uses`)
    if (u) feat.uses = u
    if (f.level !== undefined) feat.level = r.num(f.level, `${p}.level`, 1, 1, 20)
    const tg = r.tags(f.tags, `${p}.tags`)
    if (tg) feat.tags = tg
    // optional: the feature whose uses this one spends, and how many (linkPools below checks the link)
    const poolId = r.str(f.poolId, `${p}.poolId`).trim()
    if (poolId) feat.poolId = poolId
    if (f.cost !== undefined && f.cost !== null && f.cost !== '') {
      if (!poolId) warnings.push(`${p}.cost: ignored: a cost needs "poolId", the feature whose uses it spends.`)
      else {
        const cost = r.num(f.cost, `${p}.cost`, 1, 1)
        if (!Number.isInteger(cost)) warnings.push(`${p}.cost: ${cost} is not a whole number; using ${Math.max(1, Math.round(cost))}.`)
        feat.cost = Math.max(1, Math.round(cost))
      }
    }
    keep(f, feat, KNOWN.feature, p)
    features.push(feat)
  })
  linkPools(features, warnings)

  // ----- attacks -----
  const attacks: Attack[] = []
  r.arr(raw.attacks, 'attacks').forEach((a, i) => {
    const p = `attacks[${i}]`
    if (!isObj(a)) return warnings.push(`${p}: expected an object, ignored.`)
    const abil = String(a.ability ?? 'str').toLowerCase()
    const atk: Attack = {
      id: r.str(a.id, `${p}.id`) || newId(),
      name: r.str(a.name, `${p}.name`, 'Attack'),
      ability: abil === 'spell' || abil === 'finesse' ? abil : (ability(abil, `${p}.ability`) ?? 'str'),
      proficient: r.bool(a.proficient, true),
      bonus: r.num(a.bonus, `${p}.bonus`, 0),
      damage: r.str(a.damage, `${p}.damage`),
      damageType: r.str(a.damageType, `${p}.damageType`),
      addAbilityToDamage: r.bool(a.addAbilityToDamage, true),
      damageBonus: r.num(a.damageBonus, `${p}.damageBonus`, 0),
      mastery: r.str(a.mastery, `${p}.mastery`),
      notes: r.str(a.notes, `${p}.notes`),
    }
    // absent stays absent here: linkAttacks (after the items are read) links it by name or sets null
    if (a.itemId === null) atk.itemId = null
    else if (a.itemId !== undefined) atk.itemId = r.str(a.itemId, `${p}.itemId`) || null
    keep(a, atk, KNOWN.attack, p)
    attacks.push(atk)
  })

  // ----- spells -----
  const spells: Spell[] = []
  r.arr(raw.spells, 'spells').forEach((s, i) => {
    const p = `spells[${i}]`
    if (typeof s === 'string') s = { name: s }
    if (!isObj(s)) return warnings.push(`${p}: expected an object, ignored.`)
    const level = Math.round(r.num(s.level, `${p}.level`, 0, 0, 9))
    const sp: Spell = {
      id: r.str(s.id, `${p}.id`) || newId(),
      name: r.str(s.name, `${p}.name`, 'Unnamed spell'),
      level,
      source: r.str(s.source, `${p}.source`) || undefined,
      prepared: r.bool(s.prepared, true),
      alwaysPrepared: r.bool(s.alwaysPrepared, false),
      ritual: r.bool(s.ritual, false),
      concentration: r.bool(s.concentration, false),
      school: r.str(s.school, `${p}.school`),
      castingTime: r.str(s.castingTime, `${p}.castingTime`),
      range: r.str(s.range, `${p}.range`),
      components: r.str(s.components, `${p}.components`),
      duration: r.str(s.duration, `${p}.duration`),
      description: r.str(s.description, `${p}.description`),
    }
    if (s.castingAbility !== undefined && s.castingAbility !== null && s.castingAbility !== '') {
      const ab = ability(s.castingAbility, `${p}.castingAbility`)
      if (ab) sp.castingAbility = ab
    }
    const fc = uses(s.freeCasts, `${p}.freeCasts`)
    if (fc) sp.freeCasts = fc
    const tg = r.tags(s.tags, `${p}.tags`)
    if (tg) sp.tags = tg
    keep(s, sp, KNOWN.spell, p)
    spells.push(sp)
  })

  // ----- spellcasting state -----
  const scRaw = isObj(raw.spellcasting) ? raw.spellcasting : {}
  const slotsUsed = Array.from({ length: 9 }, (_, i) => r.num(r.arr(scRaw.slotsUsed, 'spellcasting.slotsUsed')[i], `spellcasting.slotsUsed[${i}]`, 0, 0))
  const spellcasting: Character['spellcasting'] = {
    slotsUsed,
    pactSlotsUsed: r.num(scRaw.pactSlotsUsed, 'spellcasting.pactSlotsUsed', 0, 0),
    concentration: r.str(scRaw.concentration, 'spellcasting.concentration'),
  }
  if (Array.isArray(scRaw.slotsOverride))
    spellcasting.slotsOverride = scRaw.slotsOverride.slice(0, 9).map((v, i) => r.num(v, `spellcasting.slotsOverride[${i}]`, 0, 0))
  if (isObj(scRaw.pactOverride))
    spellcasting.pactOverride = {
      slots: r.num(scRaw.pactOverride.slots, 'spellcasting.pactOverride.slots', 0, 0),
      level: r.num(scRaw.pactOverride.level, 'spellcasting.pactOverride.level', 1, 1, 9),
    }
  if (spellcasting.pactOverride) keep(scRaw.pactOverride, spellcasting.pactOverride, KNOWN.pactOverride, 'spellcasting.pactOverride')
  if (scRaw.bonusSlots !== undefined && scRaw.bonusSlots !== null) {
    const bs = r.arr(scRaw.bonusSlots, 'spellcasting.bonusSlots')
    spellcasting.bonusSlots = Array.from({ length: 9 }, (_, i) => Math.round(r.num(bs[i], `spellcasting.bonusSlots[${i}]`, 0, 0)))
  }
  keep(scRaw, spellcasting, KNOWN.spellcasting, 'spellcasting')

  // ----- inventory -----
  const invRaw = isObj(raw.inventory) ? raw.inventory : {}

  // Containers (since 2026-10-01; added to schema 3, see SCHEMA.md). A file without them gets one
  // "Backpack" and every item goes in it: nothing moves, nothing is lost, and the next read is silent.
  // Like the conversions above this runs on every read, so it covers files and browser saves alike.
  const containers: Container[] = []
  r.arr(invRaw.containers, 'inventory.containers').forEach((k, i) => {
    const p = `inventory.containers[${i}]`
    if (typeof k === 'string') k = { name: k }
    if (!isObj(k)) return warnings.push(`${p}: expected an object, ignored.`)
    let id = r.str(k.id, `${p}.id`).trim() || newId()
    if (containers.some((x) => x.id === id)) {
      warnings.push(`${p}: the id "${id}" is used by another container; this one got a new id (its items stay in the first one).`)
      id = newId()
    }
    const box: Container = { id, name: r.str(k.name, `${p}.name`).trim() || 'Container' }
    const icon = r.str(k.icon, `${p}.icon`).trim()
    if (icon) box.icon = icon
    const color = r.str(k.color, `${p}.color`).trim()
    if (color) box.color = color
    if (k.capacity !== undefined && k.capacity !== null && k.capacity !== '') {
      const cap = r.num(k.capacity, `${p}.capacity`, 0, 0)
      if (cap > 0) box.capacity = cap
    }
    if (r.bool(k.weightless)) box.weightless = true
    if (r.bool(k.extradimensional)) box.extradimensional = true
    const itemId = r.str(k.itemId, `${p}.itemId`).trim()
    if (itemId) box.itemId = itemId
    keep(k, box, KNOWN.container, p)
    containers.push(box)
  })
  if (containers.length === 0) containers.push({ ...DEFAULT_CONTAINER })

  // Categories: the player's own and renamed built-in ones. An item's category the list does not have
  // (a deleted category, a hand-written file) gets an entry with that name, so it is not silently lost.
  const categories: ItemCategory[] = []
  r.arr(invRaw.categories, 'inventory.categories').forEach((k, i) => {
    const p = `inventory.categories[${i}]`
    if (typeof k === 'string') k = { id: k, name: k }
    if (!isObj(k)) return warnings.push(`${p}: expected an object, ignored.`)
    const id = r.str(k.id ?? k.name, `${p}.id`).trim()
    if (!id) return warnings.push(`${p}: a category without an id or name, ignored.`)
    if (categories.some((x) => x.id === id)) return warnings.push(`${p}: the category "${id}" is listed twice; the second was ignored.`)
    const cat: ItemCategory = { id, name: r.str(k.name, `${p}.name`).trim() || id }
    const icon = r.str(k.icon, `${p}.icon`).trim()
    if (icon) cat.icon = icon
    const color = r.str(k.color, `${p}.color`).trim()
    if (color) cat.color = color
    keep(k, cat, KNOWN.category, p)
    categories.push(cat)
  })

  // one item, as in the inventory; also the template of a recipe's output (readTemplate below)
  const readItem = (it: unknown, p: string): Item | undefined => {
    if (typeof it === 'string') it = { name: it }
    if (!isObj(it)) {
      warnings.push(`${p}: expected an object, ignored.`)
      return undefined
    }
    const item: Item = {
      id: r.str(it.id, `${p}.id`) || newId(),
      name: r.str(it.name, `${p}.name`, 'Item'),
      quantity: r.num(it.quantity, `${p}.quantity`, 1, 0),
      equipped: r.bool(it.equipped, false),
      requiresAttunement: r.bool(it.requiresAttunement, false),
      attuned: r.bool(it.attuned, false),
      description: r.str(it.description, `${p}.description`),
    }
    if (it.weight !== undefined) item.weight = r.num(it.weight, `${p}.weight`, 0, 0)
    if (isObj(it.armor))
      item.armor = {
        base: r.num(it.armor.base, `${p}.armor.base`, 10),
        dexCap: it.armor.dexCap === null || it.armor.dexCap === undefined ? null : r.num(it.armor.dexCap, `${p}.armor.dexCap`, 0, 0),
      }
    if (it.acBonus !== undefined) item.acBonus = r.num(it.acBonus, `${p}.acBonus`, 0)
    if (it.saveBonus !== undefined) item.saveBonus = r.num(it.saveBonus, `${p}.saveBonus`, 0)
    const ch = uses(it.charges, `${p}.charges`)
    if (ch) item.charges = ch
    if (it.activation !== undefined) item.activation = r.oneOf(it.activation, ACTIVATIONS, `${p}.activation`, 'action', ACTIVATION_ALIASES)
    if (item.attuned && !item.requiresAttunement) item.requiresAttunement = true
    if (item.armor) keep(it.armor, item.armor, KNOWN.armor, `${p}.armor`)
    if (it.powers !== undefined) {
      const powers: ItemPower[] = []
      r.arr(it.powers, `${p}.powers`).forEach((w, j) => {
        const pp = `${p}.powers[${j}]`
        if (typeof w === 'string') w = { name: w }
        if (!isObj(w)) return warnings.push(`${pp}: expected an object, ignored.`)
        const pw: ItemPower = {
          id: r.str(w.id, `${pp}.id`) || newId(),
          name: r.str(w.name, `${pp}.name`, 'Unnamed power'),
          activation: r.oneOf(w.activation, ACTIVATIONS, `${pp}.activation`, 'action', ACTIVATION_ALIASES),
          description: r.str(w.description, `${pp}.description`),
        }
        const cost = powerCost(w.cost, `${pp}.cost`)
        if (cost !== undefined) pw.cost = cost
        const pu = uses(w.uses, `${pp}.uses`)
        if (pu) pw.uses = pu
        const tg = r.tags(w.tags, `${pp}.tags`)
        if (tg) pw.tags = tg
        keep(w, pw, KNOWN.power, pp)
        powers.push(pw)
      })
      if (powers.length) item.powers = powers
    }
    if (it.spellDcBonus !== undefined) item.spellDcBonus = r.num(it.spellDcBonus, `${p}.spellDcBonus`, 0) || undefined
    if (it.spellAttackBonus !== undefined) item.spellAttackBonus = r.num(it.spellAttackBonus, `${p}.spellAttackBonus`, 0) || undefined
    if (it.abilityScores !== undefined && it.abilityScores !== null) {
      const list: ItemAbilityScore[] = []
      r.arr(it.abilityScores, `${p}.abilityScores`).forEach((x, j) => {
        const pp = `${p}.abilityScores[${j}]`
        if (!isObj(x)) return warnings.push(`${pp}: expected an object like { "ability": "con", "mode": "set", "value": 19 }, ignored.`)
        const ab = ability(x.ability, `${pp}.ability`)
        if (!ab) return
        const mode = r.oneOf(x.mode, ABILITY_SCORE_MODES, `${pp}.mode`, 'add', { '+': 'add', bonus: 'add', plus: 'add', '=': 'set', becomes: 'set', to: 'set' })
        if (x.value === undefined || x.value === null || x.value === '') return warnings.push(`${pp}: no value, ignored.`)
        const value = Math.round(mode === 'set' ? r.num(x.value, `${pp}.value`, 10, 1, 30) : r.num(x.value, `${pp}.value`, 0, -30, 30))
        if (mode === 'add' && value === 0) return
        const entry: ItemAbilityScore = { ability: ab, mode, value }
        if (x.max !== undefined && x.max !== null && x.max !== '') {
          if (mode === 'set') warnings.push(`${pp}.max: ignored: a score that is set has no maximum (the item sets it to ${value} unless it is already higher).`)
          else entry.max = Math.round(r.num(x.max, `${pp}.max`, 20, 1, 30))
        }
        keep(x, entry, KNOWN.abilityScore, pp)
        list.push(entry)
      })
      if (list.length) item.abilityScores = list
    }
    if (it.saveDc !== undefined && it.saveDc !== null && it.saveDc !== '') item.saveDc = Math.round(r.num(it.saveDc, `${p}.saveDc`, 13, 1, 40))
    if (it.spellAttack !== undefined && it.spellAttack !== null && it.spellAttack !== '') item.spellAttack = Math.round(r.num(it.spellAttack, `${p}.spellAttack`, 5, -20, 40))
    liftSpellBonusPowers(item, p, warnings)
    const tg = r.tags(it.tags, `${p}.tags`)
    if (tg) item.tags = tg
    const where = r.str(it.containerId, `${p}.containerId`).trim()
    if (where && !containers.some((k) => k.id === where))
      warnings.push(`${p}: "${item.name}" was in a container that does not exist; it is now in "${containers[0].name}".`)
    item.containerId = containers.some((k) => k.id === where) ? where : containers[0].id
    const cat = r.str(it.category, `${p}.category`).trim()
    if (cat) {
      item.category = cat
      if (!isBuiltinCategory(cat) && !categories.some((k) => k.id === cat)) {
        categories.push({ id: cat, name: cat })
        warnings.push(`${p}: the category "${cat}" was not in the list of categories; it was added.`)
      }
    }
    keep(it, item, KNOWN.item, p)
    return item
  }
  const items: Item[] = []
  r.arr(invRaw.items ?? raw.items, 'inventory.items').forEach((it, i) => {
    const item = readItem(it, `inventory.items[${i}]`)
    if (item) items.push(item)
  })
  checkContainerItems(containers, items, warnings)
  linkAttacks(attacks, items, warnings)
  const attuned = items.filter((i) => i.attuned)
  if (attuned.length > 3) {
    warnings.push(`More than 3 attuned items (${attuned.length}); only the first 3 stay attuned.`)
    attuned.slice(3).forEach((i) => (i.attuned = false))
  }
  const moneyRaw = isObj(invRaw.money) ? invRaw.money : isObj(raw.money) ? raw.money : {}
  const money = {
    cp: r.num(moneyRaw.cp, 'money.cp', 0, 0),
    sp: r.num(moneyRaw.sp, 'money.sp', 0, 0),
    ep: r.num(moneyRaw.ep, 'money.ep', 0, 0),
    gp: r.num(moneyRaw.gp, 'money.gp', 0, 0),
    pp: r.num(moneyRaw.pp, 'money.pp', 0, 0),
  }
  keep(moneyRaw, money, KNOWN.money, 'inventory.money')

  // ----- roleplay -----
  const rp = isObj(raw.roleplay) ? raw.roleplay : {}
  const rpKeys = ['appearance', 'personality', 'ideals', 'bonds', 'flaws', 'voice', 'mannerisms', 'goals', 'backstory', 'allies', 'notes'] as const
  const roleplay = Object.fromEntries(rpKeys.map((k) => [k, r.str(rp[k], `roleplay.${k}`)])) as unknown as Character['roleplay']
  keep(rp, roleplay, KNOWN.roleplay, 'roleplay')

  const sessionNotes: SessionNote[] = []
  r.arr(raw.sessionNotes, 'sessionNotes').forEach((n, i) => {
    if (typeof n === 'string') n = { text: n }
    if (!isObj(n)) return warnings.push(`sessionNotes[${i}]: expected an object, ignored.`)
    const note: SessionNote = {
      id: r.str(n.id, `sessionNotes[${i}].id`) || newId(),
      date: r.str(n.date, `sessionNotes[${i}].date`),
      title: r.str(n.title, `sessionNotes[${i}].title`),
      text: r.str(n.text, `sessionNotes[${i}].text`),
    }
    keep(n, note, KNOWN.sessionNote, `sessionNotes[${i}]`)
    sessionNotes.push(note)
  })

  // ----- XP log and day timers (schema 3) -----
  const xpLog: XpEntry[] = []
  r.arr(raw.xpLog, 'xpLog').forEach((e, i) => {
    const p = `xpLog[${i}]`
    if (!isObj(e)) return warnings.push(`${p}: expected an object, ignored.`)
    const entry: XpEntry = {
      id: r.str(e.id, `${p}.id`) || newId(),
      date: r.str(e.date, `${p}.date`),
      kind: r.oneOf(e.kind, ['session', 'correction'] as const, `${p}.kind`, 'session'),
      amount: Math.round(r.num(e.amount, `${p}.amount`, 0)),
    }
    if (e.groupXp !== undefined) entry.groupXp = Math.round(r.num(e.groupXp, `${p}.groupXp`, 0, 0))
    if (e.players !== undefined) entry.players = Math.round(r.num(e.players, `${p}.players`, 1, 1))
    keep(e, entry, KNOWN.xpEntry, p)
    xpLog.push(entry)
  })
  const timers: DayTimer[] = []
  r.arr(raw.timers, 'timers').forEach((tm, i) => {
    const p = `timers[${i}]`
    if (typeof tm === 'string') tm = { name: tm }
    if (!isObj(tm)) return warnings.push(`${p}: expected an object, ignored.`)
    const days = Math.round(r.num(tm.days, `${p}.days`, 0, 0))
    const timer: DayTimer = {
      id: r.str(tm.id, `${p}.id`) || newId(),
      name: r.str(tm.name, `${p}.name`) || 'Timer',
      days,
      start: Math.round(r.num(tm.start, `${p}.start`, days, 0)),
    }
    const note = r.str(tm.note, `${p}.note`)
    if (note) timer.note = note
    keep(tm, timer, KNOWN.timer, p)
    timers.push(timer)
  })

  // ----- images (maps): the list stays on the character, the pictures themselves (`data`) go to the caller -----
  const images: CharacterImage[] = []
  const imageData: Record<string, string> = {}
  // ----- what is marked on a map (since 2026-10-11, optional: an image without marks is read as before) -----
  /** A place on the picture: x and y from 0 to 1. A missing or wrong one lands in the middle, with a warning. */
  const mapXY = (o: Obj, p: string): MapPoint => {
    if (o.x === undefined || o.y === undefined) warnings.push(`${p}: no x or y; put in the middle of the picture.`)
    return { x: r.num(o.x, `${p}.x`, 0.5, 0, 1), y: r.num(o.y, `${p}.y`, 0.5, 0, 1) }
  }
  const markColor = (v: unknown, p: string): string | undefined => {
    const s = r.str(v, p).trim().toLowerCase()
    if (!s) return undefined
    if (isMarkColor(s)) return s
    warnings.push(`${p}: "${s}" is not a colour like "#d0583f"; using the default colour.`)
    return undefined
  }
  /** A list of marks with ids of their own: a missing id is made up, a repeated one replaced. */
  const markList = <T extends { id: string }>(v: unknown, p: string, read: (o: Obj, id: string, path: string, i: number) => T): T[] => {
    const out: T[] = []
    r.arr(v, p).forEach((o, i) => {
      const path = `${p}[${i}]`
      if (!isObj(o)) return warnings.push(`${path}: expected an object, ignored.`)
      let id = r.str(o.id, `${path}.id`) || newId()
      if (out.some((x) => x.id === id)) {
        warnings.push(`${path}: the id "${id}" is used twice; this one got a new id.`)
        id = newId()
      }
      out.push(read(o, id, path, i))
    })
    return out
  }
  const readPin = (o: Obj, id: string, p: string, i: number): MapPin => {
    const pin: MapPin = { id, name: r.str(o.name, `${p}.name`).trim() || `Pin ${i + 1}`, ...mapXY(o, p) }
    const note = r.str(o.note, `${p}.note`).trim()
    if (note) pin.note = note
    const color = markColor(o.color, `${p}.color`)
    if (color) pin.color = color
    // "pin" is the default: read, not written
    const icon = r.oneOf(o.icon, PIN_ICONS, `${p}.icon`, 'pin')
    if (icon !== 'pin') pin.icon = icon
    keep(o, pin, KNOWN.pin, p)
    return pin
  }
  const readToken = (o: Obj, id: string, p: string, i: number): MapToken => {
    const token: MapToken = { id, name: r.str(o.name, `${p}.name`).trim() || `Token ${i + 1}`, ...mapXY(o, p) }
    const label = r.str(o.label, `${p}.label`).trim()
    if (label) {
      token.label = [...label].slice(0, 3).join('')
      if (token.label !== label) warnings.push(`${p}.label: "${label}" is too long for a token; cut to "${token.label}".`)
    }
    const color = markColor(o.color, `${p}.color`)
    if (color) token.color = color
    const note = r.str(o.note, `${p}.note`).trim()
    if (note) token.note = note
    keep(o, token, KNOWN.token, p)
    return token
  }
  /** A point of a route or an end of the scale: only x and y. */
  const plainPoint = (v: unknown, p: string): MapPoint | null => {
    if (!isObj(v)) {
      warnings.push(`${p}: expected a point { x, y }, ignored.`)
      return null
    }
    const point = mapXY(v, p)
    keep(v, point, KNOWN.mapPoint, p)
    return point
  }
  /** A day's travel: a number above 0, or nothing. */
  const perDayOf = (v: unknown, p: string): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined
    const n = r.num(v, p, 0)
    if (n > 0) return n
    warnings.push(`${p}: a day's travel must be above 0, ignored.`)
    return undefined
  }
  const readRoute = (o: Obj, id: string, p: string, i: number): MapRoute => {
    const route: MapRoute = { id, name: r.str(o.name, `${p}.name`).trim() || `Route ${i + 1}`, points: [] }
    const color = markColor(o.color, `${p}.color`)
    if (color) route.color = color
    route.points = r
      .arr(o.points, `${p}.points`)
      .map((x, j) => plainPoint(x, `${p}.points[${j}]`))
      .filter((x): x is MapPoint => !!x)
    if (!route.points.length) warnings.push(`${p}: a route without points, dropped.`)
    const perDay = perDayOf(o.perDay, `${p}.perDay`)
    if (perDay) route.perDay = perDay
    keep(o, route, KNOWN.route, p)
    return route
  }
  const readScale = (v: unknown, p: string): MapScale | null => {
    if (!isObj(v)) {
      warnings.push(`${p}: expected an object, ignored.`)
      return null
    }
    const a = plainPoint(v.a, `${p}.a`)
    const b = plainPoint(v.b, `${p}.b`)
    const distance = r.num(v.distance, `${p}.distance`, 0)
    if (!a || !b || (a.x === b.x && a.y === b.y) || !(distance > 0)) {
      warnings.push(`${p}: a scale needs two different points (a, b) and a distance above 0; dropped, routes show no numbers.`)
      return null
    }
    const scale: MapScale = { a, b, distance }
    const unit = r.str(v.unit, `${p}.unit`).trim()
    // "mi" is the default: read, not written
    if (unit && unit !== 'mi') scale.unit = unit
    const perDay = perDayOf(v.perDay, `${p}.perDay`)
    if (perDay) scale.perDay = perDay
    keep(v, scale, KNOWN.mapScale, p)
    return scale
  }
  r.arr(raw.images, 'images').forEach((im, i) => {
    const p = `images[${i}]`
    if (!isObj(im)) return warnings.push(`${p}: expected an object, ignored.`)
    let id = r.str(im.id, `${p}.id`) || newId()
    if (images.some((x) => x.id === id)) {
      warnings.push(`${p}: the id "${id}" is used twice; this image got a new one.`)
      id = newId()
    }
    const image: CharacterImage = {
      id,
      name: r.str(im.name, `${p}.name`) || `Image ${i + 1}`,
      width: Math.round(r.num(im.width, `${p}.width`, 0, 0)),
      height: Math.round(r.num(im.height, `${p}.height`, 0, 0)),
    }
    if (im.bytes !== undefined) image.bytes = Math.round(r.num(im.bytes, `${p}.bytes`, 0, 0))
    if (im.data !== undefined && im.data !== null) {
      const d = parseImageDataUrl(im.data)
      if (d) {
        imageData[id] = im.data as string
        image.bytes = base64Bytes(d.base64)
      } else warnings.push(`${p}.data: not a picture the app can show (expected a data URL of a JPEG, PNG, WebP or GIF); "${image.name}" has no picture.`)
    }
    if (im.thumb !== undefined && im.thumb !== null) {
      if (parseImageDataUrl(im.thumb)) image.thumb = im.thumb as string
      else warnings.push(`${p}.thumb: not an image data URL, ignored.`)
    }
    keep(im, image, KNOWN.image, p)
    // the marks last, always in this order (as mapMarks.ts writes them)
    if (im.pins !== undefined && im.pins !== null) {
      const pins = markList(im.pins, `${p}.pins`, readPin)
      if (pins.length) image.pins = pins
    }
    if (im.routes !== undefined && im.routes !== null) {
      const routes = markList(im.routes, `${p}.routes`, readRoute).filter((x) => x.points.length)
      if (routes.length) image.routes = routes
    }
    if (im.tokens !== undefined && im.tokens !== null) {
      const tokens = markList(im.tokens, `${p}.tokens`, readToken)
      if (tokens.length) image.tokens = tokens
    }
    if (im.scale !== undefined && im.scale !== null) {
      const scale = readScale(im.scale, `${p}.scale`)
      if (scale) image.scale = scale
    }
    images.push(image)
  })

  // ----- creatures (since 2026-10-11, added to schema 3; optional: a file without them is read as before) -----
  const creatures: Creature[] = []
  /** Creatures in play written without Hit Points: they get the stat block's, once the hero is read (its formula may name the hero's numbers). */
  const hpFromBlock: { inst: CreatureInstance; creature: Creature }[] = []
  const instanceIds = new Set<string>()
  // a stat block prints "+10" and "−1": read as the numbers they are
  const optFormula = (v: unknown, p: string): Formula | undefined => {
    if (v === undefined || v === null || v === '') return undefined
    if (typeof v === 'string' && /^[+−-]?\d+$/.test(v.trim())) return Number(v.trim().replace('−', '-'))
    return r.formula(v, p, 0)
  }
  const conditionId = (v: unknown): string => {
    const s = String(v ?? '').trim()
    const srd = SRD_CONDITIONS.find((x) => x.id === s.toLowerCase() || x.name.toLowerCase() === s.toLowerCase())
    return srd ? srd.id : s
  }
  r.arr(raw.creatures, 'creatures').forEach((k, i) => {
    const p = `creatures[${i}]`
    if (typeof k === 'string') k = { name: k }
    if (!isObj(k)) return warnings.push(`${p}: expected an object, ignored.`)
    let id = r.str(k.id, `${p}.id`).trim() || newId()
    if (creatures.some((x) => x.id === id)) {
      warnings.push(`${p}: the id "${id}" is used by another creature; this one got a new id.`)
      id = newId()
    }
    const abRaw = isObj(k.abilities) ? k.abilities : {}
    if (k.abilities !== undefined && !isObj(k.abilities)) warnings.push(`${p}.abilities: expected an object, using 10s.`)
    const ab = {} as Record<Ability, number>
    for (const a of ABILITIES) {
      const long = Object.entries(ABILITY_ALIASES).find(([, v]) => v === a)![0]
      ab[a] = Math.round(r.num(abRaw[a] ?? abRaw[long], `${p}.abilities.${a}`, 10, 1, 30))
    }
    const kind = r.str(k.kind, `${p}.kind`).trim()
    const creature: Creature = {
      id,
      name: r.str(k.name, `${p}.name`).trim() || 'Creature',
      ...(kind ? { kind } : {}),
      ac: r.formula(k.ac, `${p}.ac`, 10),
      hp: r.formula(k.hp, `${p}.hp`, 1),
      speed: r.str(k.speed, `${p}.speed`).trim(),
      abilities: ab,
      actions: [],
    }
    if (k.hp === undefined || k.hp === null || k.hp === '') warnings.push(`${p}.hp: "${creature.name}" has no Hit Points; using 1.`)
    const hitDice = r.str(k.hitDice, `${p}.hitDice`).trim()
    if (hitDice) creature.hitDice = hitDice
    if (k.saves !== undefined && k.saves !== null) {
      if (!isObj(k.saves)) warnings.push(`${p}.saves: expected an object like { "str": 10, "con": 8 }, ignored.`)
      else {
        const saves: Partial<Record<Ability, number>> = {}
        for (const [name, v] of Object.entries(k.saves)) {
          const a = ability(name, `${p}.saves.${name}`)
          if (a && v !== null && v !== '') saves[a] = Math.round(r.num(v, `${p}.saves.${a}`, 0, -20, 40))
        }
        // in the order of the abilities, whatever the order of the file
        const ordered = Object.fromEntries(ABILITIES.filter((a) => saves[a] !== undefined).map((a) => [a, saves[a]!]))
        if (Object.keys(ordered).length) creature.saves = ordered
      }
    }
    if (k.initiative !== undefined && k.initiative !== null && k.initiative !== '') creature.initiative = Math.round(r.num(k.initiative, `${p}.initiative`, 0, -20, 40))
    for (const f of CREATURE_TEXT_FIELDS) {
      const v = r.str(k[f], `${p}.${f}`).trim()
      if (v) creature[f] = v
    }
    // the actions are read after the text fields but stand in the object where they were declared (above)
    r.arr(k.actions, `${p}.actions`).forEach((a, j) => {
      const pp = `${p}.actions[${j}]`
      if (typeof a === 'string') a = { name: a, activation: 'passive' }
      if (!isObj(a)) return warnings.push(`${pp}: expected an object, ignored.`)
      let aid = r.str(a.id, `${pp}.id`).trim() || newId()
      if (creature.actions.some((x) => x.id === aid)) {
        warnings.push(`${pp}: the id "${aid}" is used twice in this creature; this one got a new id.`)
        aid = newId()
      }
      const act: CreatureAction = {
        id: aid,
        name: r.str(a.name, `${pp}.name`).trim() || 'Unnamed',
        activation: r.oneOf(a.activation, ACTIVATIONS, `${pp}.activation`, 'action', { ...ACTIVATION_ALIASES, trait: 'passive', traits: 'passive', 'legendary action': 'special', legendary: 'special' }),
        description: r.str(a.description, `${pp}.description`),
      }
      const toHit = optFormula(a.toHit, `${pp}.toHit`)
      if (toHit !== undefined) act.toHit = toHit
      const damage = r.str(a.damage, `${pp}.damage`).trim()
      if (damage) act.damage = damage
      const damageBonus = optFormula(a.damageBonus, `${pp}.damageBonus`)
      if (damageBonus !== undefined && damageBonus !== 0) act.damageBonus = damageBonus
      const damageType = r.str(a.damageType, `${pp}.damageType`).trim()
      if (damageType) act.damageType = damageType
      const saveDc = optFormula(a.saveDc, `${pp}.saveDc`)
      if (saveDc !== undefined) act.saveDc = saveDc
      if (a.saveAbility !== undefined && a.saveAbility !== null && a.saveAbility !== '') {
        const sa = ability(a.saveAbility, `${pp}.saveAbility`)
        if (sa) act.saveAbility = sa
      }
      const u = uses(a.uses, `${pp}.uses`)
      if (u) {
        if (u.used > 0) {
          warnings.push(`${pp}.uses.used: ignored: what a creature has spent is kept per creature in play (inPlay[].used), not on the stat block.`)
          u.used = 0
        }
        act.uses = u
      }
      keep(a, act, KNOWN.creatureAction, pp)
      creature.actions.push(act)
    })
    if (k.extra !== undefined && k.extra !== null) {
      const extra: CreatureField[] = []
      // a list of { label, value }; an object { "Carries": "540 lb." } is read as the same thing
      const list = isObj(k.extra) ? Object.entries(k.extra).map(([label, value]) => ({ label, value })) : r.arr(k.extra, `${p}.extra`)
      list.forEach((x, j) => {
        const pp = `${p}.extra[${j}]`
        if (typeof x === 'string') x = { label: '', value: x }
        if (!isObj(x)) return warnings.push(`${pp}: expected an object like { "label": "Carries", "value": "540 lb." }, ignored.`)
        const line: CreatureField = { label: r.str(x.label, `${pp}.label`).trim(), value: r.str(x.value, `${pp}.value`).trim() }
        if (!line.label && !line.value) return
        keep(x, line, KNOWN.creatureExtra, pp)
        extra.push(line)
      })
      if (extra.length) creature.extra = extra
    }
    const description = r.str(k.description, `${p}.description`)
    if (description.trim()) creature.description = description
    if (k.inPlay !== undefined && k.inPlay !== null) {
      const inPlay: CreatureInstance[] = []
      r.arr(k.inPlay, `${p}.inPlay`).forEach((x, j) => {
        const pp = `${p}.inPlay[${j}]`
        // "Burya" alone = a creature of that name at full Hit Points
        if (typeof x === 'string' || typeof x === 'number') x = { label: String(x) }
        if (!isObj(x)) return warnings.push(`${pp}: expected an object, ignored.`)
        let iid = r.str(x.id, `${pp}.id`).trim() || newId()
        if (instanceIds.has(iid)) {
          warnings.push(`${pp}: the id "${iid}" is used by another creature in play; this one got a new id.`)
          iid = newId()
        }
        instanceIds.add(iid)
        const label = r.str(x.label, `${pp}.label`).trim()
        const inst: CreatureInstance = { id: iid, ...(label ? { label } : {}), hp: { current: 0, max: 0, temp: 0 } }
        // { current, max, temp }; a bare number = that many of that many; nothing = the stat block's (set below)
        const hpObj = isObj(x.hp) ? x.hp : typeof x.hp === 'number' || (typeof x.hp === 'string' && x.hp.trim() !== '') ? { max: x.hp } : null
        const given = (v: unknown) => v !== undefined && v !== null && v !== ''
        if (hpObj && given(hpObj.max)) {
          const max = Math.round(r.num(hpObj.max, `${pp}.hp.max`, 1, 1))
          inst.hp = { current: Math.round(r.num(hpObj.current, `${pp}.hp.current`, max, 0, max)), max, temp: Math.round(r.num(hpObj.temp, `${pp}.hp.temp`, 0, 0)) }
        } else {
          // the maximum comes from the stat block; a current written without it is kept, up to that maximum
          inst.hp = { current: hpObj && given(hpObj.current) ? Math.round(r.num(hpObj.current, `${pp}.hp.current`, 0, 0)) : -1, max: 0, temp: hpObj ? Math.round(r.num(hpObj.temp, `${pp}.hp.temp`, 0, 0)) : 0 }
          hpFromBlock.push({ inst, creature })
        }
        if (isObj(x.hp)) keep(x.hp, inst.hp, KNOWN.hp, `${pp}.hp`)
        const conds = [...new Set(r.arr(x.conditions, `${pp}.conditions`).map(conditionId).filter(Boolean))]
        if (conds.length) inst.conditions = conds
        if (x.used !== undefined && x.used !== null) {
          if (!isObj(x.used)) warnings.push(`${pp}.used: expected an object like { "Breath": 1 } (uses spent, by action), ignored.`)
          else {
            const used: Record<string, number> = {}
            for (const [key, v] of Object.entries(x.used)) {
              let act = creature.actions.find((a) => a.id === key)
              if (!act) {
                const named = creature.actions.filter((a) => normName(a.name) === normName(key))
                if (named.length === 1) act = named[0]
              }
              if (!act) {
                warnings.push(`${pp}.used: "${key}" is not an action of "${creature.name}"; ignored.`)
                continue
              }
              if (!act.uses) {
                warnings.push(`${pp}.used: "${act.name}" has no limit (uses) on the stat block; ignored.`)
                continue
              }
              const n = Math.round(r.num(v, `${pp}.used.${key}`, 0, 0))
              if (n > 0) used[act.id] = n
            }
            if (Object.keys(used).length) inst.used = used
          }
        }
        const note = r.str(x.note, `${pp}.note`)
        if (note.trim()) inst.note = note
        keep(x, inst, KNOWN.creatureInstance, pp)
        inPlay.push(inst)
      })
      if (inPlay.length) creature.inPlay = inPlay
    }
    keep(k, creature, KNOWN.creature, p)
    creatures.push(creature)
  })

  // ----- recipes and counters in Play (crafting; since 2026-10-01, added to schema 3) -----
  /** A recipe input or output: an item name and an amount above 0. "Herb" alone = 1 Herb. */
  const readPart = (v: unknown, p: string): RecipePart | undefined => {
    if (typeof v === 'string') v = { name: v }
    if (!isObj(v)) {
      warnings.push(`${p}: expected an object like { "name": "Moonpetal", "quantity": 2 }, ignored.`)
      return undefined
    }
    const name = r.str(v.name, `${p}.name`).trim()
    if (!name) {
      warnings.push(`${p}: no item name, ignored.`)
      return undefined
    }
    let quantity = r.num(v.quantity, `${p}.quantity`, 1, 0)
    if (!(quantity > 0)) {
      warnings.push(`${p}.quantity: must be above 0; using 1.`)
      quantity = 1
    }
    return { name, quantity }
  }
  /** What a new crafted item looks like: read as an item, without the fields of one stack. */
  const readTemplate = (v: unknown, p: string): ItemTemplate | undefined => {
    if (v === undefined || v === null) return undefined
    if (!isObj(v)) {
      warnings.push(`${p}: expected an object (the fields of an item), ignored.`)
      return undefined
    }
    const stackOnly = ['id', 'name', 'quantity', 'containerId', 'equipped', 'attuned'] as const
    const ignored = stackOnly.filter((f) => v[f] !== undefined)
    if (ignored.length) warnings.push(`${p}: ${ignored.join(', ')} ignored (a template is not one stack: the crafted item gets its own).`)
    const item = readItem(Object.fromEntries(Object.entries(v).filter(([f]) => !(stackOnly as readonly string[]).includes(f))), p)
    if (!item) return undefined
    const tpl: Obj = { ...item }
    for (const f of stackOnly) delete tpl[f]
    // the defaults readItem fills in are left out, so a template written by the app reads back the same
    if (tpl.requiresAttunement === false) delete tpl.requiresAttunement
    if (tpl.description === '') delete tpl.description
    return tpl as ItemTemplate
  }
  const recipes: Recipe[] = []
  r.arr(raw.recipes, 'recipes').forEach((x, i) => {
    const p = `recipes[${i}]`
    if (!isObj(x)) return warnings.push(`${p}: expected an object, ignored.`)
    let id = r.str(x.id, `${p}.id`).trim() || newId()
    if (recipes.some((y) => y.id === id)) {
      warnings.push(`${p}: the id "${id}" is used by another recipe; this one got a new id.`)
      id = newId()
    }
    const name = r.str(x.name, `${p}.name`).trim()
    const inputs: RecipePart[] = []
    r.arr(x.inputs, `${p}.inputs`).forEach((v, j) => {
      const part = readPart(v, `${p}.inputs[${j}]`)
      if (!part) return
      keep(v, part, KNOWN.recipePart, `${p}.inputs[${j}]`)
      inputs.push(part)
    })
    let output: Recipe['output'] | undefined = x.output === undefined ? undefined : readPart(x.output, `${p}.output`)
    if (!output) {
      output = { name: name || 'Item', quantity: 1 }
      warnings.push(`${p}: no output; it makes 1 "${output.name}".`)
    } else if (isObj(x.output)) {
      const tpl = readTemplate(x.output.template, `${p}.output.template`)
      if (tpl) output.template = tpl
      keep(x.output, output, KNOWN.recipeOutput, `${p}.output`)
    }
    const recipe: Recipe = { id, name: name || output.name, inputs, output }
    for (const f of ['time', 'tool', 'dc', 'note'] as const) {
      const v = r.str(x[f], `${p}.${f}`).trim()
      if (v) recipe[f] = v
    }
    const where = r.str(x.containerId, `${p}.containerId`).trim()
    if (where) recipe.containerId = where
    keep(x, recipe, KNOWN.recipe, p)
    recipes.push(recipe)
  })
  const playCounters: PlayCounter[] = []
  r.arr(raw.playCounters, 'playCounters').forEach((x, i) => {
    const p = `playCounters[${i}]`
    if (typeof x === 'string') x = { name: x }
    if (!isObj(x)) return warnings.push(`${p}: expected an object, ignored.`)
    const name = r.str(x.name, `${p}.name`).trim()
    if (!name) return warnings.push(`${p}: no item name, ignored.`)
    if (playCounters.some((y) => nameKey(y.name) === nameKey(name))) return warnings.push(`${p}: "${name}" is pinned twice; the second was ignored.`)
    const pc: PlayCounter = { name }
    keep(x, pc, KNOWN.playCounter, p)
    playCounters.push(pc)
  })

  // ----- preferences (per character; since 2026-10-01) -----
  const prefRaw = isObj(raw.preferences) ? raw.preferences : {}
  const gearRaw = isObj(prefRaw.gear) ? prefRaw.gear : {}
  const showRaw = isObj(gearRaw.show) ? gearRaw.show : {}
  const gear: GearPrefs = {
    view: r.oneOf(gearRaw.view, GEAR_VIEWS, 'preferences.gear.view', DEFAULT_GEAR_PREFS.view),
    groupBy: r.oneOf(gearRaw.groupBy, GEAR_GROUPINGS, 'preferences.gear.groupBy', DEFAULT_GEAR_PREFS.groupBy),
    show: Object.fromEntries(GEAR_SHOW_FIELDS.map((f) => [f, r.bool(showRaw[f], DEFAULT_GEAR_PREFS.show[f])])) as GearPrefs['show'],
  }
  keep(showRaw, gear.show, KNOWN.gearShow, 'preferences.gear.show')
  keep(gearRaw, gear, KNOWN.gearPrefs, 'preferences.gear')
  const preferences: Character['preferences'] = { gear }
  // Optional groups (since 2026-10-11): written only when the file has them, so a file without them is
  // unchanged by a round trip, and an absent choice always means "the app's default" (prefs.ts).
  const prefGroup = (name: string): Obj | undefined => {
    const v = prefRaw[name]
    if (v === undefined || v === null) return undefined
    if (isObj(v)) return v
    warnings.push(`preferences.${name}: expected an object, ignored.`)
    return undefined
  }
  const moneyPrefRaw = prefGroup('money')
  if (moneyPrefRaw) {
    const m: NonNullable<Character['preferences']['money']> = {}
    if (moneyPrefRaw.coins !== undefined && moneyPrefRaw.coins !== null) {
      const listed = r.arr(moneyPrefRaw.coins, 'preferences.money.coins').map((x) => String(x).toLowerCase().trim())
      const bad = listed.filter((x) => !(COINS as readonly string[]).includes(x))
      if (bad.length) warnings.push(`preferences.money.coins: ${bad.map((x) => `"${x}"`).join(', ')} not one of ${COINS.join(', ')}; ignored.`)
      const coins = COINS.filter((k) => listed.includes(k))
      if (coins.length) m.coins = coins
      else warnings.push('preferences.money.coins: no coin to show; using the default (gp).')
    }
    keep(moneyPrefRaw, m, KNOWN.moneyPrefs, 'preferences.money')
    preferences.money = m
  }
  const playPrefRaw = prefGroup('play')
  if (playPrefRaw) {
    const p: NonNullable<Character['preferences']['play']> = {}
    // an unknown word falls back to "absent" (the default), with a warning from oneOf
    const has = (v: unknown) => v !== undefined && v !== null && v !== ''
    if (has(playPrefRaw.attackOrder)) {
      const v = r.oneOf(playPrefRaw.attackOrder, [...ATTACK_ORDERS, ''] as const, 'preferences.play.attackOrder', '', { alphabetical: 'name', 'a-z': 'name', az: 'name' })
      if (v) p.attackOrder = v
    }
    if (has(playPrefRaw.phoneStart)) {
      const v = r.oneOf(playPrefRaw.phoneStart, [...PHONE_STARTS, ''] as const, 'preferences.play.phoneStart', '', { none: 'all', 'bonus action': 'bonus', free: 'other' })
      if (v) p.phoneStart = v
    }
    if (has(playPrefRaw.editButtons)) p.editButtons = r.bool(playPrefRaw.editButtons, true)
    keep(playPrefRaw, p, KNOWN.playPrefs, 'preferences.play')
    preferences.play = p
  }
  const mapPrefRaw = prefGroup('maps')
  if (mapPrefRaw) {
    const m: NonNullable<Character['preferences']['maps']> = {}
    // the default ("medium", names shown, nothing hidden) is read, not written
    const size = r.oneOf(mapPrefRaw.size, MARK_SIZES, 'preferences.maps.size', 'medium', { s: 'small', m: 'medium', l: 'large', xl: 'huge', big: 'large' })
    if (size !== 'medium') m.size = size
    if (mapPrefRaw.names !== undefined && mapPrefRaw.names !== null && !r.bool(mapPrefRaw.names, true)) m.names = false
    if (mapPrefRaw.hide !== undefined && mapPrefRaw.hide !== null) {
      const listed = r.arr(mapPrefRaw.hide, 'preferences.maps.hide').map((x) => String(x).toLowerCase().trim())
      const bad = listed.filter((x) => !(MAP_LAYERS as readonly string[]).includes(x))
      if (bad.length) warnings.push(`preferences.maps.hide: ${bad.map((x) => `"${x}"`).join(', ')} not one of ${MAP_LAYERS.join(', ')}; ignored.`)
      const hide = MAP_LAYERS.filter((l) => listed.includes(l))
      if (hide.length) m.hide = hide
    }
    keep(mapPrefRaw, m, KNOWN.mapPrefs, 'preferences.maps')
    if (Object.keys(m).length) preferences.maps = m
  }
  const creaturePrefRaw = prefGroup('creatures')
  if (creaturePrefRaw) {
    const m: CreaturePrefs = {}
    const has = (v: unknown) => v !== undefined && v !== null && v !== ''
    // every default is read, not written
    const where = r.oneOf(creaturePrefRaw.where, CREATURE_PLACES, 'preferences.creatures.where', DEFAULT_CREATURE_PREFS.where)
    if (where !== DEFAULT_CREATURE_PREFS.where) m.where = where
    if (has(creaturePrefRaw.pinned)) {
      const listed = [...new Set(r.arr(creaturePrefRaw.pinned, 'preferences.creatures.pinned').map((x) => String(x).trim()))]
      const gone = listed.filter((x) => !instanceIds.has(x))
      if (gone.length) warnings.push(`preferences.creatures.pinned: ${gone.map((x) => `"${x}"`).join(', ')} not a creature in play; removed from the list.`)
      m.pinned = listed.filter((x) => instanceIds.has(x))
    }
    if (has(creaturePrefRaw.row)) {
      const listed = r.arr(creaturePrefRaw.row, 'preferences.creatures.row').map((x) => String(x).toLowerCase().trim())
      const bad = listed.filter((x) => !(CREATURE_ROW_FIELDS as readonly string[]).includes(x))
      if (bad.length) warnings.push(`preferences.creatures.row: ${bad.map((x) => `"${x}"`).join(', ')} not one of ${CREATURE_ROW_FIELDS.join(', ')}; ignored.`)
      const row = CREATURE_ROW_FIELDS.filter((f) => listed.includes(f))
      if (row.join() !== DEFAULT_CREATURE_PREFS.row.join()) m.row = row
    }
    if (has(creaturePrefRaw.rolls) && !r.bool(creaturePrefRaw.rolls, true)) m.rolls = false
    const longRest = r.oneOf(creaturePrefRaw.longRest, CREATURE_LONG_RESTS, 'preferences.creatures.longRest', DEFAULT_CREATURE_PREFS.longRest, { all: 'full', hp: 'full', counters: 'uses', nothing: 'none' })
    if (longRest !== DEFAULT_CREATURE_PREFS.longRest) m.longRest = longRest
    const shortRest = r.oneOf(creaturePrefRaw.shortRest, CREATURE_SHORT_RESTS, 'preferences.creatures.shortRest', DEFAULT_CREATURE_PREFS.shortRest, { counters: 'uses', nothing: 'none' })
    if (shortRest !== DEFAULT_CREATURE_PREFS.shortRest) m.shortRest = shortRest
    keep(creaturePrefRaw, m, KNOWN.creaturePrefs, 'preferences.creatures')
    if (Object.keys(m).length) preferences.creatures = m
  }
  keep(prefRaw, preferences, KNOWN.preferences, 'preferences')

  const conditions = r
    .arr(raw.conditions, 'conditions')
    .map((c) => String(c).toLowerCase())
    .filter((c) => c !== 'exhaustion')

  const character: Character = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: r.str(raw.id, 'id') || newId(),
    name: r.str(raw.name, 'name') || 'Unnamed hero',
    player: r.str(raw.player, 'player'),
    species,
    background: r.str(raw.background, 'background'),
    alignment: r.str(raw.alignment, 'alignment'),
    xp: r.num(raw.xp, 'xp', 0, 0),
    partySize: Math.round(r.num(raw.partySize, 'partySize', 5, 1, 20)),
    xpLog,
    classes,
    abilities,
    proficiencies: {
      savingThrows: r
        .arr(prof.savingThrows, 'proficiencies.savingThrows')
        .map((a, i) => ability(a, `proficiencies.savingThrows[${i}]`))
        .filter((a): a is Ability => !!a),
      skills,
      jackOfAllTrades: r.bool(prof.jackOfAllTrades, false),
      armor: r.str(prof.armor, 'proficiencies.armor'),
      weapons: r.str(prof.weapons, 'proficiencies.weapons'),
      tools: r.str(prof.tools, 'proficiencies.tools'),
      languages: r.str(prof.languages, 'proficiencies.languages'),
      weaponMasteries: r.arr(prof.weaponMasteries, 'proficiencies.weaponMasteries').map(String),
    },
    combat: {
      unarmoredAc: r.formula(combat.unarmoredAc, 'combat.unarmoredAc', '10 + dex'),
      acBonus: r.num(combat.acBonus, 'combat.acBonus', 0),
      initiativeBonus: r.num(combat.initiativeBonus, 'combat.initiativeBonus', 0),
      speed: r.num(combat.speed, 'combat.speed', 30, 0),
      hp: {
        max: hpMax,
        current: r.num(hpRaw.current, 'combat.hp.current', hpMax, 0, hpMax),
        temp: r.num(hpRaw.temp, 'combat.hp.temp', 0, 0),
      },
      hitDiceUsed,
      deathSaves: {
        successes: r.num(dsRaw.successes, 'combat.deathSaves.successes', 0, 0, 3),
        failures: r.num(dsRaw.failures, 'combat.deathSaves.failures', 0, 0, 3),
      },
    },
    conditions: [...new Set(conditions)],
    exhaustion: Math.round(r.num(raw.exhaustion, 'exhaustion', 0, 0, 6)),
    // optional: only the 2014 choice is written; absent means the app's own rules (2024)
    ...(String(raw.exhaustionRules ?? '') === '2014' ? { exhaustionRules: '2014' as const } : {}),
    heroicInspiration: r.bool(raw.heroicInspiration, false),
    features,
    attacks,
    spellcasting,
    spells,
    inventory: { items, money, containers, categories },
    roleplay,
    sessionNotes,
    timers,
    // optional: written only when there are images, so a file without them is unchanged
    ...(images.length ? { images } : {}),
    // optional: written only when there are creatures, so a file without them is unchanged
    ...(creatures.length ? { creatures } : {}),
    recipes,
    playCounters,
    preferences,
    updatedAt: r.str(raw.updatedAt, 'updatedAt') || new Date().toISOString(),
  }
  keep(speciesRaw, character.species, KNOWN.species, 'species')
  keep(prof, character.proficiencies, KNOWN.proficiencies, 'proficiencies')
  keep(combat, character.combat, KNOWN.combat, 'combat')
  keep(hpRaw, character.combat.hp, KNOWN.hp, 'combat.hp')
  keep(dsRaw, character.combat.deathSaves, KNOWN.deathSaves, 'combat.deathSaves')
  keep(invRaw, character.inventory, KNOWN.inventory, 'inventory')
  keep(raw, character, KNOWN.top, '')
  // creatures in play written without Hit Points get the stat block's (the formula may name the hero's numbers)
  for (const { inst, creature } of hpFromBlock) {
    const max = creatureHpMax(character, creature)
    inst.hp = { ...inst.hp, max, current: inst.hp.current < 0 ? max : Math.min(inst.hp.current, max) }
  }
  checkUsed(character, warnings)
  // one fixed order of fields, empty optional ones left out: what the app itself writes (creatures.ts)
  if (character.creatures) character.creatures = character.creatures.map(tidyCreature)
  return { character, warnings, imageData, imagesInFile: raw.images !== undefined }
}

/** Parses a JSON string (e.g. an imported file). Throws ImportError with a readable message. */
export function importCharacterJson(text: string): NormalizeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new ImportError(`This is not valid JSON: ${(e as Error).message}`)
  }
  // accept an exported wrapper { "character": { ... } } as well
  if (isObj(parsed) && isObj(parsed.character) && !parsed.name) parsed = parsed.character
  return normalizeCharacter(parsed)
}

export function blankCharacter(name = 'New hero'): Character {
  return normalizeCharacter({ name, classes: [{ id: 'fighter', level: 1 }], combat: { hp: { max: 10 } } }).character
}
