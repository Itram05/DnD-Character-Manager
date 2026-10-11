// Marks on a map: the arithmetic between the picture and the screen, the changes to the character, and
// what a file with marks (or without any) looks like after import and export. No browser.
import { describe, expect, it } from 'vitest'
import { FIT, addImages, imagesOf, keepImages, type Box, type View } from './images'
import { exportWithImages, exportWithoutImages, memoryImageStore } from './imageStore'
import { DEFAULT_PIN_COLOR, addPin, hitTest, inkOn, isMarkColor, mapPoint, marksCount, movePin, nextName, patchPin, pinColor, pinIcon, pinsOf, removePin, toPoint, toScreen } from './mapMarks'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { characterToJson } from './storage'
import type { Character, CharacterImage } from './types'

type Obj = Record<string, unknown>
const img = (id: string, extra: Obj = {}): CharacterImage => ({ id, name: id, width: 1600, height: 900, bytes: 1000, ...extra }) as CharacterImage
const hero = (images: CharacterImage[] = [img('world'), img('north')]): Character => addImages(normalizeCharacter({ id: 'grav', name: 'Grav', classes: [{ id: 'paladin', level: 5 }] }).character, images)
const world = (c: Character) => imagesOf(c).find((i) => i.id === 'world')!
const read = (image: Obj) => normalizeCharacter({ schemaVersion: 3, id: 'grav', name: 'Grav', classes: [{ id: 'paladin', level: 5 }], images: [{ id: 'world', name: 'World', width: 1600, height: 900, ...image }] })

describe('a place on the picture and a place on the screen', () => {
  // a 1600 x 900 picture on a 800 x 600 stage: it fits as 800 x 450, 75 px of dark above and below
  const screen: Box = { width: 800, height: 600 }
  const fit: Box = { width: 800, height: 450 }

  it('fitted: the corners and the middle', () => {
    expect(toScreen({ x: 0, y: 0 }, FIT, fit, screen)).toEqual({ x: 0, y: 75 })
    expect(toScreen({ x: 1, y: 1 }, FIT, fit, screen)).toEqual({ x: 800, y: 525 })
    expect(toScreen({ x: 0.5, y: 0.5 }, FIT, fit, screen)).toEqual({ x: 400, y: 300 })
  })
  it('zoomed and moved: the mark follows the picture', () => {
    const view: View = { scale: 2, x: 100, y: -50 }
    expect(toScreen({ x: 0.5, y: 0.5 }, view, fit, screen)).toEqual({ x: 500, y: 250 })
    expect(toScreen({ x: 0.75, y: 0.5 }, view, fit, screen)).toEqual({ x: 900, y: 250 })
  })
  it('and back: the same point, at any zoom', () => {
    for (const view of [FIT, { scale: 2, x: 100, y: -50 }, { scale: 7.3, x: -420, y: 333 }]) {
      for (const p of [{ x: 0.1, y: 0.9 }, { x: 0.5, y: 0.5 }, { x: 0.98765, y: 0.01234 }]) {
        const s = toScreen(p, view, fit, screen)
        expect(toPoint(s.x, s.y, view, fit, screen)).toEqual(p)
      }
    }
  })
  it('outside the picture: nothing; a dragged mark stops at the edge', () => {
    expect(toPoint(400, 20, FIT, fit, screen)).toBeNull() // the dark band above the picture
    expect(toPoint(400, 20, FIT, fit, screen, true)).toEqual({ x: 0.5, y: 0 })
    expect(toPoint(-50, 900, FIT, fit, screen, true)).toEqual({ x: 0, y: 1 })
    expect(toPoint(10, 10, FIT, { width: 0, height: 0 }, screen, true)).toBeNull()
  })
  it('a point is kept on the picture, with 5 decimals', () => {
    expect(mapPoint({ x: 0.123456789, y: 1.7 })).toEqual({ x: 0.12346, y: 1 })
    expect(mapPoint({ x: -3, y: NaN })).toEqual({ x: 0, y: 0.5 })
  })
})

describe('what a touch hits', () => {
  const targets = [
    { x: 100, y: 100, r: 20, id: 'a' },
    { x: 130, y: 100, r: 20, id: 'b' },
    { x: 400, y: 400, r: 20, id: 'c' },
  ]
  it('the nearest mark within reach', () => {
    expect(hitTest(targets, 105, 100)?.id).toBe('a')
    expect(hitTest(targets, 122, 100)?.id).toBe('b')
    expect(hitTest(targets, 415, 410)?.id).toBe('c')
  })
  it('nothing when no mark is near: the touch is for the map', () => {
    expect(hitTest(targets, 250, 250)).toBeNull()
    expect(hitTest([], 1, 1)).toBeNull()
  })
  it('of two at the same distance, the one drawn on top', () => {
    expect(hitTest(targets, 115, 100)?.id).toBe('b')
  })
})

