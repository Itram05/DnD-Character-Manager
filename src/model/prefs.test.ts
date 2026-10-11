// preferences.play (2026-10-11): the order of the attack cards and what a phone opens Play with.
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { DEFAULT_PLAY_PREFS, orderAttacks, phoneStartFilter, playPrefs, setPlayPref } from './prefs'
import { characterToJson } from './storage'

type Obj = Record<string, unknown>
const attacks = [
  { id: 'a1', name: 'Секачът на Борик', ability: 'str', damage: '1d8' },
  { id: 'a2', name: 'Throwing Axe', ability: 'str', damage: '1d6' },
  { id: 'a3', name: 'Chain hook', ability: 'str', damage: '2d6' },
  { id: 'a4', name: 'Battleaxe', ability: 'str', damage: '1d8' },
]
const read = (preferences?: Obj) => normalizeCharacter({ schemaVersion: 3, name: 'P', classes: [{ id: 'fighter', level: 5 }], attacks, ...(preferences ? { preferences } : {}) })
const names = (c: ReturnType<typeof read>['character']) => orderAttacks(c, c.attacks).map((a) => a.name)

describe('defaults', () => {
  const { character: c, warnings } = read()
  it('a character without the group gets the defaults, and nothing is written to the file', () => {
    expect(warnings).toEqual([])
    expect(playPrefs(c)).toEqual({ attackOrder: 'file', phoneStart: 'all', editButtons: true })
    expect(c.preferences.play).toBeUndefined()
    expect(JSON.parse(characterToJson(c)).preferences.play).toBeUndefined()
  })
  it('attacks keep the order of the file: the Cyrillic name stays first', () => {
    expect(names(c)).toEqual(['Секачът на Борик', 'Throwing Axe', 'Chain hook', 'Battleaxe'])
  })
  it('a phone opens Play with every hand', () => {
    expect(phoneStartFilter(c)).toEqual([])
  })
})

describe('the choices', () => {
  it('attackOrder "name": A to Z, as it was before', () => {
    // where a Cyrillic name lands among Latin ones depends on the browser's language, so it is not checked here
    const latin = names(read({ play: { attackOrder: 'name' } }).character).filter((n) => /^[A-Z]/.test(n))
    expect(latin).toEqual(['Battleaxe', 'Chain hook', 'Throwing Axe'])
  })
  it('phoneStart: one hand as a filter', () => {
    expect(phoneStartFilter(read({ play: { phoneStart: 'action' } }).character)).toEqual(['zone:action'])
    expect(phoneStartFilter(read({ play: { phoneStart: 'reaction' } }).character)).toEqual(['zone:reaction'])
  })
  it('a choice is stored; the default again removes it, and the empty group with it', () => {
    const c = read().character
    const a = setPlayPref(c, 'attackOrder', 'name')
    expect(a.preferences.play).toEqual({ attackOrder: 'name' })
    const b = setPlayPref(a, 'editButtons', false)
    expect(b.preferences.play).toEqual({ attackOrder: 'name', editButtons: false })
    const back = setPlayPref(setPlayPref(b, 'attackOrder', DEFAULT_PLAY_PREFS.attackOrder), 'editButtons', true)
    expect(back.preferences.play).toBeUndefined()
    expect(back.preferences.gear).toEqual(c.preferences.gear)
  })
  it('setting what is already in force changes nothing', () => {
    const c = read().character
    expect(setPlayPref(c, 'phoneStart', 'all')).toBe(c)
  })
})

describe('preferences.play in a file', () => {
  it('round trip unchanged, no warning', () => {
    const r = read({ play: { attackOrder: 'name', phoneStart: 'bonus', editButtons: false } })
    expect(r.warnings).toEqual([])
    const again = normalizeCharacter(JSON.parse(characterToJson(r.character)))
    expect(again.warnings).toEqual([])
    expect(again.character.preferences.play).toEqual({ attackOrder: 'name', phoneStart: 'bonus', editButtons: false })
  })
  it('a word it does not know means the default, and it says so', () => {
    const r = read({ play: { attackOrder: 'random', phoneStart: 'everything' } })
    expect(playPrefs(r.character)).toEqual(DEFAULT_PLAY_PREFS)
    expect(r.warnings).toHaveLength(2)
    expect(r.warnings[0]).toMatch(/^preferences\.play\.attackOrder: "random" is not one of file, name/)
  })
  it('keeps a field it does not know', () => {
    const r = read({ play: { sectionOrder: ['mana', 'attacks'] } })
    expect(r.character.preferences.play).toEqual({ sectionOrder: ['mana', 'attacks'] })
    expect(r.warnings).toEqual(['preferences.play.sectionOrder: not a field this app uses; kept unchanged.'])
  })
})
