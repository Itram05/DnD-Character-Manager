// Derived values: everything on the sheet that is calculated rather than typed in.
// Rules source: SRD 5.2.1 (2024 rules). Section names are given next to each rule.
import { srdClass } from '../data/srd'
import { evaluate } from './expr'
import {
  ABILITIES,
  SKILLS,
  type Ability,
  type Attack,
  type CasterType,
  type Character,
  type ClassEntry,
  type Formula,
  type SkillId,
} from './types'

export const abilityMod = (score: number) => Math.floor((score - 10) / 2)

export const formatMod = (n: number) => (Number.isNaN(n) ? '?' : n >= 0 ? `+${n}` : `${n}`)

export function totalLevel(c: Pick<Character, 'classes'>): number {
  return Math.max(1, c.classes.reduce((s, k) => s + (k.level || 0), 0))
}

/** "Character Advancement" table: +2 at levels 1-4, +3 at 5-8 ... +6 at 17-20. */
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)

export const mods = (c: Character) =>
  Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(c.abilities[a])])) as Record<Ability, number>

// ---------------- formulas ----------------

/** Numeric value of an SRD class table column at a class level, e.g. rages at Barbarian 5 = 3. */
export function classColumnValue(classId: string, column: string, level: number): number | undefined {
  const cls = srdClass(classId)
  if (!cls) return undefined
  const row = cls.table.find((r) => r.level === Math.min(20, Math.max(1, level)))
  const raw = row?.values[column]
  if (raw === undefined) return undefined
  if (raw === '') return 0
  const m = raw.replace(/^\+/, '').match(/^-?\d+/)
  return m ? Number(m[0]) : undefined
}

export function resolveIdentifier(c: Character, name: string): number | undefined {
  const m = mods(c)
  if ((ABILITIES as readonly string[]).includes(name)) return m[name as Ability]
  if (name.endsWith('_score') && (ABILITIES as readonly string[]).includes(name.slice(0, 3))) return c.abilities[name.slice(0, 3) as Ability]
  if (name === 'pb') return proficiencyBonus(totalLevel(c))
  if (name === 'level') return totalLevel(c)
  const [cls, col] = name.split('.')
  const entry = c.classes.find((k) => k.id.toLowerCase() === cls)
  if (!col) return entry ? entry.level : srdClass(cls) ? 0 : undefined
  if (!entry) return srdClass(cls) ? 0 : undefined
  return classColumnValue(cls, col, entry.level)
}

export function evalFormula(c: Character, f: Formula | undefined) {
  return evaluate(f, (n) => resolveIdentifier(c, n))
}

/** Evaluates a use/charge maximum. Bad formulas give 0 so the UI never breaks. */
export function usesMax(c: Character, f: Formula | undefined): number {
  const r = evalFormula(c, f)
  return Number.isFinite(r.value) ? Math.max(0, Math.floor(r.value)) : 0
}

// ---------------- checks, saves, skills ----------------

export function savingThrowProficiencies(c: Character): Ability[] {
  if (c.proficiencies.savingThrows.length) return c.proficiencies.savingThrows
  // Only the first class grants saving throw proficiencies ("As a Multiclass Character").
  return srdClass(c.classes[0]?.id)?.savingThrows ?? []
}

export function savingThrow(c: Character, a: Ability) {
  const prof = savingThrowProficiencies(c).includes(a)
  const items = c.inventory.items.reduce((s, i) => s + (i.saveBonus && itemActive(i) ? i.saveBonus : 0), 0)
  return { mod: abilityMod(c.abilities[a]) + (prof ? proficiencyBonus(totalLevel(c)) : 0) + items, proficient: prof }
}

export function skillMod(c: Character, s: SkillId): number {
  const pb = proficiencyBonus(totalLevel(c))
  const base = abilityMod(c.abilities[SKILLS[s]])
  const p = c.proficiencies.skills[s] ?? 'none'
  if (p === 'expertise') return base + pb * 2
  if (p === 'proficient') return base + pb
  // Jack of All Trades (2024): half PB, round down, to skill checks you lack proficiency in.
  return base + (c.proficiencies.jackOfAllTrades ? Math.floor(pb / 2) : 0)
}

/** Passive score = 10 + all modifiers that normally apply to the check. */
export const passiveScore = (c: Character, s: SkillId) => 10 + skillMod(c, s)

/** Initiative is a Dexterity check. JoAT does not apply in 2024 (it needs a skill). */
export const initiative = (c: Character) => abilityMod(c.abilities.dex) + (c.combat.initiativeBonus || 0)

/** Exhaustion (2024): D20 Tests reduced by 2 x level, Speed by 5 x level. */
export const exhaustionD20Penalty = (c: Character) => 2 * c.exhaustion
export const effectiveSpeed = (c: Character) => Math.max(0, c.combat.speed - 5 * c.exhaustion)

// ---------------- armor class ----------------

export function itemActive(i: { equipped: boolean; requiresAttunement: boolean; attuned: boolean }) {
  return i.equipped && (!i.requiresAttunement || i.attuned)
}

export interface AcBreakdown {
  total: number
  parts: { label: string; value: number }[]
  warnings: string[]
}

