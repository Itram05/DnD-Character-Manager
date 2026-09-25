import { describe, expect, it } from 'vitest'
import { loadSrdSpells } from '../data/srd'
import { ImportError, importCharacterJson, normalizeCharacter } from './normalize'
import { armorClass, castingStats, pactSlots, savingThrow, spellSlots, totalLevel, usesMax } from './rules'

import sampleText from '../../examples/sample-character.json?raw'

describe('sample character', () => {
  const { character: c, warnings } = importCharacterJson(sampleText)
  it('imports without warnings', () => {
    expect(warnings).toEqual([])
  })
  it('has the expected derived values', () => {
    expect(totalLevel(c)).toBe(7)
    expect(spellSlots(c).slice(0, 3)).toEqual([4, 3, 2])
    expect(pactSlots(c)).toEqual({ slots: 1, level: 1 })
    // chain mail 16 + shield 2 + ring 1 + Defense 1
    expect(armorClass(c).total).toBe(20)
    // paladin first: Wis and Cha saves; Cha 17 (+3) + PB 3 + ring 1
    expect(savingThrow(c, 'cha').mod).toBe(7)
    expect(castingStats(c).map((s) => s.saveDc)).toEqual([14, 14, 14])
    const lay = c.features.find((f) => f.name === 'Lay On Hands')!
    expect(usesMax(c, lay.uses!.max)).toBe(15)
    const cd = c.features.find((f) => f.name === 'Channel Divinity')!
    expect(usesMax(c, cd.uses!.max)).toBe(2)
  })
  it('spell metadata matches the SRD', async () => {
    const srd = await loadSrdSpells()
    for (const s of c.spells) {
      const ref = srd.find((x) => x.name === s.name)
      expect(ref, s.name).toBeDefined()
      expect([s.name, s.level, s.concentration, s.ritual]).toEqual([s.name, ref!.level, ref!.concentration, ref!.ritual])
    }
  })
  it('round-trips through JSON unchanged', () => {
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
})

describe('broken input', () => {
  it('invalid JSON gives a readable ImportError', () => {
    expect(() => importCharacterJson('{ "name": "Bob", ')).toThrow(ImportError)
    expect(() => importCharacterJson('{ "name": "Bob", ')).toThrow(/not valid JSON/)
  })
  it('non-object is rejected', () => {
    expect(() => importCharacterJson('[1,2,3]')).toThrow(/character object/)
    expect(() => importCharacterJson('"hello"')).toThrow(ImportError)
  })
  it('newer schema version is rejected', () => {
    expect(() => importCharacterJson('{"schemaVersion": 99, "name": "X"}')).toThrow(/schema version 99/)
  })
  it('an empty object becomes a usable character', () => {
    const { character } = importCharacterJson('{}')
    expect(character.name).toBe('Unnamed hero')
    expect(character.classes.length).toBe(1)
    expect(character.abilities.str).toBe(10)
  })
  it('wrong types are coerced or dropped with warnings, never crash', () => {
    const { character, warnings } = normalizeCharacter({
      name: 'Messy',
      abilities: { str: '16', dex: 'high', strength: 3 },
      classes: [{ id: 'Rogue', level: '4' }, 'wizard', 42, { id: 'Artificer', level: 2 }],
      combat: { hp: { max: 30, current: 99 } },
      features: [{ name: 'Rage', activation: 'Bonus Action', uses: { max: 3, recharge: 'Long Rest' } }, 'Darkvision', null],
      spells: 'Fireball',
      conditions: ['Poisoned', 'exhaustion'],
      exhaustion: 9,
      inventory: {
        items: [
          { name: 'a', attuned: true },
          { name: 'b', attuned: true },
          { name: 'c', attuned: true },
          { name: 'd', attuned: true },
        ],
      },
    })
    expect(character.abilities.str).toBe(16)
    expect(character.abilities.dex).toBe(10)
    expect(character.classes.map((k) => [k.id, k.level])).toEqual([
      ['rogue', 4],
      ['wizard', 1],
      ['artificer', 2],
    ])
    expect(character.combat.hp.current).toBe(30)
    expect(character.features[0].activation).toBe('bonus')
    expect(character.features[0].uses!.recharge).toBe('long')
    expect(character.features[1].name).toBe('Darkvision')
    expect(character.spells).toEqual([])
    expect(character.conditions).toEqual(['poisoned'])
    expect(character.exhaustion).toBe(6)
    expect(character.inventory.items.filter((i) => i.attuned).length).toBe(3)
    expect(warnings.length).toBeGreaterThan(4)
    expect(warnings.join('\n')).toMatch(/Artificer.*hitDie/)
  })
})
