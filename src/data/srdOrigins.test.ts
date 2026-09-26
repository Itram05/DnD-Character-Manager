import { describe, expect, it } from 'vitest'
import { SRD_BACKGROUNDS, SRD_CLASSES, SRD_SPECIES } from './srd'
import { POINT_COST, SPECIES_TRAIT_PRESETS, STANDARD_ARRAY, backgroundInfo, speciesChoice, speciesSizes, suggestedArray } from './srdOrigins'

describe('backgrounds', () => {
  it('all four SRD backgrounds parse completely', () => {
    expect(SRD_BACKGROUNDS.map((b) => b.name)).toEqual(['Acolyte', 'Criminal', 'Sage', 'Soldier'])
    for (const b of SRD_BACKGROUNDS) {
      const info = backgroundInfo(b.name)!
      expect(info.abilities).toHaveLength(3)
      expect(info.skills).toHaveLength(2)
      expect(info.featText).not.toBe('')
      expect(info.tool).not.toBe('')
      expect(info.equipment).toMatch(/50 GP/)
    }
  })
  it('Acolyte details', () => {
    const a = backgroundInfo('Acolyte')!
    expect(a.abilities).toEqual(['int', 'wis', 'cha'])
    expect(a.feat).toBe('Magic Initiate (Cleric)')
    expect(a.featBase).toBe('Magic Initiate')
    expect(a.skills).toEqual(['Insight', 'Religion'])
    expect(a.tool).toBe("Calligrapher's Supplies")
  })
  it('Soldier tool choice is plain text', () => {
    expect(backgroundInfo('Soldier')!.tool).toBe('Choose one kind of Gaming Set')
  })
})

describe('species', () => {
  it('there are nine SRD species', () => {
    expect(SRD_SPECIES).toHaveLength(9)
  })
  it('sub-choices are found with the right number of options', () => {
    const count = (n: string) => speciesChoice(n)?.options.length
    expect(count('Dragonborn')).toBe(10)
    expect(count('Elf')).toBe(3)
    expect(count('Gnome')).toBe(2)
    expect(count('Goliath')).toBe(6)
    expect(count('Tiefling')).toBe(3)
    for (const n of ['Dwarf', 'Halfling', 'Human', 'Orc']) expect(speciesChoice(n)).toBeUndefined()
  })
  it('option details', () => {
    expect(speciesChoice('Dragonborn')!.options.find((o) => o.name === 'Gold')!.text).toBe('Damage type: Fire.')
    const wood = speciesChoice('Elf')!.options.find((o) => o.name === 'Wood Elf')!
    expect(wood.speed).toBe(35)
    expect(wood.text).toMatch(/Level 3: Longstrider/)
    expect(speciesChoice('Gnome')!.options.map((o) => o.name)).toEqual(['Forest Gnome', 'Rock Gnome'])
    expect(speciesChoice('Goliath')!.options[0].name).toBe("Cloud's Jaunt (Cloud Giant)")
    expect(speciesChoice('Tiefling')!.options.map((o) => o.name)).toEqual(['Abyssal', 'Chthonic', 'Infernal'])
  })
  it('sizes', () => {
    expect(speciesSizes('Human')).toEqual(['Medium', 'Small'])
    expect(speciesSizes('Tiefling')).toEqual(['Medium', 'Small'])
    expect(speciesSizes('Gnome')).toEqual(['Small'])
    expect(speciesSizes('Goliath')).toEqual(['Medium'])
  })
  it('trait presets point at real traits', () => {
    for (const key of Object.keys(SPECIES_TRAIT_PRESETS)) {
      const [sp, trait] = key.split(':')
      expect(SRD_SPECIES.find((s) => s.name === sp)?.traits.some((t) => t.name === trait), key).toBe(true)
    }
  })
})

describe('ability score tables', () => {
  it('every class has a suggested standard array that uses each value once', () => {
    for (const c of SRD_CLASSES) {
      const s = suggestedArray(c.id)!
      expect(Object.values(s).sort((a, b) => b - a)).toEqual([...STANDARD_ARRAY])
    }
  })
  it('the suggestion puts 15 in a primary ability', () => {
    for (const c of SRD_CLASSES) {
      const s = suggestedArray(c.id)!
      expect(c.primaryAbility.some((a) => s[a] === 15), c.id).toBe(true)
    }
  })
  it('point costs', () => {
    expect(POINT_COST[8]).toBe(0)
    expect(POINT_COST[14]).toBe(7)
    expect(POINT_COST[15]).toBe(9)
  })
})
