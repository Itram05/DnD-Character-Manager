// The marks of a map on screen (server render, no browser): where they are drawn, what the panel of a
// mark shows when looking and when editing, the bar under the picture. Touch, drag and pinch need a real
// browser and are not covered here; the arithmetic they use is in model/mapMarks.test.ts.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FIT, addImages, type Box } from '../model/images'
import { addPin, addRoute, addRoutePoint, addToken, patchRoute, setScale } from '../model/mapMarks'
import { normalizeCharacter } from '../model/normalize'
import { DEFAULT_MAP_PREFS, setLayerShown, setMapPref, shownMarks } from '../model/prefs'
import type { Character, CharacterImage } from '../model/types'
import { ImagesView } from './ImagesView'
import { ImageViewer } from './ImageViewer'
import { MapMarks, markTargets, routeLineAt, routeText, rulerTargets } from './MapMarks'
import { LayersPanel, MapBar, PinPanel, RoutePanel, ScalePanel, TokenPanel, parseAmount } from './MapTools'
import { PrefsPanel } from './PrefsPanel'
import type { SheetApi } from './Sheet'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const settings = { theme: 'dark', view: 'cards' } as const
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings, setSettings: () => {}, go: () => {} })
const img: CharacterImage = { id: 'world', name: 'World', width: 1600, height: 900 }
const hero = addImages(normalizeCharacter({ name: 'Grav', classes: [{ id: 'paladin', level: 5 }] }).character, [img])
let marked = addPin(hero, 'world', { id: 'p1', name: 'Ембърхолд', x: 0.25, y: 0.5, note: 'Столицата. Тук е ковачът.', color: '#4f93db', icon: 'star' })
marked = addPin(marked, 'world', { id: 'p2', name: 'Camp', x: 0.75, y: 1 })
const world = marked.images![0]
const screen: Box = { width: 800, height: 600 }
const fit: Box = { width: 800, height: 450 }
const noop = () => {}

describe('the marks over the picture', () => {
  const layer = (over: Partial<Parameters<typeof MapMarks>[0]> = {}) => renderToString(<MapMarks image={world} view={FIT} fit={fit} screen={screen} size={30} names sel={null} {...over} />)

  it('each pin at its place on the screen, with its name', () => {
    const html = layer()
    expect(html).toContain('translate(200.0px, 300.0px)')
    expect(html).toContain('translate(600.0px, 525.0px)')
    expect(strip(html)).toBe('Ембърхолд Camp')
    expect(html).toContain('aria-label="Pin: Ембърхолд"')
    expect(html).toContain('icon-star')
    expect(html).toContain('fill="#4f93db"')
  })
  it('zooming moves a pin with the picture and leaves its size alone', () => {
    const html = layer({ view: { scale: 2, x: 0, y: 0 } })
    expect(html).toContain('translate(0.0px, 300.0px)')
    // the same 30 px glyph as at scale 1
    expect(html.match(/<svg class="pin-glyph" width="30" height="30"/g)).toHaveLength(2)
    expect(layer().match(/<svg class="pin-glyph" width="30" height="30"/g)).toHaveLength(2)
  })
  it('names off: only the selected pin says its name', () => {
    expect(strip(layer({ names: false }))).toBe('')
    expect(strip(layer({ names: false, sel: { kind: 'pin', id: 'p2' } }))).toBe('Camp')
  })
  it('a pin being dragged is drawn where the finger is', () => {
    expect(layer({ drag: { sel: { kind: 'pin', id: 'p1' }, at: { x: 0.5, y: 0.5 } } })).toContain('translate(400.0px, 300.0px)')
  })
  it('nothing before the size of the picture on screen is known', () => {
    expect(layer({ fit: { width: 0, height: 0 } })).toBe('')
  })
  it('is touched at what is drawn: a "pin" above its tip, a star on its centre; a finger does not have to be exact', () => {
    const [star, pin] = markTargets(world, FIT, fit, screen, 30)
    expect([star.x, star.y, star.px, star.py]).toEqual([200, 300, 200, 300])
    expect([pin.x, pin.y, pin.px, pin.py]).toEqual([600, 525 - 16.5, 600, 525])
    expect(star.r).toBe(20)
    expect(markTargets(world, FIT, fit, screen, 54)[0].r).toBeCloseTo(33.48)
  })
})

