// Wave 1: consumable counters on the Play screen, cards split by kind, Sorcery Points and Flexible Casting.
import { describe, expect, it } from 'vitest'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { castSpell, manaRows, paymentOptions, playCards, spendSlot, useCard } from './play'
import { longRest, shortRest } from './rest'
import { spellSlots } from './rules'
import {
  SLOT_COST,
  canPointsToSlot,
  canSlotToPoints,
  isSorceryPoints,
  pointsToSlot,
  slotToPoints,
  slotTotal,
  sorceryFeature,
  sorceryPoints,
} from './sorcery'
import type { Character } from './types'

const sorcerer = (extra: object = {}, uses: object = { max: 'sorcerer.sorcery-points', recharge: 'long', note: 'Sorcery Points' }) =>
  normalizeCharacter({
    name: 'S',
    classes: [{ id: 'sorcerer', level: 5 }],
    features: [
      { id: 'fom', name: 'Font of Magic', activation: 'special', uses },
      { id: 'ins', name: 'Innate Sorcery', activation: 'bonus', uses: { max: 2, recharge: 'long' } },
    ],
    spells: [{ id: 'fb', name: 'Fireball', level: 3, prepared: true, castingTime: 'Action' }],
    inventory: {
      items: [
        { id: 'pot', name: 'Potion of Healing', quantity: 3, activation: 'action' },
        { id: 'wand', name: 'Wand', quantity: 1, activation: 'action', charges: { max: 7, recharge: 'dawn' } },
        { id: 'rope', name: 'Rope', quantity: 1 },
      ],
    },
    ...extra,
  }).character

const points = (c: Character) => sorceryPoints(c)!

describe('consumables (potions, scrolls)', () => {
  it('an item with activation and no charges is a card with a quantity', () => {
    const c = sorcerer()
    const pot = playCards(c).find((x) => x.id === 'pot')!
    expect(pot.quantity).toBe(3)
    expect(pot.uses).toBeUndefined()
    expect(playCards(c).find((x) => x.id === 'wand')!.quantity).toBeUndefined()
    expect(playCards(c).find((x) => x.id === 'rope')).toBeUndefined()
  })
  it('minus uses one, plus puts one back, never below zero', () => {
    let c = sorcerer()
    const card = { kind: 'item' as const, id: 'pot' }
    c = useCard(c, card, 1)
    expect(c.inventory.items[0].quantity).toBe(2)
    c = useCard(c, card, -1)
    expect(c.inventory.items[0].quantity).toBe(3)
    for (let i = 0; i < 5; i++) c = useCard(c, card, 1)
    expect(c.inventory.items[0].quantity).toBe(0)
    expect(playCards(c).find((x) => x.id === 'pot')!.tapped).toBe(true)
    c = useCard(c, card, -1)
    expect(c.inventory.items[0].quantity).toBe(1)
  })
})

describe('cards by kind', () => {
  it('every card has one of the filterable kinds', () => {
    const kinds = new Set(playCards(sorcerer()).map((x) => x.kind))
    expect([...kinds].sort()).toEqual(['feature', 'item', 'spell'])
  })
})

describe('recognizing Sorcery Points', () => {
  it('by note, by formula, by marker', () => {
    expect(isSorceryPoints({ max: 3, used: 0, recharge: 'long', note: 'sorcery points' })).toBe(true)
    expect(isSorceryPoints({ max: 'sorcerer', used: 0, recharge: 'long' })).toBe(true)
    expect(isSorceryPoints({ max: 'Sorcerer.sorcery-points', used: 0, recharge: 'long' })).toBe(true)
    expect(isSorceryPoints({ max: 4, used: 0, recharge: 'long', resource: 'sorcery-points' })).toBe(true)
    expect(isSorceryPoints({ max: 'sorcerer + 1', used: 0, recharge: 'long' })).toBe(false)
    expect(isSorceryPoints({ max: 2, used: 0, recharge: 'long' })).toBe(false)
    expect(isSorceryPoints(undefined)).toBe(false)
  })
  it('the explicit marker wins over a guess', () => {
    const c = normalizeCharacter({
      classes: [{ id: 'sorcerer', level: 5 }],
      features: [
        { id: 'a', name: 'Guess', uses: { max: 'sorcerer', recharge: 'long' } },
        { id: 'b', name: 'Marked', uses: { max: 3, recharge: 'long', resource: 'sorcery-points' } },
      ],
    }).character
    expect(sorceryFeature(c)!.id).toBe('b')
  })
  it('an unknown marker is dropped with a warning', () => {
    const r = normalizeCharacter({ features: [{ name: 'X', uses: { max: 1, resource: 'ki' } }] })
    expect(r.character.features[0].uses!.resource).toBeUndefined()
    expect(r.warnings.join('\n')).toMatch(/resource/)
  })
  it('the Sorcery Points feature is not a card in a hand', () => {
    const c = sorcerer()
    expect(playCards(c).some((x) => x.id === 'fom')).toBe(false)
    expect(playCards(c).some((x) => x.id === 'ins')).toBe(true)
    expect(points(c)).toMatchObject({ max: 5, left: 5 })
  })
  it('no Sorcery Points for a character without them', () => {
    expect(sorceryPoints(normalizeCharacter({ classes: [{ id: 'wizard', level: 5 }] }).character)).toBeUndefined()
  })
})

