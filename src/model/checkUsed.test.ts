// "used" is checked against the maximum on import (2026-10-11; a gap the blind test of the AI guide found).
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { characterToJson } from './storage'

type Obj = Record<string, unknown>
const read = (extra: Obj) => normalizeCharacter({ schemaVersion: 3, name: 'Used', classes: [{ id: 'cleric', level: 5 }], abilities: { wis: 16 }, ...extra })

describe('a counter with more used than its maximum', () => {
  it('a feature: brought down to the maximum, and said', () => {
    const r = read({ features: [{ name: 'Channel Divinity', uses: { max: 2, used: 3, recharge: 'short' } }] })
    expect(r.character.features[0].uses!.used).toBe(2)
    expect(r.warnings).toEqual(['features[0].uses.used: "Channel Divinity" has 3 used of a maximum of 2; using 2.'])
  })
  it('a maximum written as a formula is worked out first', () => {
    const r = read({ features: [{ name: 'Wis times', uses: { max: 'max(1, wis)', used: 5, recharge: 'long' } }] })
    expect(r.character.features[0].uses!.used).toBe(3)
    expect(r.warnings).toHaveLength(1)
  })
  it('a formula the app cannot work out is left alone', () => {
    const r = read({ features: [{ name: 'Odd', uses: { max: 'luck + 1', used: 9, recharge: 'long' } }] })
    expect(r.character.features[0].uses!.used).toBe(9)
    expect(r.warnings).toEqual([])
  })
  it('free casts of a spell, charges of an item, uses of an item power', () => {
    const r = read({
      spells: [{ name: 'Misty Step', level: 2, freeCasts: { max: 1, used: 2, recharge: 'long' } }],
      inventory: { items: [{ name: 'Wand', charges: { max: 7, used: 8, recharge: 'dawn' }, powers: [{ name: 'Burst', uses: { max: 1, used: 4, recharge: 'long' } }] }] },
    })
    expect(r.character.spells[0].freeCasts!.used).toBe(1)
    expect(r.character.inventory.items[0].charges!.used).toBe(7)
    expect(r.character.inventory.items[0].powers![0].uses!.used).toBe(1)
    expect(r.warnings).toEqual([
      'spells[0].freeCasts.used: "Misty Step" has 2 used of a maximum of 1; using 1.',
      'inventory.items[0].charges.used: "Wand" has 8 used of a maximum of 7; using 7.',
      'inventory.items[0].powers[0].uses.used: "Burst" of "Wand" has 4 used of a maximum of 1; using 1.',
    ])
  })
  it('exactly at the maximum, or below: untouched and silent', () => {
    const r = read({ features: [{ name: 'A', uses: { max: 2, used: 2, recharge: 'long' } }, { name: 'B', uses: { max: 2, used: 0, recharge: 'long' } }] })
    expect(r.character.features.map((f) => f.uses!.used)).toEqual([2, 0])
    expect(r.warnings).toEqual([])
  })
})

describe('spell slots and Hit Point Dice', () => {
  it('more slots used than the class has (Cleric 5: 4 / 3 / 2)', () => {
    const r = read({ spellcasting: { slotsUsed: [4, 5, 2, 1] } })
    expect(r.character.spellcasting.slotsUsed).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0])
    expect(r.warnings).toEqual(['spellcasting.slotsUsed[1]: 5 level 2 slots used, the hero has 3; using 3.', 'spellcasting.slotsUsed[3]: 1 level 4 slots used, the hero has 0; using 0.'])
  })
  it('slots made with Flexible Casting count toward the maximum', () => {
    const r = normalizeCharacter({ schemaVersion: 3, name: 'S', classes: [{ id: 'sorcerer', level: 3 }], spellcasting: { slotsUsed: [5], bonusSlots: [1] } })
    expect(r.character.spellcasting.slotsUsed[0]).toBe(5)
    expect(r.warnings).toEqual([])
  })
  it('an override of the slots is the maximum', () => {
    const r = read({ spellcasting: { slotsUsed: [0, 0, 0, 0, 0, 1], slotsOverride: [4, 3, 2, 0, 0, 1] } })
    expect(r.warnings).toEqual([])
  })
  it('Pact Magic slots', () => {
    const r = normalizeCharacter({ schemaVersion: 3, name: 'W', classes: [{ id: 'warlock', level: 3 }], spellcasting: { pactSlotsUsed: 4 } })
    expect(r.character.spellcasting.pactSlotsUsed).toBe(2)
    expect(r.warnings).toEqual(['spellcasting.pactSlotsUsed: 4 Pact Magic slots used, the hero has 2; using 2.'])
  })
  it('Hit Point Dice; a die size the hero does not have is left alone', () => {
    const r = read({ combat: { hp: { max: 30 }, hitDiceUsed: { d8: 7, d10: 1 } } })
    expect(r.character.combat.hitDiceUsed).toEqual({ d8: 5, d10: 1 })
    expect(r.warnings).toEqual(['combat.hitDiceUsed.d8: 7 used, the hero has 5; using 5.'])
  })
})

it('a repaired file reads back silently', () => {
  const r = read({ features: [{ name: 'A', uses: { max: 2, used: 3, recharge: 'long' } }], spellcasting: { slotsUsed: [9] } })
  expect(normalizeCharacter(JSON.parse(characterToJson(r.character))).warnings).toEqual([])
})
