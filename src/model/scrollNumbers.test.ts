// A scroll's own save DC and spell attack (2026-10-11): from the Spell Scroll table by the spell's level,
// or set by hand on the item. They are the scroll's numbers, never the reader's.
import { describe, expect, it } from 'vitest'
import { SCROLL_TABLE, scrollInfo, scrollNumbers } from './consumables'
import type { SrdSpell } from '../data/srd'
import { normalizeCharacter } from './normalize'
import { playCards } from './play'
import { castingStats } from './rules'
import { characterToJson } from './storage'

type Obj = Record<string, unknown>
const srd = ([
  { name: 'Fireball', level: 3, school: 'Evocation', castingTime: 'Action', range: '150 feet', components: 'V, S, M', duration: 'Instantaneous', concentration: false, ritual: false, text: 'A bright streak. 8d6 Fire damage, Dexterity saving throw.' },
  { name: 'Fire Bolt', level: 0, school: 'Evocation', castingTime: 'Action', range: '120 feet', components: 'V, S', duration: 'Instantaneous', concentration: false, ritual: false, text: 'Make a ranged spell attack. 1d10 Fire damage.' },
  { name: 'Wish', level: 9, school: 'Conjuration', castingTime: 'Action', range: 'Self', components: 'V', duration: 'Instantaneous', concentration: false, ritual: false, text: 'The mightiest spell.' },
] as const).map((s) => ({ ...s, classes: [] as string[] })) as unknown as SrdSpell[]
const hero = (items: Obj[], extra: Obj = {}) => normalizeCharacter({ schemaVersion: 3, name: 'Reader', classes: [{ id: 'wizard', level: 9 }], abilities: { int: 20 }, inventory: { items }, ...extra })
const scrollCardOf = (c: ReturnType<typeof hero>['character']) => playCards(c, srd).find((x) => x.kind === 'scroll')!

describe('the Spell Scroll table', () => {
  it('has the ten rows of the SRD', () => {
    expect(SCROLL_TABLE.map((r) => `${r.saveDc}/+${r.attack}`)).toEqual(['13/+5', '13/+5', '13/+5', '15/+7', '15/+7', '17/+9', '17/+9', '18/+10', '18/+10', '19/+11'])
  })
  it('gives nothing when the level is not known', () => {
    expect(scrollNumbers({}, undefined)).toEqual({})
  })
  it("the item's own numbers win, each on its own", () => {
    expect(scrollNumbers({ saveDc: 17 }, 3)).toEqual({ saveDc: 17, dcFrom: 'item', attack: 7, attackFrom: 'table' })
    expect(scrollNumbers({ spellAttack: 9 }, undefined)).toEqual({ attack: 9, attackFrom: 'item' })
  })
})

describe('the scroll card', () => {
  it('shows the numbers of the spell level, not of the hero', () => {
    const c = hero([{ name: 'Spell Scroll (Fireball)' }]).character
    expect(castingStats(c)[0].saveDc).toBe(17)
    expect(scrollCardOf(c).stat).toBe('DC 15 · +7 to hit')
  })
  it('a cantrip and a level 9 spell', () => {
    expect(scrollCardOf(hero([{ name: 'Scroll of Fire Bolt' }]).character).stat).toBe('DC 13 · +5 to hit')
    expect(scrollCardOf(hero([{ name: 'Scroll of Wish' }]).character).stat).toBe('DC 19 · +11 to hit')
  })
  it("takes the level from the hero's own spell of that name", () => {
    const c = hero([{ name: 'Scroll of Mind Spike' }], { spells: [{ name: 'Mind Spike', level: 5 }] }).character
    expect(scrollCardOf(c).stat).toBe('DC 17 · +9 to hit')
  })
  it('shows the numbers set by hand in place of the table', () => {
    const c = hero([{ name: 'Spell Scroll (Fireball)', saveDc: 18, spellAttack: 10 }]).character
    expect(scrollCardOf(c).stat).toBe('DC 18 · +10 to hit')
    expect(scrollInfo(c, c.inventory.items[0], srd).numbers).toMatchObject({ dcFrom: 'item', attackFrom: 'item' })
  })
  it('a scroll of an unknown spell has no numbers, until they are set by hand', () => {
    expect(scrollCardOf(hero([{ name: 'Scroll of Nine Hells' }]).character).stat).toBeUndefined()
    expect(scrollCardOf(hero([{ name: 'Scroll of Nine Hells', saveDc: 15 }]).character).stat).toBe('DC 15')
  })
  it('2024 Exhaustion comes off the attack, never off the DC', () => {
    const c = hero([{ name: 'Spell Scroll (Fireball)' }], { exhaustion: 2 }).character
    expect(scrollCardOf(c).stat).toBe('DC 15 · +3 to hit')
  })
  it('2014 Exhaustion 3 marks Disadvantage', () => {
    const c = hero([{ name: 'Spell Scroll (Fireball)' }], { exhaustion: 3, exhaustionRules: '2014' }).character
    expect(scrollCardOf(c).stat).toBe('DC 15 · +7 to hit (DIS)')
  })
})

describe('saveDc and spellAttack in a file', () => {
  it('round trip, no warning; absent stays absent', () => {
    const r = hero([{ name: 'Spell Scroll (Fireball)', saveDc: 18, spellAttack: 10 }, { name: 'Scroll of Wish' }])
    expect(r.warnings).toEqual([])
    const again = normalizeCharacter(JSON.parse(characterToJson(r.character)))
    expect(again.warnings).toEqual([])
    expect(again.character.inventory.items[0]).toMatchObject({ saveDc: 18, spellAttack: 10 })
    expect('saveDc' in again.character.inventory.items[1]).toBe(false)
    expect('spellAttack' in again.character.inventory.items[1]).toBe(false)
  })
})
