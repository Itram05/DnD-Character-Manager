// Turns any parsed JSON into a complete, valid Character.
// Philosophy: be forgiving. Missing fields get defaults, wrong types are coerced when the
// intent is obvious, and everything that was changed or dropped is reported as a warning.
// Only a few things are fatal (not an object, a newer schema version than we know).
//
// Unknown fields are never dropped (since schema version 2): a field the app does not know is kept
// as it is, in the same place, and exported again; the import dialog lists it. That way a file
// written by a newer app, or by hand with extra notes, survives a round trip through this app.
import { srdClass } from '../data/srd'
import {
  ABILITIES,
  ACTIVATIONS,
  CURRENT_SCHEMA_VERSION,
  RECHARGES,
  SKILL_IDS,
  SOURCE_TYPES,
  USES_RESOURCES,
  type Ability,
  type Activation,
  type Attack,
  type Character,
  type ClassEntry,
  type DayTimer,
  type Feature,
  type Formula,
  type Item,
  type ItemPower,
  type PowerCost,
  type Recharge,
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
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

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
const KNOWN = {
  top: ['schemaVersion', 'id', 'name', 'player', 'species', 'race', 'background', 'alignment', 'xp', 'partySize', 'xpLog', 'classes', 'abilities', 'proficiencies', 'combat', 'conditions', 'exhaustion', 'heroicInspiration', 'features', 'attacks', 'spellcasting', 'spells', 'inventory', 'items', 'money', 'roleplay', 'sessionNotes', 'timers', 'updatedAt'],
  species: ['name', 'size'],
  abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
  class: ['id', 'name', 'level', 'subclass', 'hitDie', 'casterType', 'spellcastingAbility'],
  proficiencies: ['savingThrows', 'skills', 'jackOfAllTrades', 'armor', 'weapons', 'tools', 'languages', 'weaponMasteries'],
  combat: ['unarmoredAc', 'acBonus', 'initiativeBonus', 'speed', 'hp', 'hitDiceUsed', 'deathSaves'],
  hp: ['max', 'current', 'temp'],
  deathSaves: ['successes', 'failures'],
  feature: ['id', 'name', 'source', 'activation', 'uses', 'description', 'level', 'tags'],
  source: ['type', 'name'],
  uses: ['max', 'used', 'recharge', 'shortRestRegain', 'regain', 'note', 'resource'],
  attack: ['id', 'name', 'ability', 'proficient', 'bonus', 'damage', 'damageType', 'addAbilityToDamage', 'damageBonus', 'mastery', 'notes', 'itemId'],
  spell: ['id', 'name', 'level', 'source', 'prepared', 'alwaysPrepared', 'ritual', 'concentration', 'school', 'castingTime', 'range', 'components', 'duration', 'description', 'freeCasts', 'tags'],
  spellcasting: ['slotsUsed', 'pactSlotsUsed', 'concentration', 'slotsOverride', 'pactOverride', 'bonusSlots'],
  pactOverride: ['slots', 'level'],
  inventory: ['items', 'money'],
  item: ['id', 'name', 'quantity', 'equipped', 'requiresAttunement', 'attuned', 'weight', 'armor', 'acBonus', 'saveBonus', 'spellDcBonus', 'spellAttackBonus', 'charges', 'activation', 'description', 'powers', 'tags'],
  armor: ['base', 'dexCap'],
  power: ['id', 'name', 'activation', 'cost', 'uses', 'description', 'tags'],
  money: ['cp', 'sp', 'ep', 'gp', 'pp'],
  roleplay: ['appearance', 'personality', 'ideals', 'bonds', 'flaws', 'voice', 'mannerisms', 'goals', 'backstory', 'allies', 'notes'],
  sessionNote: ['id', 'date', 'title', 'text'],
  xpEntry: ['id', 'date', 'kind', 'amount', 'groupXp', 'players'],
  timer: ['id', 'name', 'days', 'start', 'note'],
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
      `This file uses schema version ${version}, but this app only knows version ${CURRENT_SCHEMA_VERSION}. Update the app.`,
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
    keep(f, feat, KNOWN.feature, p)
    features.push(feat)
  })

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
  const items: Item[] = []
  r.arr(invRaw.items ?? raw.items, 'inventory.items').forEach((it, i) => {
    const p = `inventory.items[${i}]`
    if (typeof it === 'string') it = { name: it }
    if (!isObj(it)) return warnings.push(`${p}: expected an object, ignored.`)
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
    liftSpellBonusPowers(item, p, warnings)
    const tg = r.tags(it.tags, `${p}.tags`)
    if (tg) item.tags = tg
    keep(it, item, KNOWN.item, p)
    items.push(item)
  })
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
    heroicInspiration: r.bool(raw.heroicInspiration, false),
    features,
    attacks,
    spellcasting,
    spells,
    inventory: { items, money },
    roleplay,
    sessionNotes,
    timers,
    updatedAt: r.str(raw.updatedAt, 'updatedAt') || new Date().toISOString(),
  }
  keep(speciesRaw, character.species, KNOWN.species, 'species')
  keep(prof, character.proficiencies, KNOWN.proficiencies, 'proficiencies')
  keep(combat, character.combat, KNOWN.combat, 'combat')
  keep(hpRaw, character.combat.hp, KNOWN.hp, 'combat.hp')
  keep(dsRaw, character.combat.deathSaves, KNOWN.deathSaves, 'combat.deathSaves')
  keep(invRaw, character.inventory, KNOWN.inventory, 'inventory')
  keep(raw, character, KNOWN.top, '')
  return { character, warnings }
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
