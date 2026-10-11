// Marks on a map: the arithmetic between the picture and the screen, the changes to the character, and
// what a file with marks (or without any) looks like after import and export. No browser.
import { describe, expect, it } from 'vitest'
import { FIT, addImages, imagesOf, keepImages, type Box, type View } from './images'
import { exportWithImages, exportWithoutImages, memoryImageStore } from './imageStore'
import {
  DEFAULT_PIN_COLOR,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_TOKEN_COLOR,
  addPin,
  addRoute,
  addRoutePoint,
  addToken,
  formatAmount,
  freeTokenColor,
  initials,
  hitTest,
  inkOn,
  isMarkColor,
  mapPoint,
  marksCount,
  midway,
  movePin,
  moveRoutePoint,
  moveToken,
  nextName,
  nextTokenName,
  patchPin,
  patchRoute,
  patchToken,
  pathLength,
  pinColor,
  pinIcon,
  pinsOf,
  removePin,
  removeRoute,
  removeRoutePoint,
  removeToken,
  routeColor,
  routeDays,
  routeLength,
  routeNumbers,
  routesOf,
  segmentHit,
  setScale,
  toPoint,
  toScreen,
  tokenColor,
  tokenLabel,
  tokensOf,
} from './mapMarks'
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

describe('tokens', () => {
  const words = { party: 'Party', token: 'Token' }
  it('the first token of a map is the party, the second the hero, then "Token 3"', () => {
    let c = hero()
    expect(nextTokenName(world(c), words, 'Grav')).toBe('Party')
    c = addToken(c, 'world', { id: 't1', name: 'Party', x: 0.5, y: 0.5 })
    expect(nextTokenName(world(c), words, 'Grav')).toBe('Grav')
    c = addToken(c, 'world', { id: 't2', name: 'Grav', x: 0.4, y: 0.5 })
    expect(nextTokenName(world(c), words, 'Grav')).toBe('Token 3')
    // another map starts again with the party
    expect(nextTokenName(imagesOf(c)[1], words, 'Grav')).toBe('Party')
  })
  it('a token: on its image, the default colour not written, letters from the name', () => {
    const c = addToken(hero(), 'world', { id: 't1', name: 'Party', x: 0.5, y: 0.25, color: DEFAULT_TOKEN_COLOR })
    expect(world(c).tokens).toEqual([{ id: 't1', name: 'Party', x: 0.5, y: 0.25 }])
    expect([tokenColor(world(c).tokens![0]), tokenLabel(world(c).tokens![0])]).toEqual([DEFAULT_TOKEN_COLOR, 'Pa'])
    expect(marksCount(world(c))).toBe(1)
  })
  it('initials: two words give two capitals, one word its first two letters; Cyrillic too', () => {
    expect([initials('Grav Srashtite'), initials('Party'), initials('Грав Сращите'), initials('борик'), initials('Token 3'), initials('  '), initials('X')]).toEqual(['GS', 'Pa', 'ГС', 'бо', 'T3', '?', 'X'])
  })
  it('each new token gets a colour no other token of the map has', () => {
    let c = hero()
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      const color = freeTokenColor(world(c))
      seen.push(color)
      c = addToken(c, 'world', { id: `t${i}`, name: `T${i}`, x: 0.1 * i, y: 0.1, color })
    }
    expect(seen[0]).toBe(DEFAULT_TOKEN_COLOR)
    expect(new Set(seen).size).toBe(4)
  })
  it('rename, letters (3 at most), note, colour; what is a default again leaves the file', () => {
    let c = addToken(hero(), 'world', { id: 't1', name: 'Party', x: 0.5, y: 0.5 })
    c = patchToken(c, 'world', 't1', { name: 'Borik', label: 'BRKX', note: ' on the horse ', color: '#4F93DB' })
    expect(world(c).tokens![0]).toEqual({ id: 't1', name: 'Borik', x: 0.5, y: 0.5, label: 'BRK', note: 'on the horse', color: '#4f93db' })
    // the name's own initials as a label are no label; an empty note is no note
    c = patchToken(c, 'world', 't1', { label: 'Bo', note: '', color: DEFAULT_TOKEN_COLOR })
    expect(world(c).tokens![0]).toEqual({ id: 't1', name: 'Borik', x: 0.5, y: 0.5 })
    expect(patchToken(c, 'world', 't1', { name: ' ' })).toBe(c)
  })
  it('move and delete; the last token takes the field with it', () => {
    let c = addToken(hero(), 'world', { id: 't1', name: 'Party', x: 0.5, y: 0.5 })
    c = moveToken(c, 'world', 't1', { x: 0.25, y: 2 })
    expect(tokensOf(world(c))[0]).toMatchObject({ x: 0.25, y: 1 })
    expect(moveToken(c, 'world', 't1', { x: 0.25, y: 1 })).toBe(c)
    c = removeToken(c, 'world', 't1')
    expect('tokens' in world(c)).toBe(false)
    expect(removeToken(c, 'world', 't1')).toBe(c)
  })
  it('in a file: round trip unchanged; a long label is cut and it says so; unknown fields stay', () => {
    const tokens = [
      { id: 't1', name: 'Party', x: 0.42, y: 0.4 },
      { id: 't2', name: 'Грав Сращите', x: 0.5, y: 0.37, label: 'Г', color: '#d0583f', note: 'ahead of the others' },
    ]
    const r = read({ tokens })
    expect(r.warnings).toEqual([])
    expect(r.character.images![0].tokens).toEqual(tokens)
    expect(normalizeCharacter(JSON.parse(characterToJson(r.character))).character.images).toEqual(r.character.images)
    const bad = read({ tokens: [{ name: '', x: 0.1, y: 0.1, label: 'HORSE', mount: true }] })
    expect(bad.character.images![0].tokens![0]).toMatchObject({ name: 'Token 1', label: 'HOR', mount: true })
    expect(bad.warnings).toEqual(['images[0].tokens[0].label: "HORSE" is too long for a token; cut to "HOR".', 'images[0].tokens[0].mount: not a field this app uses; kept unchanged.'])
  })
})

