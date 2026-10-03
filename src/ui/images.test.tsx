// The Images tab on screen (server render, no browser): the tab itself, the grid of thumbnails with the
// names, the empty state, the viewer's controls. What needs a real browser (the picture loading from
// IndexedDB, wheel, pinch, drag) is not covered here.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addImages } from '../model/images'
import { normalizeCharacter } from '../model/normalize'
import type { Character, CharacterImage } from '../model/types'
import { ImagesView } from './ImagesView'
import { ImageViewer } from './ImageViewer'
import { Sheet, type SheetApi } from './Sheet'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const settings = { theme: 'dark', view: 'cards' } as const
const img = (id: string, name: string): CharacterImage => ({ id, name, width: 1616, height: 904, bytes: 500_000, thumb: PNG })
const hero = normalizeCharacter({ name: 'Grav', classes: [{ id: 'paladin', level: 5 }] }).character
const withMaps = addImages(hero, [img('a', 'Карта на света'), img('b', 'Северът'), img('c', 'Ембърхолд')])
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings, setSettings: () => {}, go: () => {} })

describe('Images tab', () => {
  it('is a tab of the sheet and renders the gallery', () => {
    const html = renderToString(<Sheet initial={withMaps} tab="images" onTab={() => {}} onBack={() => {}} settings={settings} setSettings={() => {}} onRules={() => {}} />)
    expect(html).toContain('class="sheet tab-images"')
    expect(strip(html)).toContain('Maps and images ( 3 )')
  })
  it('shows a tile for each image, in order: thumbnail, name, and its own edit button', () => {
    const html = renderToString(<ImagesView api={api(withMaps)} />)
    const tiles = html.split('</li>').slice(0, -1).map((x) => x.slice(x.indexOf('<li ')))
    expect(tiles).toHaveLength(3)
    expect(tiles.map((x) => strip(x).replace(' ✎', ''))).toEqual(['Карта на света', 'Северът', 'Ембърхолд'])
    expect(tiles.every((x) => x.includes(`src="${PNG}"`))).toBe(true)
    expect(html).toContain('aria-label="Rename, move or delete Северът"')
    expect(html).toContain('title="Open Ембърхолд"')
  })
  it('says what the pictures add to an exported file, and offers both exports', () => {
    const s = strip(renderToString(<ImagesView api={api(withMaps)} />))
    expect(s).toContain('about 2.0 MB more') // 3 x 500 000 bytes, a third more as base64
    expect(s).toContain('Export with images')
    expect(s).toContain('Export without images')
  })
  it('empty: an invitation to add, the size choice, no export buttons', () => {
    const s = strip(renderToString(<ImagesView api={api(hero)} />))
    expect(s).toContain('No images yet.')
    expect(s).toContain('+ Add images')
    expect(s).toContain('up to 2400 px')
    expect(s).not.toContain('Export with images')
  })
})

describe('Image viewer', () => {
  const view = (index: number, images = withMaps.images!) => renderToString(<ImageViewer characterId={hero.id} images={images} index={index} onIndex={() => {}} onClose={() => {}} />)

  it('names the picture, counts it, and has zoom, fit, close, previous and next', () => {
    const html = view(1)
    expect(html).toContain('role="dialog"')
    expect(strip(html)).toContain('Северът 2 / 3')
    for (const label of ['Zoom in', 'Zoom out', 'Fit the screen', 'Close', 'Previous image', 'Next image']) expect(html).toContain(`aria-label="${label}"`)
  })
  it('a single image has no counter and no arrows', () => {
    const html = view(0, [img('a', 'Solo')])
    expect(strip(html)).not.toContain('1 / 1')
    expect(html).not.toContain('Previous image')
  })
  it('renders nothing for an index that is not there', () => {
    expect(view(7)).toBe('')
  })
})
