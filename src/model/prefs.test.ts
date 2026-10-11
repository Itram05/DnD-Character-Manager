// preferences.play (2026-10-11): the order of the attack cards and what a phone opens Play with.
// preferences.maps (2026-10-11): which marks the maps show, how big, with names or without.
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { DEFAULT_MAP_PREFS, DEFAULT_PLAY_PREFS, layerShown, mapPrefs, orderAttacks, phoneStartFilter, playPrefs, setLayerShown, setMapPref, setPlayPref, shownMarks } from './prefs'
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

describe('preferences.maps: what the maps show', () => {
  const c = read().character
  it('without the group: every layer shown, names on, medium marks; nothing in the file', () => {
    expect(mapPrefs(c)).toEqual({ size: 'medium', names: true, hide: [] })
    expect(c.preferences.maps).toBeUndefined()
    expect(JSON.parse(characterToJson(c)).preferences.maps).toBeUndefined()
  })
  it('a choice is stored; the default again removes it, and the empty group with it', () => {
    const big = setMapPref(c, 'size', 'huge')
    expect(big.preferences.maps).toEqual({ size: 'huge' })
    const quiet = setMapPref(big, 'names', false)
    expect(quiet.preferences.maps).toEqual({ size: 'huge', names: false })
    const back = setMapPref(setMapPref(quiet, 'size', DEFAULT_MAP_PREFS.size), 'names', true)
    expect(back.preferences.maps).toBeUndefined()
    expect(back.preferences.gear).toEqual(c.preferences.gear)
    expect(setMapPref(c, 'size', 'medium')).toBe(c)
  })
  it('layers: hidden ones are listed, in a fixed order; all shown again = no field', () => {
    let x = setLayerShown(c, 'tokens', false)
    x = setLayerShown(x, 'pins', false)
    expect(x.preferences.maps).toEqual({ hide: ['pins', 'tokens'] })
    expect([layerShown(x, 'pins'), layerShown(x, 'routes'), layerShown(x, 'tokens')]).toEqual([false, true, false])
    expect(setLayerShown(x, 'pins', false)).toBe(x)
    x = setLayerShown(setLayerShown(x, 'pins', true), 'tokens', true)
    expect(x.preferences.maps).toBeUndefined()
  })
  it('a hidden layer is not drawn, and nothing is taken off the image', () => {
    const image = { id: 'm', name: 'M', width: 10, height: 10, pins: [{ id: 'p', name: 'P', x: 0, y: 0 }], routes: [{ id: 'r', name: 'R', points: [{ x: 0, y: 0 }] }], tokens: [{ id: 't', name: 'T', x: 0, y: 0 }], scale: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distance: 5 } }
    const drawn = shownMarks(image, ['pins', 'tokens'])
    expect(Object.keys(drawn)).toEqual(['id', 'name', 'width', 'height', 'routes', 'scale'])
    expect(image.pins).toHaveLength(1)
    expect(shownMarks(image, [])).toBe(image)
  })
  it('in a file: round trip unchanged, no warning', () => {
    const r = read({ maps: { size: 'large', names: false, hide: ['routes'] } })
    expect(r.warnings).toEqual([])
    const again = normalizeCharacter(JSON.parse(characterToJson(r.character)))
    expect(again.warnings).toEqual([])
    expect(again.character.preferences.maps).toEqual({ size: 'large', names: false, hide: ['routes'] })
  })
  it('the defaults written out in a file are read and not written back', () => {
    const r = read({ maps: { size: 'medium', names: true, hide: [] } })
    expect(r.warnings).toEqual([])
    expect(r.character.preferences.maps).toBeUndefined()
  })
  it('a word it does not know means the default, and it says so; a field it does not know is kept', () => {
    const r = read({ maps: { size: 'gigantic', hide: ['pins', 'clouds'], grid: true } })
    expect(mapPrefs(r.character)).toMatchObject({ size: 'medium', names: true, hide: ['pins'] })
    expect(r.character.preferences.maps).toEqual({ hide: ['pins'], grid: true })
    expect(r.warnings).toEqual([
      'preferences.maps.size: "gigantic" is not one of small, medium, large, huge; using "medium".',
      'preferences.maps.hide: "clouds" not one of pins, routes, tokens; ignored.',
      'preferences.maps.grid: not a field this app uses; kept unchanged.',
    ])
  })
})
