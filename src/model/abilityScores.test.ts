// An item can raise or set an ability score (2026-10-11; a gap the first blind test of the AI guide found).
// The hero's own score stays in `abilities`; the item's change is applied while the item counts, under the
// rule of every other item bonus: equipped, and attuned if the item requires attunement.
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { playPassivePowers, passiveSource } from './play'
import { abilityScore, abilityScoreView, armorClass, attackStats, castingStats, evalFormula, initiative, mods, savingThrow, skillMod } from './rules'
import { characterToJson } from './storage'

type Obj = Record<string, unknown>
const hero = (items: Obj[], extra: Obj = {}) =>
  normalizeCharacter({
    schemaVersion: 3,
    name: 'Scores',
    classes: [{ id: 'cleric', level: 5 }],
    abilities: { str: 12, dex: 14, con: 16, int: 10, wis: 18, cha: 8 },
    attacks: [{ id: 'm', name: 'Mace', ability: 'str', damage: '1d6' }],
    inventory: { items },
    ...extra,
  })
const amulet = (over: Obj = {}) => ({ id: 'am', name: 'Amulet of Health', equipped: true, requiresAttunement: true, attuned: true, abilityScores: [{ ability: 'con', mode: 'set', value: 19 }], ...over })

describe('an item that sets a score', () => {
  it('makes it that number while equipped and attuned', () => {
    const c = hero([amulet()]).character
    expect(abilityScore(c, 'con')).toBe(19)
    expect(c.abilities.con).toBe(16)
    expect(abilityScoreView(c, 'con')).toEqual({ value: 19, base: 16, parts: [{ item: 'Amulet of Health', mode: 'set', value: 19, to: 19 }] })
  })
  it('does nothing when not attuned, or not equipped', () => {
    expect(abilityScore(hero([amulet({ attuned: false })]).character, 'con')).toBe(16)
    expect(abilityScore(hero([amulet({ equipped: false })]).character, 'con')).toBe(16)
  })
  it('does nothing to a score that is already higher', () => {
    const c = hero([amulet()], { abilities: { con: 20 } }).character
    expect(abilityScoreView(c, 'con')).toEqual({ value: 20, base: 20, parts: [] })
  })
  it('of two, the higher wins', () => {
    const c = hero([
      { name: 'Gauntlets of Ogre Power', equipped: true, abilityScores: [{ ability: 'str', mode: 'set', value: 19 }] },
      { name: 'Belt of Hill Giant Strength', equipped: true, abilityScores: [{ ability: 'str', mode: 'set', value: 21 }] },
    ]).character
    expect(abilityScore(c, 'str')).toBe(21)
  })
})

describe('an item that adds to a score', () => {
  const belt = (over: Obj = {}) => ({ name: 'Belt of Dwarvenkind', equipped: true, abilityScores: [{ ability: 'con', mode: 'add', value: 2, ...over }] })
  it('adds, up to 20 when the item names no maximum', () => {
    expect(abilityScore(hero([belt()]).character, 'con')).toBe(18)
    expect(abilityScore(hero([belt()], { abilities: { con: 19 } }).character, 'con')).toBe(20)
  })
  it('follows the maximum the item names', () => {
    expect(abilityScore(hero([belt({ max: 17 })]).character, 'con')).toBe(17)
    expect(abilityScore(hero([belt({ max: 30 })], { abilities: { con: 20 } }).character, 'con')).toBe(22)
  })
  it('never lowers a score that is already above the maximum', () => {
    expect(abilityScore(hero([belt()], { abilities: { con: 22 } }).character, 'con')).toBe(22)
  })
  it('a minus (a cursed item) has no maximum and stops at 1', () => {
    expect(abilityScore(hero([belt({ value: -4 })], { abilities: { con: 22 } }).character, 'con')).toBe(18)
    expect(abilityScore(hero([belt({ value: -30 })]).character, 'con')).toBe(1)
  })
  it('bonuses first, then the set: the order of the items does not matter', () => {
    const stone = { name: 'Ioun Stone', equipped: true, abilityScores: [{ ability: 'str', mode: 'add', value: 2 }] }
    const giant = { name: 'Belt of Hill Giant Strength', equipped: true, abilityScores: [{ ability: 'str', mode: 'set', value: 21 }] }
    expect(abilityScore(hero([stone, giant]).character, 'str')).toBe(21)
    expect(abilityScore(hero([giant, stone]).character, 'str')).toBe(21)
  })
})