describe('tokens', () => {
  let c = addToken(hero, 'world', { id: 't1', name: 'Party', x: 0.5, y: 0.5 })
  c = addToken(c, 'world', { id: 't2', name: 'Грав Сращите', x: 0.25, y: 0, color: '#d0583f', note: 'ahead of the others' })
  const image = c.images![0]
  it('a disc with the letters at its place, the name under it; a little bigger than a pin, the same at every zoom', () => {
    const at = (view = FIT) => renderToString(<MapMarks image={image} view={view} fit={fit} screen={screen} size={30} names sel={null} />)
    const html = at()
    expect(html).toContain('translate(400.0px, 300.0px)')
    expect(html).toContain('translate(200.0px, 75.0px)')
    expect(strip(html)).toBe('Pa Party ГС Грав Сращите')
    expect(html).toContain('width:36px;height:36px;background:#e0b85c')
    expect(at({ scale: 3, x: 0, y: 0 })).toContain('width:36px;height:36px;background:#e0b85c')
    expect(html).toContain('aria-label="Token: Party"')
  })
  it('can be touched at its centre', () => {
    expect(markTargets(image, FIT, fit, screen, 30).map((x) => [x.sel.kind, x.sel.id, x.x, x.y])).toEqual([['token', 't1', 400, 300], ['token', 't2', 200, 75]])
  })
  it('the panel: looking shows the name and the note; editing has name, letters, note, colours, delete', () => {
    const look = renderToString(<TokenPanel token={image.tokens![1]} edit={false} onPatch={noop} onDelete={noop} onClose={noop} />)
    expect(strip(look)).toBe('ГС Грав Сращите ✕ ahead of the others')
    const edit = renderToString(<TokenPanel token={image.tokens![0]} edit onPatch={noop} onDelete={noop} onClose={noop} />)
    expect(strip(edit)).toContain('Token Delete token ✕ Name Letters Note')
    expect(edit).toContain('value="Party"')
    // no letters of its own: the field shows the initials it uses as what an empty field means
    expect(edit).toMatch(/placeholder="Pa" maxLength="3"|maxLength="3"[^>]*placeholder="Pa"|placeholder="Pa"[^>]*maxLength="3"/)
  })
})

describe('routes over the picture', () => {
  // 1600 x 900: a route 1200 px across and 900 px down = 1500 px; the ruler is 400 px = 100 mi
  let c = addRoute(hero, 'world', { id: 'r1', name: 'North road', points: [{ x: 0, y: 0 }] })
  c = addRoutePoint(c, 'world', 'r1', { x: 0.75, y: 1 })
  const noScale = c.images![0]
  c = setScale(c, 'world', { a: { x: 0.25, y: 0 }, b: { x: 0.5, y: 0 }, distance: 100, perDay: 25 })
  const measured = c.images![0]
  const layer = (image: CharacterImage, over: Partial<Parameters<typeof MapMarks>[0]> = {}) => renderToString(<MapMarks image={image} view={FIT} fit={fit} screen={screen} aspect={{ width: 1600, height: 900 }} size={30} names sel={null} {...over} />)

  it('a line through its points, in screen pixels, with its name half way', () => {
    const html = layer(noScale)
    expect(html).toContain('points="0.0,75.0 600.0,525.0"')
    expect(html).toContain('translate(300.0px, 300.0px)')
    expect(strip(html)).toBe('North road')
  })
  it('without a scale there are no numbers; with one, the length and the days', () => {
    expect(routeText(noScale.routes![0], noScale.scale, { width: 1600, height: 900 })).toBe('')
    expect(strip(layer(measured))).toBe('North road · 375 mi · 15 days')
  })
  it('the numbers do not depend on the zoom or the size on screen', () => {
    expect(strip(layer(measured, { view: { scale: 3, x: 40, y: -90 } }))).toBe('North road · 375 mi · 15 days')
    expect(strip(layer(measured, { fit: { width: 390, height: 219.375 }, screen: { width: 390, height: 700 } }))).toBe('North road · 375 mi · 15 days')
  })
  it('one day is "1 day"; a route with its own day of travel uses it', () => {
    const own = patchRoute(c, 'world', 'r1', { perDay: 375 }).images![0]
    expect(strip(layer(own))).toBe('North road · 375 mi · 1 day')
  })
  it('a point being dragged: the line and the length follow the finger', () => {
    const html = layer(measured, { drag: { sel: { kind: 'route', id: 'r1', point: 1 }, at: { x: 1, y: 0 } } })
    expect(html).toContain('points="0.0,75.0 800.0,75.0"')
    expect(strip(html)).toBe('North road · 400 mi · 16 days')
  })
  it('its points can be touched, and its line between them', () => {
    const targets = markTargets(noScale, FIT, fit, screen, 30)
    expect(targets.map((x) => [x.sel.kind, x.sel.point, x.x, x.y])).toEqual([['route', 0, 0, 75], ['route', 1, 600, 525]])
    expect(routeLineAt(noScale, FIT, fit, screen, 300, 305)).toMatchObject({ sel: { kind: 'route', id: 'r1' }, segment: 0, px: 300, py: 305 })
    expect(routeLineAt(noScale, FIT, fit, screen, 300, 100)).toBeNull()
  })
  it('the ruler of the scale tool is drawn only while that tool is in hand', () => {
    expect(layer(measured)).not.toContain('map-ruler')
    const html = layer(measured, { ruler: [measured.scale!.a, measured.scale!.b] })
    expect(html).toContain('class="map-ruler"')
    expect(html).toContain('points="200.0,75.0 400.0,75.0"')
    expect(rulerTargets([measured.scale!.a, measured.scale!.b], FIT, fit, screen).map((x) => [x.sel.kind, x.sel.point, x.x])).toEqual([['ruler', 0, 200], ['ruler', 1, 400]])
  })
})

