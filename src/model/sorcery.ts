// Sorcery Points and Flexible Casting (Sorcerer "Font of Magic").
//
// Rules (same numbers in 2014 PHB and 2024 PHB / SRD 5.2.1):
//   Slot -> points: expend a spell slot, gain Sorcery Points equal to the slot's level.
//     You can never have more points than your maximum.
//   Points -> slot: 1st 2, 2nd 3, 3rd 5, 4th 6, 5th 7 points; no slot above 5th.
//     A created slot vanishes when you finish a Long Rest.
//   Action cost differs: creating a slot is a Bonus Action in both editions;
//   slot -> points is a Bonus Action in 2014 and takes no action in 2024.
//
// Created slots are stored in spellcasting.bonusSlots and add to the normal maximum,
// so a created slot can take you above the table value.
import { spellSlots, usesMax } from './rules'
import type { Character, Feature, Uses } from './types'

/** Sorcery Points cost of creating a slot of level 1-5. */
export const SLOT_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 }
export const MAX_CREATED_SLOT_LEVEL = 5

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** True when a counter holds Sorcery Points: explicit marker, the note, or the Sorcerer formula. */
export function isSorceryPoints(u: Uses | undefined): boolean {
  if (!u) return false
  if (u.resource === 'sorcery-points') return true
  if (u.note && /sorcery\s*points?/i.test(u.note)) return true
  return typeof u.max === 'string' && ['sorcerer', 'sorcerer.sorcery-points'].includes(squash(u.max))
}

/** The feature holding Sorcery Points. The explicit marker wins over the guesses. */
export function sorceryFeature(c: Character): Feature | undefined {
  return c.features.find((f) => f.uses?.resource === 'sorcery-points') ?? c.features.find((f) => isSorceryPoints(f.uses))
}

export interface SorceryState {
  featureId: string
  name: string
  max: number
  left: number
}

export function sorceryPoints(c: Character): SorceryState | undefined {
  const f = sorceryFeature(c)
  if (!f?.uses) return undefined
  const max = usesMax(c, f.uses.max)
  return { featureId: f.id, name: f.name, max, left: Math.max(0, max - Math.min(f.uses.used, max)) }
}

/** Created (bonus) slots at a spell level (1-9). */
export const bonusSlotsAt = (c: Character, level: number) => c.spellcasting.bonusSlots?.[level - 1] ?? 0

/** Normal slots + created slots at a spell level. */
export const slotTotal = (c: Character, level: number) => (spellSlots(c)[level - 1] ?? 0) + bonusSlotsAt(c, level)

export const slotsLeftAt = (c: Character, level: number) => Math.max(0, slotTotal(c, level) - (c.spellcasting.slotsUsed[level - 1] ?? 0))

function setPointsUsed(c: Character, featureId: string, used: number): Character {
  return { ...c, features: c.features.map((f) => (f.id === featureId && f.uses ? { ...f, uses: { ...f.uses, used } } : f)) }
}

function currentUsed(c: Character, featureId: string) {
  return c.features.find((f) => f.id === featureId)?.uses?.used ?? 0
}

export interface ConvertResult {
  character: Character
  /** Points gained (slot -> points); can be less than the slot level at the cap. */
  gained?: number
}

/** Can the character expend a slot of this level for points right now? */
export function canSlotToPoints(c: Character, level: number): boolean {
  const sp = sorceryPoints(c)
  return !!sp && sp.left < sp.max && slotsLeftAt(c, level) > 0
}

/** Expend one spell slot, gain Sorcery Points equal to its level (capped at the maximum). */
export function slotToPoints(c: Character, level: number): ConvertResult | null {
  const sp = sorceryPoints(c)
  if (!sp || !canSlotToPoints(c, level)) return null
  const gained = Math.min(level, sp.max - sp.left)
  const slotsUsed = [...c.spellcasting.slotsUsed]
  slotsUsed[level - 1] = (slotsUsed[level - 1] ?? 0) + 1
  const used = Math.max(0, Math.min(currentUsed(c, sp.featureId), sp.max) - gained)
  const next = setPointsUsed({ ...c, spellcasting: { ...c.spellcasting, slotsUsed } }, sp.featureId, used)
  return { character: { ...next, updatedAt: new Date().toISOString() }, gained }
}

export function canPointsToSlot(c: Character, level: number): boolean {
  const sp = sorceryPoints(c)
  const cost = SLOT_COST[level]
  return !!sp && cost !== undefined && sp.left >= cost
}

/** Spend Sorcery Points to create one slot of level 1-5. It lasts until a Long Rest. */
export function pointsToSlot(c: Character, level: number): ConvertResult | null {
  const sp = sorceryPoints(c)
  if (!sp || !canPointsToSlot(c, level)) return null
  const bonusSlots = Array.from({ length: 9 }, (_, i) => c.spellcasting.bonusSlots?.[i] ?? 0)
  bonusSlots[level - 1] += 1
  const used = Math.min(currentUsed(c, sp.featureId), sp.max) + SLOT_COST[level]
  const next = setPointsUsed({ ...c, spellcasting: { ...c.spellcasting, bonusSlots } }, sp.featureId, used)
  return { character: { ...next, updatedAt: new Date().toISOString() } }
}

/** Removes all created slots (Long Rest). Leaves the character untouched when there are none. */
export function clearBonusSlots(c: Character): Character {
  if (!('bonusSlots' in c.spellcasting)) return c
  const { bonusSlots: _drop, ...rest } = c.spellcasting
  return { ...c, spellcasting: rest }
}
