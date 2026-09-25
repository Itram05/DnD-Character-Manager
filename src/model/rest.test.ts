import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { hitDiceAvailable, longRest, shortRest, spendHitDie } from './rest'

const hero = () =>
  normalizeCharacter({
    classes: [
      { id: 'fighter', level: 3 },
      { id: 'warlock', level: 2 },
      { id: 'cleric', level: 1 },
    ],
    abilities: { con: 14 },
    combat: { hp: { max: 40, current: 10, temp: 6 }, hitDiceUsed: { d10: 3, d8: 1 } },
    exhaustion: 2,
    features: [
      { name: 'Action Surge', activation: 'free', uses: { max: 1, used: 1, recharge: 'short' } },
      { name: 'Second Wind', activation: 'bonus', uses: { max: 'fighter.second-wind', used: 2, recharge: 'long', shortRestRegain: 1 } },
      { name: 'Divine Intervention', uses: { max: 1, used: 1, recharge: 'long' } },
      { name: 'Luck', uses: { max: 1, used: 1, recharge: 'dawn' } },
      { name: 'Arcane-ish thing', description: 'When you finish a Short Rest, you can recover slots.' },
    ],
    spells: [{ name: 'Bless', level: 1, freeCasts: { max: 1, used: 1, recharge: 'long' } }],
    spellcasting: { slotsUsed: [2, 0, 0], pactSlotsUsed: 2, concentration: 'Hex' },
    inventory: {
      items: [
        { name: 'Wand', charges: { max: 7, used: 4, recharge: 'dawn', regain: '1d6+1' } },
        { name: 'Cloak', charges: { max: 3, used: 3, recharge: 'short' } },
      ],
    },
  }).character

const feat = (c: ReturnType<typeof hero>, n: string) => c.features.find((f) => f.name === n)!.uses!.used

describe('Short Rest', () => {
  const r = shortRest(hero())
  const c = r.character
  it('restores short-rest features and item charges', () => {
    expect(feat(c, 'Action Surge')).toBe(0)
    expect(c.inventory.items[1].charges!.used).toBe(0)
  })
  it('long-rest features with shortRestRegain get that many back', () => {
    expect(feat(c, 'Second Wind')).toBe(1)
  })
  it('long-rest features stay spent', () => {
    expect(feat(c, 'Divine Intervention')).toBe(1)
    expect(c.spells[0].freeCasts!.used).toBe(1)
  })
  it('restores Pact Magic slots but not regular slots', () => {
    expect(c.spellcasting.pactSlotsUsed).toBe(0)
    expect(c.spellcasting.slotsUsed[0]).toBe(2)
  })
  it('keeps HP, temp HP, hit dice, exhaustion and concentration', () => {
    expect(c.combat.hp).toEqual({ max: 40, current: 10, temp: 6 })
    expect(c.combat.hitDiceUsed).toEqual({ d10: 3, d8: 1 })
    expect(c.exhaustion).toBe(2)
    expect(c.spellcasting.concentration).toBe('Hex')
  })
  it('dawn only if asked', () => {
    expect(feat(c, 'Luck')).toBe(1)
    expect(feat(shortRest(hero(), { dawn: true }).character, 'Luck')).toBe(0)
  })
  it('reminds about features it cannot automate', () => {
    expect(r.reminders.join(' ')).toContain('Arcane-ish thing')
  })
})

describe('Long Rest (2024)', () => {
  const r = longRest(hero())
  const c = r.character
  it('regains all HP and ALL spent Hit Point Dice, ends temp HP', () => {
    expect(c.combat.hp).toEqual({ max: 40, current: 40, temp: 0 })
    expect(c.combat.hitDiceUsed).toEqual({})
  })
  it('reduces exhaustion by 1', () => {
    expect(c.exhaustion).toBe(1)
  })
  it('restores short and long features, free casts, all slots', () => {
    expect(feat(c, 'Action Surge')).toBe(0)
    expect(feat(c, 'Second Wind')).toBe(0)
    expect(feat(c, 'Divine Intervention')).toBe(0)
    expect(c.spells[0].freeCasts!.used).toBe(0)
    expect(c.spellcasting.slotsUsed).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(c.spellcasting.pactSlotsUsed).toBe(0)
  })
  it('dawn recharge by default, but rolled regains are left as a reminder', () => {
    expect(feat(c, 'Luck')).toBe(0)
    expect(c.inventory.items[0].charges!.used).toBe(4)
    expect(r.reminders.join(' ')).toContain('1d6+1')
  })
  it('ends concentration', () => {
    expect(c.spellcasting.concentration).toBe('')
  })
})

describe('Hit Point Dice', () => {
  it('pool by die type; spending heals roll + Con (min 1)', () => {
    const c = hero()
    expect(hitDiceAvailable(c)).toEqual({ d10: 0, d8: 2 }) // fighter d10 x3; warlock d8 x2 + cleric d8 x1
    expect(spendHitDie(c, 'd10', 5)).toBeNull()
    const r = spendHitDie(c, 'd8', 6)!
    expect(r.healed).toBe(8)
    expect(r.character.combat.hp.current).toBe(18)
    expect(hitDiceAvailable(r.character).d8).toBe(1)
    const weak = normalizeCharacter({ classes: [{ id: 'wizard', level: 1 }], abilities: { con: 6 }, combat: { hp: { max: 8, current: 1 } } }).character
    expect(spendHitDie(weak, 'd6', 1)!.healed).toBe(1)
  })
})