describe('pins', () => {
  it('a new pin: on its image only, defaults not written', () => {
    const c = addPin(hero(), 'world', { id: 'p1', name: 'Emberhold', x: 0.25, y: 0.5 })
    expect(world(c).pins).toEqual([{ id: 'p1', name: 'Emberhold', x: 0.25, y: 0.5 }])
    expect(imagesOf(c)[1].pins).toBeUndefined()
    expect([pinColor(world(c).pins![0]), pinIcon(world(c).pins![0])]).toEqual([DEFAULT_PIN_COLOR, 'pin'])
    expect(marksCount(world(c))).toBe(1)
  })
  it('the place is kept on the picture and rounded', () => {
    const c = addPin(hero(), 'world', { id: 'p1', name: 'Far', x: 1.4, y: 0.3333333333 })
    expect(world(c).pins![0]).toMatchObject({ x: 1, y: 0.33333 })
  })
  it('an image that is not there, or an id already used: nothing changes', () => {
    const c = hero()
    expect(addPin(c, 'nowhere', { id: 'p1', name: 'X', x: 0, y: 0 })).toBe(c)
    const one = addPin(c, 'world', { id: 'p1', name: 'X', x: 0, y: 0 })
    expect(addPin(one, 'world', { id: 'p1', name: 'Y', x: 1, y: 1 })).toBe(one)
  })
  it('rename, note, colour, shape; a default or an empty note leaves the file again', () => {
    let c = addPin(hero(), 'world', { id: 'p1', name: 'Pin 1', x: 0.25, y: 0.5 })
    c = patchPin(c, 'world', 'p1', { name: '  Ембърхолд ', note: 'The smith is here.', color: '#4F93DB', icon: 'star' })
    expect(world(c).pins![0]).toEqual({ id: 'p1', name: 'Ембърхолд', x: 0.25, y: 0.5, note: 'The smith is here.', color: '#4f93db', icon: 'star' })
    c = patchPin(c, 'world', 'p1', { note: '  ', color: DEFAULT_PIN_COLOR, icon: 'pin' })
    expect(world(c).pins![0]).toEqual({ id: 'p1', name: 'Ембърхолд', x: 0.25, y: 0.5 })
  })
  it('an empty name or a colour that is not one is not taken; no change is no change', () => {
    const c = patchPin(addPin(hero(), 'world', { id: 'p1', name: 'Camp', x: 0.25, y: 0.5 }), 'world', 'p1', { color: '#71c283' })
    expect(patchPin(c, 'world', 'p1', { name: '   ' })).toBe(c)
    expect(patchPin(c, 'world', 'p1', { color: 'red' })).toBe(c)
    expect(patchPin(c, 'world', 'p1', { name: 'Camp' })).toBe(c)
    expect(patchPin(c, 'world', 'nope', { name: 'Z' })).toBe(c)
  })
  it('move: the new place; the same place is no change', () => {
    const c = addPin(hero(), 'world', { id: 'p1', name: 'Camp', x: 0.25, y: 0.5 })
    const moved = movePin(c, 'world', 'p1', { x: 0.6, y: 0.1 })
    expect(world(moved).pins![0]).toEqual({ id: 'p1', name: 'Camp', x: 0.6, y: 0.1 })
    expect(movePin(moved, 'world', 'p1', { x: 0.6, y: 0.1 })).toBe(moved)
  })
  it('delete: the last pin takes the field with it, so the image is as it was', () => {
    const c0 = hero()
    let c = addPin(c0, 'world', { id: 'p1', name: 'A', x: 0.1, y: 0.1 })
    c = addPin(c, 'world', { id: 'p2', name: 'B', x: 0.2, y: 0.2 })
    c = removePin(c, 'world', 'p1')
    expect(pinsOf(world(c)).map((p) => p.name)).toEqual(['B'])
    c = removePin(c, 'world', 'p2')
    expect('pins' in world(c)).toBe(false)
    expect(world(c)).toEqual(world(c0))
    expect(removePin(c, 'world', 'p2')).toBe(c)
  })
  it('the next free name', () => {
    expect(nextName('Pin', [])).toBe('Pin 1')
    expect(nextName('Pin', ['Pin 1', 'Emberhold'])).toBe('Pin 3')
    expect(nextName('Pin', ['Pin 2'])).toBe('Pin 3')
  })
  it('ink that reads on a colour', () => {
    expect(inkOn('#f1ece0')).toBe('#1b1622')
    expect(inkOn('#2a2433')).toBe('#ffffff')
    expect([isMarkColor('#D0583F'), isMarkColor('#fff'), isMarkColor('red'), isMarkColor(7)]).toEqual([true, false, false, false])
  })
})