describe('what follows the score', () => {
  const plain = hero([]).character
  const c = hero([
    amulet(),
    { name: 'Gloves', equipped: true, abilityScores: [{ ability: 'dex', mode: 'add', value: 2 }, { ability: 'str', mode: 'set', value: 19 }, { ability: 'wis', mode: 'add', value: 2 }] },
  ]).character
  it('modifiers, saves, skills, Initiative, AC', () => {
    expect(mods(c)).toMatchObject({ str: 4, dex: 3, con: 4, wis: 5 })
    expect(savingThrow(c, 'con').mod).toBe(savingThrow(plain, 'con').mod + 1)
    expect(skillMod(c, 'athletics')).toBe(skillMod(plain, 'athletics') + 3)
    expect(initiative(c)).toBe(initiative(plain) + 1)
    expect(armorClass(c).total).toBe(armorClass(plain).total + 1)
  })
  it('attacks, the spell save DC and the spell attack', () => {
    expect(attackStats(c, c.attacks[0])).toEqual({ toHit: 7, dmgMod: 4 })
    expect(castingStats(c)[0]).toMatchObject({ saveDc: 16, attack: 8 })
    expect(castingStats(plain)[0]).toMatchObject({ saveDc: 15, attack: 7 })
  })
  it('formulas: the modifier and the score', () => {
    expect(evalFormula(c, 'con').value).toBe(4)
    expect(evalFormula(c, 'str_score').value).toBe(19)
  })
  it('a chip under "Always on" for each change, edited in the item', () => {
    const chips = playPassivePowers(c).map((x) => x.power.name)
    expect(chips).toEqual(['Constitution 19', '+2 Dexterity', 'Strength 19', '+2 Wisdom'])
    const key = playPassivePowers(c)[0].power.id
    expect(passiveSource(c, key)).toEqual({ item: c.inventory.items[0] })
  })
  it('no chip while the item does not count', () => {
    expect(playPassivePowers(hero([amulet({ attuned: false })]).character)).toEqual([])
  })
})

describe('abilityScores in a file', () => {
  it('reads back what it wrote, with no warning', () => {
    const r = hero([amulet(), { name: 'Belt', equipped: true, abilityScores: [{ ability: 'con', mode: 'add', value: 2, max: 22 }] }])
    expect(r.warnings).toEqual([])
    const again = normalizeCharacter(JSON.parse(characterToJson(r.character)))
    expect(again.warnings).toEqual([])
    expect(again.character.inventory.items.map((i) => i.abilityScores)).toEqual([
      [{ ability: 'con', mode: 'set', value: 19 }],
      [{ ability: 'con', mode: 'add', value: 2, max: 22 }],
    ])
  })
  it('an item without the field gets none', () => {
    const c = hero([{ name: 'Rope' }]).character
    expect('abilityScores' in c.inventory.items[0]).toBe(false)
  })
  it('accepts long ability names and a missing mode (a bonus)', () => {
    const c = hero([{ name: 'Stone', equipped: true, abilityScores: [{ ability: 'Strength', value: 2 }] }]).character
    expect(c.inventory.items[0].abilityScores).toEqual([{ ability: 'str', mode: 'add', value: 2 }])
  })
  it('says what it could not use', () => {
    const r = hero([{ name: 'Odd', abilityScores: [{ ability: 'luck', mode: 'set', value: 19 }, { ability: 'con', mode: 'set', value: 19, max: 20 }, { ability: 'str' }, 'x'] }])
    expect(r.character.inventory.items[0].abilityScores).toEqual([{ ability: 'con', mode: 'set', value: 19 }])
    expect(r.warnings).toEqual([
      'inventory.items[0].abilityScores[0].ability: unknown ability "luck", ignored.',
      'inventory.items[0].abilityScores[1].max: ignored: a score that is set has no maximum (the item sets it to 19 unless it is already higher).',
      'inventory.items[0].abilityScores[2]: no value, ignored.',
      'inventory.items[0].abilityScores[3]: expected an object like { "ability": "con", "mode": "set", "value": 19 }, ignored.',
    ])
  })
})