describe('the panel of a route', () => {
  const route = { id: 'r1', name: 'North road', points: [{ x: 0, y: 0 }, { x: 0.75, y: 1 }] }
  const base = { route, numbers: '375 mi · 15 days', onPatch: noop, onDeletePoint: noop, onDelete: noop, onClose: noop }
  it('looking: the name, the length and the days', () => {
    const html = renderToString(<RoutePanel {...base} edit={false} />)
    expect(strip(html)).toBe('North road 375 mi · 15 days ✕')
    expect(html).not.toContain('Delete')
  })
  it('a map without a scale says why there are no numbers', () => {
    expect(strip(renderToString(<RoutePanel {...base} numbers="" edit={false} />))).toBe('North road No distances yet: this map has no scale. ✕')
  })
  it('editing with the Route tool: how to add points, Finish, delete; the fields are behind Details', () => {
    const html = renderToString(<RoutePanel {...base} edit adding point={1} />)
    const s = strip(html)
    expect(s).toContain('Finish')
    expect(s).toContain('each tap is the next point')
    expect(s).toContain('Details ▾ Delete this point Delete route')
    expect(html).not.toContain('<input')
  })
  it('"Delete this point" only when a point is selected', () => {
    expect(strip(renderToString(<RoutePanel {...base} edit />))).not.toContain('Delete this point')
  })
})

describe('the scale tool', () => {
  const base = { onSave: noop, onRemove: noop, onRestart: noop, onClose: noop }
  it('step by step: first one end, then the other, then the distance', () => {
    expect(strip(renderToString(<ScalePanel {...base} ruler={[]} />))).toContain('Tap one end of a distance you know')
    expect(strip(renderToString(<ScalePanel {...base} ruler={[{ x: 0, y: 0 }]} />))).toContain('Now tap the other end.')
    const html = renderToString(<ScalePanel {...base} ruler={[{ x: 0, y: 0 }, { x: 1, y: 0 }]} />)
    expect(strip(html)).toContain('How far is it from one white dot to the other?')
    // a new scale: no distance yet (Save is off), miles, the usual 24 a day
    expect(html.match(/<input[^>]*value="([^"]*)"/g)?.map((x) => /value="([^"]*)"/.exec(x)![1])).toEqual(['', 'mi', '24'])
    expect(html).toMatch(/<button type="button" class="map-btn map-btn-primary" disabled="">Save scale/)
    expect(html).not.toContain('Remove scale')
  })
  it('a map that has a scale: its own numbers, and a way to remove it', () => {
    const html = renderToString(<ScalePanel {...base} scale={{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distance: 300, unit: 'km' }} ruler={[{ x: 0, y: 0 }, { x: 1, y: 0 }]} />)
    expect(html.match(/<input[^>]*value="([^"]*)"/g)?.map((x) => /value="([^"]*)"/.exec(x)![1])).toEqual(['300', 'km', ''])
    expect(html).toContain('Remove scale')
    expect(html).not.toMatch(/disabled="">Save scale/)
  })
  it('an amount typed with a comma is a number; nothing, zero and words are not', () => {
    expect([parseAmount('24'), parseAmount(' 7,5 '), parseAmount('12.5')]).toEqual([24, 7.5, 12.5])
    expect([parseAmount(''), parseAmount('0'), parseAmount('-4'), parseAmount('far')]).toEqual([undefined, undefined, undefined, undefined])
  })
})