describe('pins in a file', () => {
  const pins = [
    { id: 'p1', name: 'Ембърхолд', x: 0.39286, y: 0.42339, note: 'Столицата.', color: '#4f93db', icon: 'star' },
    { id: 'p2', name: 'Camp', x: 0, y: 1 },
  ]
  it('round trip: read without a word, written as it was', () => {
    const r = read({ pins })
    expect(r.warnings).toEqual([])
    expect(r.character.images![0].pins).toEqual(pins)
    const again = normalizeCharacter(JSON.parse(characterToJson(r.character)))
    expect(again.warnings).toEqual([])
    expect(again.character.images).toEqual(r.character.images)
    expect(r.character.schemaVersion).toBe(3)
  })
  it('an image without marks is read and written exactly as before', () => {
    const r = read({})
    expect(Object.keys(r.character.images![0])).toEqual(['id', 'name', 'width', 'height'])
    expect(read({ pins: [] }).character.images![0]).toEqual(r.character.images![0])
    expect(characterToJson(r.character)).not.toContain('pins')
  })
  it('what is wrong is put right, and said', () => {
    const r = read({ pins: [{ name: '', x: 1.5, y: 'abc', color: 'red', icon: 'castle' }, 'nonsense', { id: 'a', name: 'A', x: 0.1, y: 0.1 }, { id: 'a', name: 'B', x: 0.2, y: 0.2 }] })
    const [first, a, b] = r.character.images![0].pins!
    expect(first).toMatchObject({ name: 'Pin 1', x: 1, y: 0.5 })
    expect(first.id).toBeTruthy()
    expect('color' in first || 'icon' in first).toBe(false)
    expect(a.id).toBe('a')
    expect(b.id).not.toBe('a')
    expect(r.warnings).toEqual([
      'images[0].pins[0].x: 1.5 is out of range; using 1.',
      'images[0].pins[0].y: expected a number, got "abc"; using 0.5.',
      'images[0].pins[0].color: "red" is not a colour like "#d0583f"; using the default colour.',
      'images[0].pins[0].icon: "castle" is not one of pin, dot, star, flag, house, tent, cross, danger, question; using "pin".',
      'images[0].pins[1]: expected an object, ignored.',
      'images[0].pins[3]: the id "a" is used twice; this one got a new id.',
    ])
  })
  it('a pin without a place lands in the middle, and it says so', () => {
    const r = read({ pins: [{ id: 'p', name: 'Lost' }] })
    expect(r.character.images![0].pins![0]).toEqual({ id: 'p', name: 'Lost', x: 0.5, y: 0.5 })
    expect(r.warnings).toEqual(['images[0].pins[0]: no x or y; put in the middle of the picture.'])
  })
  it('keeps a field of a pin it does not know', () => {
    const r = read({ pins: [{ id: 'p', name: 'Inn', x: 0.1, y: 0.2, visited: true }] })
    expect(r.character.images![0].pins![0]).toEqual({ id: 'p', name: 'Inn', x: 0.1, y: 0.2, visited: true })
    expect(r.warnings).toEqual(['images[0].pins[0].visited: not a field this app uses; kept unchanged.'])
  })
  it('an exported file carries the marks with the picture, and they come back on import', async () => {
    const store = memoryImageStore()
    const c = addPin(hero([img('world')]), 'world', { id: 'p1', name: 'Emberhold', x: 0.25, y: 0.5, note: 'Home' })
    await store.put(c.id, 'world', { type: 'image/jpeg', data: new Uint8Array([1, 2, 3]).buffer })
    const { json } = await exportWithImages(c, store)
    const back = importCharacterJson(json)
    expect(back.warnings).toEqual([])
    expect(back.character.images![0].pins).toEqual([{ id: 'p1', name: 'Emberhold', x: 0.25, y: 0.5, note: 'Home' }])
    expect(Object.keys(back.imageData)).toEqual(['world'])
  })
  it('"Export without images" has no images, so no marks; importing it over the hero keeps both', () => {
    const c = addPin(hero([img('world')]), 'world', { id: 'p1', name: 'Emberhold', x: 0.25, y: 0.5 })
    const small = importCharacterJson(exportWithoutImages(c))
    expect(small.imagesInFile).toBe(false)
    expect(keepImages(small.character, small.imagesInFile, c).images![0].pins).toHaveLength(1)
  })
})