describe('Flexible Casting', () => {
  it('costs match the table: 2 / 3 / 5 / 6 / 7', () => {
    expect([1, 2, 3, 4, 5].map((l) => SLOT_COST[l])).toEqual([2, 3, 5, 6, 7])
    expect(SLOT_COST[6]).toBeUndefined()
  })

  it('slot -> points: gain points equal to the slot level', () => {
    let c = sorcerer()
    c = useCard(c, { kind: 'feature', id: 'fom' }, 4) // 1 point left
    expect(canSlotToPoints(c, 3)).toBe(true)
    const r = slotToPoints(c, 3)!
    expect(r.gained).toBe(3)
    expect(points(r.character).left).toBe(4)
    expect(r.character.spellcasting.slotsUsed[2]).toBe(1)
  })

  it('slot -> points is capped at the maximum', () => {
    let c = sorcerer()
    c = useCard(c, { kind: 'feature', id: 'fom' }, 1) // 4 of 5
    const r = slotToPoints(c, 3)!
    expect(r.gained).toBe(1)
    expect(points(r.character).left).toBe(5)
    // full points: nothing to gain, button disabled
    expect(canSlotToPoints(r.character, 1)).toBe(false)
    expect(slotToPoints(r.character, 1)).toBeNull()
  })

  it('slot -> points needs a slot of that level left', () => {
    let c = sorcerer()
    c = useCard(c, { kind: 'feature', id: 'fom' }, 5)
    c = spendSlot(c, 'slot', 3, 2) // Sorcerer 5 has two 3rd-level slots
    expect(canSlotToPoints(c, 3)).toBe(false)
    expect(canSlotToPoints(c, 4)).toBe(false) // no 4th-level slots at all
  })

  it('points -> slot creates a slot above the maximum', () => {
    const c = sorcerer()
    expect(spellSlots(c)[0]).toBe(4)
    const r = pointsToSlot(c, 1)!
    expect(points(r.character).left).toBe(3)
    expect(r.character.spellcasting.bonusSlots![0]).toBe(1)
    expect(slotTotal(r.character, 1)).toBe(5)
    expect(manaRows(r.character)[0]).toMatchObject({ level: 1, max: 5, bonus: 1, used: 0 })
  })

  it('points -> slot can create a level the character does not have yet (up to 5th)', () => {
    let c = normalizeCharacter({
      classes: [{ id: 'sorcerer', level: 20 }],
      features: [{ id: 'fom', name: 'Font of Magic', uses: { max: 'sorcerer', recharge: 'long' } }],
    }).character
    c = { ...c, spellcasting: { ...c.spellcasting, slotsOverride: [1] } }
    expect(manaRows(c).map((r) => r.level)).toEqual([1])
    const r = pointsToSlot(c, 5)!
    expect(manaRows(r.character).map((x) => [x.level, x.max, x.bonus])).toEqual([
      [1, 1, 0],
      [5, 1, 1],
    ])
    expect(canPointsToSlot(c, 6)).toBe(false)
  })

  it('points -> slot needs enough points', () => {
    let c = sorcerer()
    c = useCard(c, { kind: 'feature', id: 'fom' }, 1) // 4 left
    expect(canPointsToSlot(c, 2)).toBe(true)
    expect(canPointsToSlot(c, 3)).toBe(false)
    expect(pointsToSlot(c, 3)).toBeNull()
  })

  it('a created slot is spent by casting and lets you cast above the table', () => {
    let c = sorcerer()
    c = spendSlot(c, 'slot', 3, 2)
    const fireball = c.spells[0]
    expect(paymentOptions(c, fireball)).toEqual([])
    c = pointsToSlot(c, 3)!.character
    expect(paymentOptions(c, fireball)).toEqual([{ kind: 'slot', level: 3 }])
    c = castSpell(c, 'fb', { kind: 'slot', level: 3 }).character
    expect(c.spellcasting.slotsUsed[2]).toBe(3)
    expect(paymentOptions(c, fireball)).toEqual([])
    // the mana pips can restore it again (misclick)
    c = spendSlot(c, 'slot', 3, -1)
    expect(c.spellcasting.slotsUsed[2]).toBe(2)
  })

  it('created slots survive a Short Rest and vanish on a Long Rest', () => {
    let c = pointsToSlot(sorcerer(), 2)!.character
    c = shortRest(c).character
    expect(c.spellcasting.bonusSlots![1]).toBe(1)
    const r = longRest(c)
    expect(r.character.spellcasting.bonusSlots).toBeUndefined()
    expect(slotTotal(r.character, 2)).toBe(3)
    expect(r.reminders.join('\n')).toMatch(/Sorcery Points vanished/)
    expect(points(r.character).left).toBe(5)
  })

  it('bonusSlots survive export and import', () => {
    const c = pointsToSlot(sorcerer(), 2)!.character
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })

  it('a character file without bonusSlots stays without them', () => {
    const c = sorcerer()
    expect('bonusSlots' in c.spellcasting).toBe(false)
    expect(longRest(c).character.spellcasting).not.toHaveProperty('bonusSlots')
  })
})
