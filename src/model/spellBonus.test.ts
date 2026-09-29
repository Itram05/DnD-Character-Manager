// Item bonuses to spells as fields (2026-09-29): spellDcBonus / spellAttackBonus replace passive powers
// whose name was the bonus. The conversion runs on every read (v2 files and v3 files saved before the
// change), keeps the numbers the old app showed, and the "Always on" chip is made from the field.
import { describe, expect, it } from 'vitest'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { playPassivePowers } from './play'
import { spellDcView } from './rules'

const hero = (items: unknown[], schemaVersion = 2) =>
  normalizeCharacter({ schemaVersion, name: 'Grav', abilities: { cha: 20 }, classes: [{ id: 'paladin', level: 5 }, { id: 'sorcerer', level: 9 }], inventory: { items } })

const oldFocus = {
  id: 'wf',
  name: 'Witch Focus',
  equipped: false,
  description: '',
  powers: [
    { id: 'p1', name: '+1 spell save DC', activation: 'passive', description: '+1 spell save DC.' },
    { id: 'p2', name: 'Necromancy spell', activation: 'action', description: 'Once a day.' },
  ],
}
const oldStaff = {
  id: 'st',
  name: 'Staff of Ages',
  equipped: true,
  requiresAttunement: true,
  attuned: true,
  description: '+3 quarterstaff.',
  powers: [{ id: 'p3', name: '+3 spell attack', activation: 'passive', description: '**+3 to spell attack rolls** while holding it.' }],
}

describe('old bonus powers become fields', () => {
  it('Witch Focus: +1 to spellDcBonus, text to the description, the power gone, equipped with a warning', () => {
    const { character: c, warnings } = hero([oldFocus])
    const wf = c.inventory.items[0]
    expect(wf.spellDcBonus).toBe(1)
    expect(wf.powers!.map((p) => p.name)).toEqual(['Necromancy spell'])
    expect(wf.description).toBe('+1 spell save DC.')
    expect(wf.equipped).toBe(true)
    expect(warnings).toEqual([
      'inventory.items[0]: the power "+1 spell save DC" is now the item\'s spellDcBonus (1); its text was added to the item description.',
      'inventory.items[0]: "Witch Focus" is now equipped: a spell DC or spell attack bonus counts only while the item is equipped (like AC), and it counted before.',
    ])
  })
  it('Staff: the text goes after the existing description; already equipped, no equip warning; no powers left = no powers field', () => {
    const { character: c, warnings } = hero([oldStaff])
    const st = c.inventory.items[0]
    expect(st.spellAttackBonus).toBe(3)
    expect(st.powers).toBeUndefined()
    expect(st.description).toBe('+3 quarterstaff.\n\n**+3 to spell attack rolls** while holding it.')
    expect(warnings).toHaveLength(1)
  })
  it('the DC and spell attack stay what the old app showed: 19 and +13', () => {
    const v = spellDcView(hero([oldFocus, oldStaff]).character)[0]
    expect([v.saveDc, v.attack]).toEqual([19, 13])
  })
  it('also converts a schema 3 file saved before the change (the browser copy); a second read changes nothing', () => {
    const first = hero([oldFocus, oldStaff], 3)
    expect(first.character.inventory.items.map((i) => [i.spellDcBonus, i.spellAttackBonus])).toEqual([
      [1, undefined],
      [undefined, 3],
    ])
    const again = importCharacterJson(JSON.stringify(first.character))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(first.character)
  })
  it('an un-attuned item: the field is set, but it is not equipped (it did not count before and still does not)', () => {
    const { character: c, warnings } = hero([{ ...oldStaff, attuned: false, equipped: false }])
    expect(c.inventory.items[0]).toMatchObject({ spellAttackBonus: 3, equipped: false })
    expect(warnings.join(' ')).not.toContain('now equipped')
    expect(spellDcView(c)[0].attack).toBe(10)
  })
  it('the old wordings: "+2 to spell attack rolls", "+1 to your spell save DC"; two DC powers add up', () => {
    const wand = {
      name: 'Wand',
      equipped: true,
      powers: [
        { name: '+2 to spell attack rolls', activation: 'passive' },
        { name: '+1 to your spell save DC', activation: 'passive' },
        { name: '+1 spell save DC', activation: 'passive' },
      ],
    }
    const w = hero([wand]).character.inventory.items[0]
    expect([w.spellDcBonus, w.spellAttackBonus, w.powers]).toEqual([2, 2, undefined])
  })
  it('not converted: active powers, powers with a cost or uses, other names', () => {
    const rod = {
      name: 'Rod',
      powers: [
        { name: '+1 spell save DC', activation: 'action' },
        { name: '+1 spell save DC', activation: 'passive', uses: { max: 1, recharge: 'long' } },
        { name: 'Spell focus', activation: 'passive', description: '+2 spell save DC' },
      ],
    }
    const { character: c, warnings } = hero([rod])
    expect(c.inventory.items[0].spellDcBonus).toBeUndefined()
    expect(c.inventory.items[0].powers).toHaveLength(3)
    expect(warnings).toEqual([])
  })
  it('a field already set wins over a leftover old power, which is removed', () => {
    const { character: c, warnings } = hero([{ ...oldFocus, equipped: true, spellDcBonus: 2 }], 3)
    expect(c.inventory.items[0].spellDcBonus).toBe(2)
    expect(c.inventory.items[0].powers!.map((p) => p.name)).toEqual(['Necromancy spell'])
    expect(warnings[0]).toContain('was removed: the item already has spellDcBonus 2')
  })
})

describe('"Always on" chips from the fields', () => {
  const items = [
    { id: 'wf', name: 'Witch Focus', equipped: true, spellDcBonus: 1 },
    { id: 'st', name: 'Staff of Ages', equipped: true, requiresAttunement: true, attuned: true, spellAttackBonus: 3, powers: [{ name: 'Ageless', activation: 'passive' }] },
  ]
  const chips = (list: unknown[]) => playPassivePowers(hero(list, 3).character).map((x) => [x.item.name, x.power.name])

  it('one chip per bonus, before the item\'s own passive powers', () => {
    expect(chips(items)).toEqual([
      ['Witch Focus', '+1 spell save DC'],
      ['Staff of Ages', '+3 spell attack'],
      ['Staff of Ages', 'Ageless'],
    ])
  })
  it('no chip when the bonus does not count: not equipped, or not attuned', () => {
    expect(chips([{ ...items[0], equipped: false }])).toEqual([])
    // not attuned: the item is out of Play altogether (its own passive powers too)
    expect(chips([{ ...items[1], attuned: false }])).toEqual([])
    // attuned but not equipped: out of Play too, the bonus chip and its own powers (since 2026-09-29)
    expect(chips([{ ...items[1], equipped: false }])).toEqual([])
  })
  it('a negative bonus reads "−2 spell save DC"', () => {
    expect(chips([{ name: 'Cursed Rod', equipped: true, spellDcBonus: -2 }])).toEqual([['Cursed Rod', '−2 spell save DC']])
  })
})
