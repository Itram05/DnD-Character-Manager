// Short Rest and Long Rest, SRD 5.2.1 Rules Glossary ("Short Rest", "Long Rest").
//
// Short Rest: you may spend Hit Point Dice (roll + Con mod, minimum 1 HP each);
//   features that recharge on a Short Rest come back; Pact Magic slots come back
//   (Warlock "Pact Magic": "You regain all expended Pact Magic spell slots when you
//   finish a Short or Long Rest"); "long"-recharge features with shortRestRegain get that many back.
// Long Rest: all lost HP and ALL spent Hit Point Dice (2024; in 2014 it was half);
//   reduced HP max returns to normal; Exhaustion -1; everything that recharges on a
//   Short or Long Rest comes back; all spell slots come back.
//   Temporary HP end ("last until depleted or you finish a Long Rest").
//   Concentration ends because you sleep (Unconscious -> Incapacitated ends Concentration).
//   A day passes: every running day timer loses 1 (timers.ts). The app's own rule, not the SRD's.
import { abilityMod, evalFormula, hitDicePool, usesMax } from './rules'
import { clearBonusSlots } from './sorcery'
import { passDays, type TimerChange } from './timers'
import type { Character, Uses } from './types'

export interface RestResult {
  character: Character
  /** Human-readable list of what came back. */
  restored: string[]
  /** Things the app can't do for you (rolls, choices). */
  reminders: string[]
  /** Day timers the rest moved (Long Rest: 1 day off each running timer). */
  timers: TimerChange[]
}

type Kind = 'short' | 'long'

function restoreUses(c: Character, u: Uses, kind: Kind, dawn: boolean, name: string, out: RestResult): Uses {
  if (u.used <= 0) return u
  const full = kind === 'long' ? ['short', 'long'] : ['short']
  if (dawn) full.push('dawn')
  if (full.includes(u.recharge)) {
    if (u.regain) {
      out.reminders.push(`${name}: roll ${u.regain} to see how many come back.`)
      return u
    }
    out.restored.push(name)
    return { ...u, used: 0 }
  }
  if (kind === 'short' && u.recharge === 'long' && u.shortRestRegain !== undefined) {
    const n = Math.max(0, Math.floor(evalFormula(c, u.shortRestRegain).value || 0))
    if (n > 0) {
      out.restored.push(`${name} (+${Math.min(n, u.used)})`)
      return { ...u, used: Math.max(0, u.used - n) }
    }
  }
  return u
}

function restoreAll(c: Character, kind: Kind, dawn: boolean, out: RestResult): Character {
  const features = c.features.map((f) => (f.uses ? { ...f, uses: restoreUses(c, f.uses, kind, dawn, f.name, out) } : f))
  const spells = c.spells.map((s) => (s.freeCasts ? { ...s, freeCasts: restoreUses(c, s.freeCasts, kind, dawn, `${s.name} (free cast)`, out) } : s))
  const items = c.inventory.items.map((i) => {
    let next = i.charges ? { ...i, charges: restoreUses(c, i.charges, kind, dawn, `${i.name} charges`, out) } : i
    // item powers with their own counter ("once per long rest")
    if (i.powers?.some((p) => p.uses))
      next = { ...next, powers: i.powers.map((p) => (p.uses ? { ...p, uses: restoreUses(c, p.uses, kind, dawn, `${i.name}: ${p.name}`, out) } : p)) }
    return next
  })
  return { ...c, features, spells, inventory: { ...c.inventory, items } }
}

/** Features whose text says something happens on a Short Rest that the app can't automate. */
function shortRestReminders(c: Character, out: RestResult) {
  for (const f of c.features) {
    if (f.uses && (f.uses.recharge === 'short' || f.uses.shortRestRegain !== undefined)) continue
    if (/when you finish a short rest|whenever you finish a short rest/i.test(f.description)) out.reminders.push(`Check "${f.name}" (it does something on a Short Rest).`)
  }
}

