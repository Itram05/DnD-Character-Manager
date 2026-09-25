// Turns any parsed JSON into a complete, valid Character.
// Philosophy: be forgiving. Missing fields get defaults, wrong types are coerced when the
// intent is obvious, and everything that was changed or dropped is reported as a warning.
// Only a few things are fatal (not an object, a newer schema version than we know).
import { srdClass } from '../data/srd'
import {
  ABILITIES,
  ACTIVATIONS,
  CURRENT_SCHEMA_VERSION,
  RECHARGES,
  SKILL_IDS,
  SOURCE_TYPES,
  type Ability,
  type Activation,
  type Attack,
  type Character,
  type ClassEntry,
  type Feature,
  type Formula,
  type Item,
  type Recharge,
  type SessionNote,
  type SkillProficiency,
  type SourceType,
  type Spell,
  type Uses,
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
  return { str, num, bool, arr, oneOf, formula }
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
  const raw = input

  const version = r.num(raw.schemaVersion, 'schemaVersion', CURRENT_SCHEMA_VERSION)
  if (version > CURRENT_SCHEMA_VERSION)
    throw new ImportError(
      `This file uses schema version ${version}, but this app only knows version ${CURRENT_SCHEMA_VERSION}. Update the app.`,
    )
  // Future migrations go here: if (version < 2) { ... }

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
    const u = uses(f.uses, `${p}.uses`)
    if (u) feat.uses = u
    if (f.level !== undefined) feat.level = r.num(f.level, `${p}.level`, 1, 1, 20)
    features.push(feat)
  })

  // ----- attacks -----
  const attacks: Attack[] = []
  r.arr(raw.attacks, 'attacks').forEach((a, i) => {
    const p = `attacks[${i}]`
    if (!isObj(a)) return warnings.push(`${p}: expected an object, ignored.`)
    const abil = String(a.ability ?? 'str').toLowerCase()
    attacks.push({
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
    })
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
    items.push(item)
  })
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

  // ----- roleplay -----
  const rp = isObj(raw.roleplay) ? raw.roleplay : {}
  const rpKeys = ['appearance', 'personality', 'ideals', 'bonds', 'flaws', 'voice', 'mannerisms', 'goals', 'backstory', 'allies', 'notes'] as const
  const roleplay = Object.fromEntries(rpKeys.map((k) => [k, r.str(rp[k], `roleplay.${k}`)])) as unknown as Character['roleplay']

  const sessionNotes: SessionNote[] = []
  r.arr(raw.sessionNotes, 'sessionNotes').forEach((n, i) => {
    if (typeof n === 'string') n = { text: n }
    if (!isObj(n)) return warnings.push(`sessionNotes[${i}]: expected an object, ignored.`)
    sessionNotes.push({
      id: r.str(n.id, `sessionNotes[${i}].id`) || newId(),
      date: r.str(n.date, `sessionNotes[${i}].date`),
      title: r.str(n.title, `sessionNotes[${i}].title`),
      text: r.str(n.text, `sessionNotes[${i}].text`),
    })
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
    updatedAt: r.str(raw.updatedAt, 'updatedAt') || new Date().toISOString(),
  }
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
