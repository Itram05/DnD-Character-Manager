// The marks of a map on screen (server render, no browser): where they are drawn, what the panel of a
// mark shows when looking and when editing, the bar under the picture. Touch, drag and pinch need a real
// browser and are not covered here; the arithmetic they use is in model/mapMarks.test.ts.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FIT, addImages, type Box } from '../model/images'
import { addPin } from '../model/mapMarks'
import { normalizeCharacter } from '../model/normalize'
import type { Character, CharacterImage } from '../model/types'
import { ImagesView } from './ImagesView'
import { ImageViewer } from './ImageViewer'
import { MapMarks, markTargets } from './MapMarks'
import { MapBar, PinPanel } from './MapTools'
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
    expect(strip(html)).toBe('Move Pin ↶ Undo Done')
    expect(html).toMatch(/class="map-tool on[^"]*" aria-pressed="true" title="Pin"/)
  })
  it('Undo is off when there is nothing to take back', () => {
    expect(renderToString(<MapBar edit onEdit={noop} tool="select" onTool={noop} />)).toMatch(/disabled="" title="Undo"/)
  })
})

describe('the viewer and the tab', () => {
  it('opens looking: the bar offers "Edit map", and there is no tool, panel or hint', () => {
    const html = renderToString(<ImageViewer characterId={marked.id} images={marked.images!} index={0} onIndex={noop} onClose={noop} api={api(marked)} />)
    expect(strip(html)).toContain('Tap a mark to read it. Edit map')
    expect(html).not.toContain('map-bar editing')
    expect(html).not.toContain('map-panel')
  })
  it('without the sheet (nothing to change with) there is no bar', () => {
    expect(renderToString(<ImageViewer characterId={marked.id} images={marked.images!} index={0} onIndex={noop} onClose={noop} />)).not.toContain('map-bar')
  })
  it('a tile says how much is marked on its map; an unmarked one says nothing', () => {
    expect(strip(renderToString(<ImagesView api={api(marked)} />))).toContain('World 2 marked')
    expect(strip(renderToString(<ImagesView api={api(hero)} />))).not.toContain('marked')
  })
})