describe('routes', () => {
  const start = () => addRoute(hero(), 'world', { id: 'r1', name: 'Route 1', points: [{ x: 0.1, y: 0.1 }] })
  const pts = (c: Character) => routesOf(world(c))[0].points.map((p) => [p.x, p.y])

  it('a new route starts with one point; the default colour is not written', () => {
    const c = start()
    expect(world(c).routes).toEqual([{ id: 'r1', name: 'Route 1', points: [{ x: 0.1, y: 0.1 }] }])
    expect(routeColor(world(c).routes![0])).toBe(DEFAULT_ROUTE_COLOR)
    expect(marksCount(world(c))).toBe(1)
    expect(addRoute(hero(), 'world', { id: 'r1', name: 'Empty', points: [] })).toEqual(hero())
  })
  it('points are added at the end, or in between', () => {
    let c = addRoutePoint(start(), 'world', 'r1', { x: 0.5, y: 0.5 })
    c = addRoutePoint(c, 'world', 'r1', { x: 0.9, y: 0.9 })
    expect(pts(c)).toEqual([[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]])
    c = addRoutePoint(c, 'world', 'r1', { x: 0.3, y: 0.2 }, 1)
    expect(pts(c)).toEqual([[0.1, 0.1], [0.3, 0.2], [0.5, 0.5], [0.9, 0.9]])
    c = addRoutePoint(c, 'world', 'r1', { x: 0, y: 0 }, 0)
    expect(pts(c)[0]).toEqual([0, 0])
  })
  it('a point is moved; the same place is no change', () => {
    const c = addRoutePoint(start(), 'world', 'r1', { x: 0.5, y: 0.5 })
    const moved = moveRoutePoint(c, 'world', 'r1', 1, { x: 0.7, y: 1.2 })
    expect(pts(moved)).toEqual([[0.1, 0.1], [0.7, 1]])
    expect(moveRoutePoint(moved, 'world', 'r1', 1, { x: 0.7, y: 1 })).toBe(moved)
    expect(moveRoutePoint(moved, 'world', 'r1', 9, { x: 0, y: 0 })).toBe(moved)
  })
  it('a point is taken out; the last point takes the route, and the last route the field', () => {
    let c = addRoutePoint(addRoutePoint(start(), 'world', 'r1', { x: 0.5, y: 0.5 }), 'world', 'r1', { x: 0.9, y: 0.9 })
    c = removeRoutePoint(c, 'world', 'r1', 1)
    expect(pts(c)).toEqual([[0.1, 0.1], [0.9, 0.9]])
    c = removeRoutePoint(removeRoutePoint(c, 'world', 'r1', 0), 'world', 'r1', 0)
    expect('routes' in world(c)).toBe(false)
  })
  it('several routes on one map, each with its name and colour', () => {
    let c = addRoute(start(), 'world', { id: 'r2', name: 'By sea', points: [{ x: 0.2, y: 0.8 }] })
    c = patchRoute(c, 'world', 'r2', { color: '#3FBCC0', perDay: 48 })
    c = patchRoute(c, 'world', 'r1', { name: ' The north road ' })
    expect(routesOf(world(c)).map((r) => [r.name, routeColor(r), r.perDay])).toEqual([
      ['The north road', DEFAULT_ROUTE_COLOR, undefined],
      ['By sea', '#3fbcc0', 48],
    ])
    c = patchRoute(c, 'world', 'r2', { color: DEFAULT_ROUTE_COLOR, perDay: 0 })
    expect(routesOf(world(c))[1]).toEqual({ id: 'r2', name: 'By sea', points: [{ x: 0.2, y: 0.8 }] })
    expect(patchRoute(c, 'world', 'r2', { name: '' })).toBe(c)
    expect(routesOf(world(removeRoute(c, 'world', 'r1'))).map((r) => r.id)).toEqual(['r2'])
  })
})

