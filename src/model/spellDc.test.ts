// Spell save DC in the head (2026-09-29): 8 + spellcasting ability + PB + item bonuses; one value per
// spellcasting ability; nothing for a non-caster. The item bonuses are the fields spellDcBonus and
// spellAttackBonus (the conversion of the old powers named "+1 spell save DC" is in spellBonus.test.ts).
// Also the one-tap "Set to the level's minimum" for XP that lags behind the sheet's level.
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { castingStats, itemSpellBonuses, spellDcView } from './rules'
import { raiseXpToLevel, undoLastXp, xpProgress } from './xp'

const make = (raw: Record<string, unknown>) => normalizeCharacter(raw).character

const witchFocus = { id: 'wf', name: 'Witch Focus', quantity: 1, equipped: true, spellDcBonus: 1 }
const staff = {
  id: 'st',
  name: 'Staff of Ages',
  quantity: 1,
  equipped: true,
  requiresAttunement: true,
  attuned: true,
  spellAttackBonus: 3,
  powers: [{ id: 'p3', name: 'Temporal Echo', activation: 'reaction', description: '+1 spell save DC in the text of a power does not count.' }],
}
// Paladin 5 / Sorcerer 9, CHA 20: PB +5, CHA +5
const grav = (items: unknown[] = []) =>
  make({ name: 'Grav', abilities: { str: 10, dex: 16, con: 15, int: 8, wis: 8, cha: 20 }, classes: [{ id: 'paladin', level: 5 }, { id: 'sorcerer', level: 9 }], inventory: { items } })

describe('spell save DC', () => {
  it('Paladin + Sorcerer share Charisma: one value, 8 + 5 + 5 = 18', () => {
    const v = spellDcView(grav())
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ ability: 'cha', saveDc: 18, attack: 10, classes: ['Paladin', 'Sorcerer'] })
  })
  it('the Witch Focus adds +1 to the DC, the Staff +3 to the attack only', () => {
    const v = spellDcView(grav([witchFocus, staff]))[0]
    expect(v.saveDc).toBe(19)
    expect(v.attack).toBe(13)
    expect(v.dcParts.map((p) => [p.kind, p.value])).toEqual([['base', 8], ['ability', 5], ['pb', 5], ['item', 1]])
    expect(v.dcParts[3].label).toBe('Witch Focus')
    expect(v.attackParts.at(-1)).toEqual({ kind: 'item', label: 'Staff of Ages', value: 3 })
  })
  it('the Spells and Stats tabs get the same numbers (castingStats includes the items)', () => {
    expect(castingStats(grav([witchFocus, staff])).map((s) => [s.saveDc, s.attack])).toEqual([
      [19, 13],
      [19, 13],
    ])
  })
  it('same rule as AC: an item that is not equipped adds nothing', () => {
    const off = { ...witchFocus, equipped: false }
    expect(itemSpellBonuses(grav([off])).dc).toEqual([])
    expect(spellDcView(grav([off]))[0].saveDc).toBe(18)
  })
  it('same rule as AC: equipped but needs attunement and is not attuned adds nothing', () => {
    const off = { ...staff, attuned: false }
    expect(itemSpellBonuses(grav([off])).attack).toEqual([])
    expect(spellDcView(grav([off]))[0].attack).toBe(10)
  })
  it('text never counts: a power or a description saying "+2 spell save DC" adds nothing', () => {
    const b = itemSpellBonuses(grav([staff]))
    expect(b.dc).toEqual([])
    expect(b.attack).toHaveLength(1)
    const loose = { id: 'x', name: 'Rod', quantity: 1, equipped: true, description: '+2 spell save DC', powers: [{ id: 'q', name: 'Spell focus', activation: 'passive', description: '+2 spell save DC' }] }
    expect(itemSpellBonuses(grav([loose])).dc).toEqual([])
  })
  it('a negative value counts too (a cursed focus)', () => {
    expect(spellDcView(grav([{ id: 'z', name: 'Cursed Rod', equipped: true, spellDcBonus: -2 }]))[0].saveDc).toBe(16)
  })
  it('Cleric (WIS) + Wizard (INT) show two values, highest first', () => {
    const c = make({ abilities: { str: 10, dex: 10, con: 10, int: 14, wis: 18, cha: 10 }, classes: [{ id: 'wizard', level: 3 }, { id: 'cleric', level: 2 }] })
    const v = spellDcView(c)
    expect(v.map((x) => [x.ability, x.saveDc])).toEqual([
      ['wis', 15],
      ['int', 13],
    ])
  })
  it('a Fighter has no spell DC (the head shows no chip)', () => {
    expect(spellDcView(make({ classes: [{ id: 'fighter', level: 5 }] }))).toEqual([])
  })
})

describe('XP behind the level: one tap to the level minimum', () => {
  it('91 550 at level 14 → 140 000, logged as a correction, Undo gives 91 550 back', () => {
    const c = { ...grav(), xp: 91550 }
    const p = xpProgress(c)
    expect(p).toMatchObject({ belowLevel: true, level: 14, from: 140000, next: 165000, fraction: 0, missing: 73450 })
    const up = raiseXpToLevel(c, '2026-09-29')
    expect(up.xp).toBe(140000)
    expect(up.xpLog.at(-1)).toMatchObject({ kind: 'correction', amount: 48450, date: '2026-09-29' })
    expect(xpProgress(up)).toMatchObject({ belowLevel: false, levelsReady: 0, missing: 25000 })
    expect(undoLastXp(up).xp).toBe(91550)
  })
  it('does nothing when the XP already reaches the level (same object)', () => {
    const c = { ...grav(), xp: 150000 }
    expect(raiseXpToLevel(c)).toBe(c)
  })
})
