import { describe, expect, it } from 'vitest'
import { SRD_CLASSES } from '../data/srd'
import { normalizeCharacter } from './normalize'
import { MULTICLASS_SLOTS, pactSlots, spellSlots } from './rules'

const make = (classes: object[]) => normalizeCharacter({ classes }).character

describe('parsed SRD class tables agree with the official Multiclass Spellcaster table', () => {
  // This checks the Markdown parser: single-class tables must match the formula.
  for (const cls of SRD_CLASSES.filter((c) => c.spellcasting && c.spellcasting.type !== 'pact')) {
    it(cls.name, () => {
      for (const row of cls.table) {
        const eff = cls.spellcasting!.type === 'full' ? row.level : Math.ceil(row.level / 2)
        const fromTable = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => Number(row.values[`slot${i}`] || 0))
        expect(fromTable, `${cls.name} level ${row.level}`).toEqual(MULTICLASS_SLOTS[eff - 1])
      }
    })
  }
})

describe('spell slots', () => {
  it('non-casters have none', () => {
    expect(spellSlots(make([{ id: 'fighter', level: 10 }]))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
  it('single class uses its own table (Paladin 1 has 2 slots in 2024)', () => {
    expect(spellSlots(make([{ id: 'paladin', level: 1 }]))[0]).toBe(2)
    expect(spellSlots(make([{ id: 'wizard', level: 5 }])).slice(0, 3)).toEqual([4, 3, 2])
  })
  it('SRD example: Ranger 4 / Sorcerer 3 = caster level 5 -> 4/3/2', () => {
    expect(spellSlots(make([{ id: 'ranger', level: 4 }, { id: 'sorcerer', level: 3 }])).slice(0, 4)).toEqual([4, 3, 2, 0])
  })
  it('half casters round up (2024): Paladin 1 / Ranger 1 = level 2 -> 3 slots', () => {
    expect(spellSlots(make([{ id: 'paladin', level: 1 }, { id: 'ranger', level: 1 }]))[0]).toBe(3)
  })
  it('Wizard 5 / Cleric 3 = level 8 -> 4/3/3/2', () => {
    expect(spellSlots(make([{ id: 'wizard', level: 5 }, { id: 'cleric', level: 3 }])).slice(0, 5)).toEqual([4, 3, 3, 2, 0])
  })
  it('Warlock levels do not count (Pact Magic is separate)', () => {
    const c = make([{ id: 'paladin', level: 3 }, { id: 'sorcerer', level: 3 }, { id: 'warlock', level: 1 }])
    expect(spellSlots(c).slice(0, 3)).toEqual([4, 3, 2]) // 3 + ceil(3/2) = 5
    expect(pactSlots(c)).toEqual({ slots: 1, level: 1 })
  })
  it('Pact Magic from the Warlock table', () => {
    expect(pactSlots(make([{ id: 'warlock', level: 5 }]))).toEqual({ slots: 2, level: 3 })
    expect(pactSlots(make([{ id: 'warlock', level: 11 }]))).toEqual({ slots: 3, level: 5 })
  })
  it('third casters (Eldritch Knight via casterType)', () => {
    expect(spellSlots(make([{ id: 'fighter', level: 3, casterType: 'third', spellcastingAbility: 'int' }]))[0]).toBe(2)
    expect(spellSlots(make([{ id: 'fighter', level: 7, casterType: 'third' }])).slice(0, 2)).toEqual([4, 2])
    // multiclass: Fighter 6 (EK, floor(6/3)=2) + Wizard 3 = 5
    expect(spellSlots(make([{ id: 'fighter', level: 6, casterType: 'third' }, { id: 'wizard', level: 3 }])).slice(0, 3)).toEqual([4, 3, 2])
  })
  it('override wins', () => {
    const c = normalizeCharacter({ classes: [{ id: 'wizard', level: 1 }], spellcasting: { slotsOverride: [1, 1] } }).character
    expect(spellSlots(c).slice(0, 3)).toEqual([1, 1, 0])
  })
})