describe('the scale of a map and what a route measures', () => {
  // a 1600 x 900 picture; the ruler lies along its top edge, a quarter of the width = 400 px = 100 mi
  const box: Box = { width: 1600, height: 900 }
  const scale = { a: { x: 0.25, y: 0 }, b: { x: 0.5, y: 0 }, distance: 100 }

  it('no scale: no numbers at all', () => {
    const route = { id: 'r', name: 'R', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }
    expect(routeLength(route.points, undefined, box)).toBeNull()
    expect(routeNumbers(route, undefined, box)).toEqual({ length: null, days: null })
  })
  it('the length follows the picture, not the screen: across is 1600 px, down is 900 px', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 1, y: 0 }], box)).toBe(1600)
    expect(pathLength([{ x: 0, y: 0 }, { x: 0, y: 1 }], box)).toBe(900)
    expect(routeLength([{ x: 0, y: 0 }, { x: 1, y: 0 }], scale, box)).toBe(400)
    expect(routeLength([{ x: 0, y: 0 }, { x: 0, y: 1 }], scale, box)).toBe(225)
    // 3-4-5: 1200 px across and 900 px down is 1500 px
    expect(routeLength([{ x: 0, y: 0 }, { x: 0.75, y: 1 }], scale, box)).toBe(375)
    // several stretches add up
    expect(routeLength([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], scale, box)).toBe(625)
  })
  it('the same answer whatever size the picture is stored or shown at', () => {
    const pts = [{ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.9 }, { x: 0.8, y: 0.3 }]
    const full = routeLength(pts, scale, box)!
    expect(routeLength(pts, scale, { width: 3200, height: 1800 })).toBeCloseTo(full)
    expect(routeLength(pts, scale, { width: 390, height: 219.375 })).toBeCloseTo(full)
  })
  it('days: the route\'s own day of travel, else the map\'s, else none', () => {
    expect(routeDays({}, scale, 120)).toBeNull()
    expect(routeDays({}, { ...scale, perDay: 24 }, 120)).toBe(5)
    expect(routeDays({ perDay: 48 }, { ...scale, perDay: 24 }, 120)).toBe(2.5)
    expect(routeDays({ perDay: 48 }, undefined, null)).toBeNull()
  })
  it('as text: one decimal under 10, whole above; the unit of the scale', () => {
    expect([formatAmount(2.54), formatAmount(9.96), formatAmount(63.4), formatAmount(1240.5), formatAmount(0.04)]).toEqual(['2.5', '10', '63', '1241', '0'])
    const route = { id: 'r', name: 'R', points: [{ x: 0, y: 0 }, { x: 0.75, y: 1 }] }
    expect(routeNumbers(route, { ...scale, perDay: 24 }, box)).toEqual({ length: '375 mi', days: '16' })
    expect(routeNumbers(route, { ...scale, unit: 'km' }, box)).toEqual({ length: '375 km', days: null })
    expect(routeNumbers({ ...route, perDay: 100 }, scale, box)).toEqual({ length: '375 mi', days: '3.8' })
  })
  it('setting the scale: stored on the image; "mi" and an empty day of travel are not written', () => {
    const c = setScale(hero(), 'world', { ...scale, unit: 'mi', perDay: 0 })
    expect(world(c).scale).toEqual(scale)
    expect(world(setScale(c, 'world', { ...scale, unit: ' km ', perDay: 30 })).scale).toEqual({ ...scale, unit: 'km', perDay: 30 })
    expect(setScale(c, 'world', scale)).toBe(c)
    expect('scale' in world(setScale(c, 'world', null))).toBe(false)
    expect(setScale(hero(), 'world', null)).toEqual(hero())
  })
  it('a scale that measures nothing is not taken', () => {
    const c = hero()
    expect(setScale(c, 'world', { a: scale.a, b: scale.a, distance: 10 })).toBe(c)
    expect(setScale(c, 'world', { ...scale, distance: 0 })).toBe(c)
    expect(setScale(c, 'world', { ...scale, distance: NaN })).toBe(c)
  })
})