export function shortRest(c: Character, opts: { dawn?: boolean } = {}): RestResult {
  const out: RestResult = { character: c, restored: [], reminders: [], timers: [] }
  if (c.combat.hp.current < 1) out.reminders.push('Rules: you need at least 1 HP to start a Short Rest.')
  let next = restoreAll(c, 'short', !!opts.dawn, out)
  if (next.spellcasting.pactSlotsUsed > 0) out.restored.push('Pact Magic slots')
  next = { ...next, spellcasting: { ...next.spellcasting, pactSlotsUsed: 0 } }
  shortRestReminders(c, out)
  out.character = { ...next, updatedAt: new Date().toISOString() }
  return out
}

export function longRest(c: Character, opts: { dawn?: boolean } = { dawn: true }): RestResult {
  const out: RestResult = { character: c, restored: [], reminders: [], timers: [] }
  if (c.combat.hp.current < 1) out.reminders.push('Rules: you need at least 1 HP to start a Long Rest.')
  let next = restoreAll(c, 'long', opts.dawn !== false, out)
  if (c.combat.hp.current < c.combat.hp.max) out.restored.push('All Hit Points')
  if (Object.values(c.combat.hitDiceUsed).some((n) => n > 0)) out.restored.push('All Hit Point Dice')
  if (c.spellcasting.slotsUsed.some((n) => n > 0)) out.restored.push('All spell slots')
  if (c.spellcasting.pactSlotsUsed > 0) out.restored.push('Pact Magic slots')
  if (c.exhaustion > 0) out.restored.push(`Exhaustion ${c.exhaustion} → ${c.exhaustion - 1}`)
  if (c.combat.hp.temp > 0) out.reminders.push('Temporary Hit Points ended.')
  if (c.spellcasting.concentration) out.reminders.push(`Concentration on ${c.spellcasting.concentration} ended (you slept).`)
  if (c.spellcasting.bonusSlots?.some((n) => n > 0)) out.reminders.push('Spell slots created with Sorcery Points vanished.')
  next = clearBonusSlots(next)
  const days = passDays(next, 1)
  next = days.character
  out.timers = days.changes
  next = {
    ...next,
    combat: {
      ...next.combat,
      hp: { ...next.combat.hp, current: next.combat.hp.max, temp: 0 },
      hitDiceUsed: {},
      deathSaves: { successes: 0, failures: 0 },
    },
    exhaustion: Math.max(0, c.exhaustion - 1),
    spellcasting: { ...next.spellcasting, slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactSlotsUsed: 0, concentration: '' },
    updatedAt: new Date().toISOString(),
  }
  out.character = next
  return out
}

/** Hit dice still available, by die size. */
export function hitDiceAvailable(c: Character): Record<string, number> {
  const pool = hitDicePool(c)
  const out: Record<string, number> = {}
  for (const [d, n] of Object.entries(pool)) out[d] = Math.max(0, n - (c.combat.hitDiceUsed[d] ?? 0))
  return out
}

/** Spend one Hit Point Die during a Short Rest: heal roll + Con modifier (minimum 1). */
export function spendHitDie(c: Character, die: string, roll: number): { character: Character; healed: number } | null {
  if ((hitDiceAvailable(c)[die] ?? 0) <= 0) return null
  const sides = Number(die.slice(1))
  const r = Math.min(sides, Math.max(1, Math.floor(roll)))
  const healed = Math.max(1, r + abilityMod(c.abilities.con))
  const current = Math.min(c.combat.hp.max, Math.max(0, c.combat.hp.current) + healed)
  return {
    healed,
    character: {
      ...c,
      combat: {
        ...c.combat,
        hp: { ...c.combat.hp, current },
        hitDiceUsed: { ...c.combat.hitDiceUsed, [die]: (c.combat.hitDiceUsed[die] ?? 0) + 1 },
        deathSaves: { successes: 0, failures: 0 },
      },
    },
  }
}

/** Uses left for a counter, clamped (max may be a formula). */
export function usesLeft(c: Character, u: Uses): { left: number; max: number } {
  const max = usesMax(c, u.max)
  return { max, left: Math.max(0, max - Math.min(u.used, max)) }
}