describe('the panel of a pin', () => {
  const pin = world.pins![0]
  it('looking: the name and the note, nothing to change', () => {
    const html = renderToString(<PinPanel pin={pin} edit={false} onPatch={noop} onDelete={noop} onClose={noop} />)
    expect(strip(html)).toBe('Ембърхолд ✕ Столицата. Тук е ковачът.')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Delete pin')
  })
  it('looking at a pin without a note says so', () => {
    expect(strip(renderToString(<PinPanel pin={world.pins![1]} edit={false} onPatch={noop} onDelete={noop} onClose={noop} />))).toBe('Camp ✕ No note.')
  })
  it('editing: name, note, the colours, the shapes, delete', () => {
    const html = renderToString(<PinPanel pin={pin} edit onPatch={noop} onDelete={noop} onClose={noop} />)
    expect(html).toContain('value="Ембърхолд"')
    expect(html).toContain('Столицата. Тук е ковачът.</textarea>')
    expect(html).toContain('Delete pin')
    expect(html.match(/class="map-swatch /g)).toHaveLength(10) // 9 colours and the free one
    expect(html).toContain('aria-label="#4f93db" aria-pressed="true"')
    for (const shape of ['Pin', 'Dot', 'Star', 'Flag', 'House', 'Camp', 'Cross', 'Danger', 'Question']) expect(html).toContain(`aria-label="${shape}"`)
    expect(html).toContain('aria-pressed="true" aria-label="Star"')
  })
  it('opens at the top when asked (the pin is in the lower half of a phone)', () => {
    expect(renderToString(<PinPanel pin={pin} edit at="top" onPatch={noop} onDelete={noop} onClose={noop} />)).toContain('map-panel at-top')
  })
})

describe('the bar under the picture', () => {
  it('looking: one button, "Edit map"; no tool is within reach', () => {
    const html = renderToString(<MapBar edit={false} onEdit={noop} tool="select" onTool={noop} hint="Tap a mark to read it." />)
    expect(strip(html)).toBe('Tap a mark to read it. Edit map')
    expect(html.match(/<button/g)).toHaveLength(1)
  })
  it('editing: the tools, Undo, Done', () => {
    const html = renderToString(<MapBar edit onEdit={noop} tool="pin" onTool={noop} onUndo={noop} />)
    expect(strip(html)).toBe('Move Pin Route Token Scale ↶ Undo Done')
    expect(html).toMatch(/class="map-tool on[^"]*" aria-pressed="true" title="Pin"/)
  })
  it('Undo is off when there is nothing to take back', () => {
    expect(renderToString(<MapBar edit onEdit={noop} tool="select" onTool={noop} />)).toMatch(/disabled="" title="Undo"/)
  })
})

describe('layers and the size of the marks', () => {
  let c = addRoute(marked, 'world', { id: 'r1', name: 'North road', points: [{ x: 0, y: 0 }, { x: 0.75, y: 1 }] })
  c = addToken(c, 'world', { id: 't1', name: 'Party', x: 0.5, y: 0.5 })
  const image = c.images![0]
  const layer = (im: CharacterImage, size = 30, names = true) => renderToString(<MapMarks image={im} view={FIT} fit={fit} screen={screen} size={size} names={names} sel={null} />)
  const kinds = (html: string) => ({ pins: (html.match(/class="map-mark map-pin/g) ?? []).length, routes: (html.match(/class="map-route /g) ?? []).length, tokens: (html.match(/class="map-mark map-token/g) ?? []).length })

  it('each layer is hidden on its own; what is hidden cannot be touched either', () => {
    expect(kinds(layer(image))).toEqual({ pins: 2, routes: 1, tokens: 1 })
    expect(kinds(layer(shownMarks(image, ['pins'])))).toEqual({ pins: 0, routes: 1, tokens: 1 })
    expect(kinds(layer(shownMarks(image, ['routes', 'tokens'])))).toEqual({ pins: 2, routes: 0, tokens: 0 })
    expect(kinds(layer(shownMarks(image, ['pins', 'routes', 'tokens'])))).toEqual({ pins: 0, routes: 0, tokens: 0 })
    expect(markTargets(shownMarks(image, ['pins', 'routes']), FIT, fit, screen, 30).map((x) => x.sel.kind)).toEqual(['token'])
  })
  it('the four sizes: pins 22, 30, 40 and 54 px, tokens a fifth more', () => {
    for (const [size, token] of [[22, 26], [30, 36], [40, 48], [54, 65]]) {
      const html = layer(image, size)
      expect(html).toContain(`<svg class="pin-glyph" width="${size}" height="${size}"`)
      expect(html).toContain(`width:${token}px;height:${token}px`)
    }
  })
  it('names off: only the letters on the tokens are left', () => {
    expect(strip(layer(image, 30, false))).toBe('Pa')
  })
  it('the viewer draws what the character chose', () => {
    const view = (x: Character) => renderToString(<ImageViewer characterId={x.id} images={x.images!} index={0} onIndex={noop} onClose={noop} api={api(x)} />)
    // (the server render does not know the size of the screen, so no mark is drawn; the bar tells)
    expect(strip(view(setLayerShown(setLayerShown(c, 'pins', false), 'tokens', false)))).toContain('−2 Layers Hidden: pins, tokens. Edit map')
    expect(strip(view(c))).toContain('Layers Tap a mark to read it. Edit map')
  })
  it('the Layers panel: three layers with their counts, names, the four sizes', () => {
    const html = renderToString(<LayersPanel prefs={{ ...DEFAULT_MAP_PREFS, hide: ['routes'], size: 'large' }} counts={{ pins: 2, routes: 1, tokens: 1 }} onLayer={noop} onNames={noop} onSize={noop} onClose={noop} />)
    expect(strip(html)).toContain('Pins (2 on this map) Routes (1 on this map) Tokens (1 on this map) Names next to the marks')
    expect(strip(html)).toContain('Small Medium Large Huge')
    expect(html.match(/type="checkbox" checked=""/g)).toHaveLength(3) // pins, tokens, names; routes is off
    expect(html).toMatch(/class="map-btn on" aria-pressed="true">Large/)
  })
  it('the same choices are on the Edit tab, under "How this sheet looks"', () => {
    const s = strip(renderToString(<PrefsPanel api={api(setMapPref(c, 'size', 'huge'))} />))
    expect(s).toContain('Marks on the maps (Images tab) Size of pins and tokens Small Medium Large Huge Names next to the marks Show pins Show routes Show tokens')
    expect(renderToString(<PrefsPanel api={api(setMapPref(c, 'size', 'huge'))} />)).toContain('<option value="huge" selected="">Huge</option>')
  })
})

describe('the viewer and the tab', () => {
  it('opens looking: the bar offers "Edit map", and there is no tool, panel or hint', () => {
    const html = renderToString(<ImageViewer characterId={marked.id} images={marked.images!} index={0} onIndex={noop} onClose={noop} api={api(marked)} />)
    expect(strip(html)).toContain('Layers Tap a mark to read it. Edit map')
    expect(html).not.toContain('map-bar editing')
    expect(html).not.toContain('map-panel')
  })
  it('without the sheet (nothing to change with) there is no bar', () => {
    expect(renderToString(<ImageViewer characterId={marked.id} images={marked.images!} index={0} onIndex={noop} onClose={noop} />)).not.toContain('map-bar')
  })
  it('a tile says how much is marked on its map; an unmarked one says nothing', () => {
    expect(strip(renderToString(<ImagesView api={api(marked)} />))).toContain('World 2 marked')
    expect(strip(renderToString(<ImagesView api={api(hero)} />))).not.toContain('marked')
    // and the export that leaves the images out says that the marks go with them
    expect(strip(renderToString(<ImagesView api={api(marked)} />))).toContain('leaves it out too.')
  })
})