describe('a touch on the line of a route', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
  it('which stretch it is on', () => {
    expect(segmentHit(line, 50, 5, 14)).toBe(0)
    expect(segmentHit(line, 104, 60, 14)).toBe(1)
    expect(segmentHit(line, 50, 50, 14)).toBe(-1)
    expect(segmentHit([{ x: 5, y: 5 }], 5, 5, 14)).toBe(-1)
  })
  it('half way along: where the name is written', () => {
    expect(midway(line)).toEqual({ x: 100, y: 0 })
    expect(midway([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ x: 50, y: 0 })
    expect(midway([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9 })
    expect(midway([])).toBeNull()
  })
})

describe('routes and the scale in a file', () => {
  const routes = [
    { id: 'r1', name: 'Пътят до Хелрик Пиик', points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.35 }, { x: 0.8, y: 0.3 }], color: '#a274e0', perDay: 48 },
    { id: 'r2', name: 'Route 2', points: [{ x: 0.5, y: 0.5 }] },
  ]
  const scale = { a: { x: 0.24359, y: 0.77502 }, b: { x: 0.75641, y: 0.86669 }, distance: 48, unit: 'km', perDay: 24 }
  it('round trip: read without a word, written as it was', () => {
    const r = read({ routes, scale })
    expect(r.warnings).toEqual([])
    expect(r.character.images![0].routes).toEqual(routes)
    expect(r.character.images![0].scale).toEqual(scale)
    const again = normalizeCharacter(JSON.parse(characterToJson(r.character)))
    expect(again.warnings).toEqual([])
    expect(again.character.images).toEqual(r.character.images)
  })
  it('what is wrong is dropped or put right, and said', () => {
    const r = read({
      routes: [{ id: 'a', name: '', points: [{ x: 2, y: 0.5 }, 'x', { x: 0.2, y: 0.3 }], color: 'blue', perDay: -3 }, { id: 'b', name: 'Nothing', points: [] }],
      scale: { a: { x: 0.1, y: 0.1 }, b: { x: 0.1, y: 0.1 }, distance: 10 },
    })
    expect(r.character.images![0].routes).toEqual([{ id: 'a', name: 'Route 1', points: [{ x: 1, y: 0.5 }, { x: 0.2, y: 0.3 }] }])
    expect(r.character.images![0].scale).toBeUndefined()
    expect(r.warnings).toEqual([
      'images[0].routes[0].color: "blue" is not a colour like "#d0583f"; using the default colour.',
      'images[0].routes[0].points[0].x: 2 is out of range; using 1.',
      'images[0].routes[0].points[1]: expected a point { x, y }, ignored.',
      "images[0].routes[0].perDay: a day's travel must be above 0, ignored.",
      'images[0].routes[1]: a route without points, dropped.',
      'images[0].scale: a scale needs two different points (a, b) and a distance above 0; dropped, routes show no numbers.',
    ])
  })
  it('"mi" is the default unit: read, not written back', () => {
    const r = read({ scale: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distance: 300, unit: 'mi' } })
    expect(r.warnings).toEqual([])
    expect(r.character.images![0].scale).toEqual({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distance: 300 })
  })
  it('keeps fields it does not know, on a route and on the scale', () => {
    const r = read({ routes: [{ id: 'a', name: 'A', points: [{ x: 0, y: 0 }], dashed: true }], scale: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distance: 300, terrain: 'road' } })
    expect(r.character.images![0].routes![0]).toMatchObject({ dashed: true })
    expect(r.character.images![0].scale).toMatchObject({ terrain: 'road' })
    expect(r.warnings).toEqual(['images[0].routes[0].dashed: not a field this app uses; kept unchanged.', 'images[0].scale.terrain: not a field this app uses; kept unchanged.'])
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