export function armorClass(c: Character): AcBreakdown {
  const dex = abilityMod(c.abilities.dex)
  const parts: { label: string; value: number }[] = []
  const warnings: string[] = []
  const armors = c.inventory.items.filter((i) => i.equipped && i.armor)
  if (armors.length > 1) warnings.push('More than one armor is equipped; using the first one.')
  const armor = armors[0]
  if (armor?.armor) {
    parts.push({ label: armor.name, value: armor.armor.base })
    const cap = armor.armor.dexCap
    const d = cap === null ? dex : Math.min(dex, cap)
    if (d !== 0) parts.push({ label: 'Dex', value: d })
  } else {
    const r = evalFormula(c, c.combat.unarmoredAc)
    if (r.error || r.unknown.length) warnings.push(`Unarmored AC formula problem: ${r.error ?? 'unknown ' + r.unknown.join(', ')}`)
    parts.push({ label: `Unarmored (${c.combat.unarmoredAc})`, value: Number.isFinite(r.value) ? r.value : 10 + dex })
  }
  for (const i of c.inventory.items) {
    if (i.acBonus && itemActive(i)) parts.push({ label: i.name, value: i.acBonus })
  }
  if (c.combat.acBonus) parts.push({ label: 'Other', value: c.combat.acBonus })
  return { total: parts.reduce((s, p) => s + p.value, 0), parts, warnings }
}

export const attunedCount = (c: Character) => c.inventory.items.filter((i) => i.attuned).length
export const MAX_ATTUNED = 3

export type AttuneResult =
  | { ok: true; character: Character }
  /** Already at the limit: nothing changed; `attuned` names the items to un-attune from. */
  | { ok: false; character: Character; attuned: string[] }

/**
 * Attunes or un-attunes an item. Attuning also equips it: a bonus (AC, saves) counts only
 * when the item is both equipped and attuned, and "attuned but lying in the bag" is almost
 * always a forgotten tap. Un-attuning leaves "equipped" as it is (you can still wear the item).
 * A 4th attunement is refused, never silently: the caller gets the names of the attuned items.
 */
export function setAttunement(c: Character, itemId: string, on: boolean): AttuneResult {
  const item = c.inventory.items.find((i) => i.id === itemId)
  if (!item || !item.requiresAttunement || item.attuned === on) return { ok: true, character: c }
  if (on && attunedCount(c) >= MAX_ATTUNED) {
    return { ok: false, character: c, attuned: c.inventory.items.filter((i) => i.attuned).map((i) => i.name) }
  }
  const patch = on ? { attuned: true, equipped: true } : { attuned: false }
  const items = c.inventory.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i))
  return { ok: true, character: { ...c, inventory: { ...c.inventory, items } } }
}

// ---------------- hit dice ----------------

export function classHitDie(k: ClassEntry): number {
  return k.hitDie ?? srdClass(k.id)?.hitDie ?? 8
}

/** Pool of hit dice by die, e.g. { d10: 5, d8: 2 }. Same-size dice are pooled (Multiclassing). */
export function hitDicePool(c: Character): Record<string, number> {
  const pool: Record<string, number> = {}
  for (const k of c.classes) {
    const d = `d${classHitDie(k)}`
    pool[d] = (pool[d] ?? 0) + k.level
  }
  return pool
}

// ---------------- spellcasting ----------------

/** "Multiclass Spellcaster: Spell Slots per Spell Level" (SRD 5.2.1, Character Creation). Index 0 = level 1. */
export const MULTICLASS_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

const NO_SLOTS = [0, 0, 0, 0, 0, 0, 0, 0, 0]

export function casterType(k: ClassEntry): CasterType {
  if (k.casterType) return k.casterType
  return srdClass(k.id)?.spellcasting?.type ?? 'none'
}

export function spellcastingAbility(k: ClassEntry): Ability | undefined {
  return k.spellcastingAbility ?? srdClass(k.id)?.spellcasting?.ability ?? undefined
}

/** Caster level used for the Multiclass Spellcaster table. */
export function multiclassCasterLevel(classes: ClassEntry[]): number {
  let lvl = 0
  for (const k of classes) {
    const t = casterType(k)
    if (t === 'full') lvl += k.level
    else if (t === 'half') lvl += Math.ceil(k.level / 2) // SRD 5.2.1: "Half your levels (round up)"
    else if (t === 'third') lvl += Math.floor(k.level / 3) // not in SRD; PHB 2024 rule for EK / AT (unverified)
  }
  return lvl
}

/** Spell slots (not Pact Magic) per level; index 0 = spell level 1. */
export function spellSlots(c: Character): number[] {
  if (c.spellcasting.slotsOverride?.length) return [...c.spellcasting.slotsOverride, ...NO_SLOTS].slice(0, 9)
  const casters = c.classes.filter((k) => ['full', 'half', 'third'].includes(casterType(k)) && k.level > 0)
  if (casters.length === 0) return [...NO_SLOTS]
  if (casters.length === 1) {
    const k = casters[0]
    const cls = srdClass(k.id)
    const row = cls?.table.find((r) => r.level === Math.min(20, k.level))
    if (row && !k.casterType && 'slot1' in row.values) {
      return NO_SLOTS.map((_, i) => Number(row.values[`slot${i + 1}`] || 0))
    }
    // single non-SRD caster: its own table follows the rounded-up fraction of its level
    const t = casterType(k)
    const eff = t === 'full' ? k.level : t === 'half' ? Math.ceil(k.level / 2) : Math.ceil(k.level / 3)
    if (t === 'third' && k.level < 3) return [...NO_SLOTS]
    return eff > 0 ? [...MULTICLASS_SLOTS[Math.min(20, eff) - 1]] : [...NO_SLOTS]
  }
  const lvl = multiclassCasterLevel(casters)
  return lvl > 0 ? [...MULTICLASS_SLOTS[Math.min(20, lvl) - 1]] : [...NO_SLOTS]
}

/** Pact Magic slots from the Warlock table (or the override). */
export function pactSlots(c: Character): { slots: number; level: number } {
  if (c.spellcasting.pactOverride) return c.spellcasting.pactOverride
  const w = c.classes.find((k) => casterType(k) === 'pact')
  if (!w) return { slots: 0, level: 0 }
  return {
    slots: classColumnValue(w.id, 'spell-slots', w.level) ?? 0,
    level: classColumnValue(w.id, 'slot-level', w.level) ?? 0,
  }
}

export interface CastingStats {
  classId: string
  className: string
  ability: Ability
  saveDc: number
  attack: number
}

/** Spell save DC = 8 + ability modifier + PB; spell attack = ability modifier + PB. */
export function castingStats(c: Character): CastingStats[] {
  const pb = proficiencyBonus(totalLevel(c))
  const out: CastingStats[] = []
  for (const k of c.classes) {
    if (casterType(k) === 'none') continue
    const ability = spellcastingAbility(k)
    if (!ability) continue
    const m = abilityMod(c.abilities[ability])
    out.push({ classId: k.id, className: k.name, ability, saveDc: 8 + m + pb, attack: m + pb })
  }
  return out
}

// ---------------- attacks ----------------

export function attackStats(c: Character, a: Attack) {
  const m = mods(c)
  let abil = 0
  if (a.ability === 'finesse') abil = Math.max(m.str, m.dex)
  else if (a.ability === 'spell') {
    const cs = castingStats(c)[0]
    abil = cs ? m[cs.ability] : 0
  } else abil = m[a.ability]
  const pb = proficiencyBonus(totalLevel(c))
  const toHit = abil + (a.proficient ? pb : 0) + (a.bonus || 0)
  const dmgMod = (a.addAbilityToDamage ? abil : 0) + (a.damageBonus || 0)
  return { toHit, dmgMod }
}

// ---------------- HP ----------------

export interface DamageResult {
  character: Character
  events: string[]
}

/** Damage: Temporary HP first, then HP. At 0 HP damage causes Death Save failures (2 on a crit). */
export function applyDamage(c: Character, amount: number, critical = false): DamageResult {
  const events: string[] = []
  amount = Math.max(0, Math.floor(amount))
  if (!amount) return { character: c, events }
  const hp = { ...c.combat.hp }
  const ds = { ...c.combat.deathSaves }
  const wasAtZero = hp.current <= 0
  const fromTemp = Math.min(hp.temp, amount)
  hp.temp -= fromTemp
  let rest = amount - fromTemp
  if (wasAtZero && rest > 0) {
    if (rest >= hp.max) events.push('massiveDamageDeath')
    ds.failures = Math.min(3, ds.failures + (critical ? 2 : 1))
    events.push(critical ? 'deathSaveFail2' : 'deathSaveFail1')
  } else if (rest > 0) {
    const newHp = hp.current - rest
    if (newHp <= 0) {
      rest = -newHp
      hp.current = 0
      events.push('droppedToZero')
      if (rest >= hp.max) events.push('massiveDamageDeath')
    } else hp.current = newHp
  }
  if (ds.failures >= 3) events.push('dead')
  return { character: { ...c, combat: { ...c.combat, hp, deathSaves: ds } }, events }
}

/** Healing restores HP up to the maximum and resets death saves. It never restores Temporary HP. */
export function applyHealing(c: Character, amount: number): Character {
  amount = Math.max(0, Math.floor(amount))
  if (!amount) return c
  const hp = { ...c.combat.hp, current: Math.min(c.combat.hp.max, Math.max(0, c.combat.hp.current) + amount) }
  return { ...c, combat: { ...c.combat, hp, deathSaves: { successes: 0, failures: 0 } } }
}

/** Temporary HP don't stack: you keep either the old or the new amount (we keep the higher). */
export function applyTempHp(c: Character, amount: number): Character {
  const temp = Math.max(c.combat.hp.temp, Math.max(0, Math.floor(amount)))
  return { ...c, combat: { ...c.combat, hp: { ...c.combat.hp, temp } } }
}

/** Fixed Hit Points by Class: half the die + 1 (d6 -> 4, d8 -> 5, d10 -> 6, d12 -> 7). */
export const fixedHpPerLevel = (hitDie: number) => hitDie / 2 + 1
