// What the player marks on a map (an image of the Images tab): pins, routes, tokens and the map's scale.
// Pure functions, no browser.
//
// Where it lives: on the image's own entry in `character.images` (CharacterImage.pins / routes / tokens /
// scale), each optional and absent when empty, so an image nobody marked is written exactly as before.
//
// Coordinates are RELATIVE to the picture (MapPoint: 0..1 from the left / top edge), never pixels: the
// same picture stored at 1600 px or at 3200 px keeps every mark on its spot.
//
// On screen the marks are drawn OVER the picture at a fixed size (the "size of the marks" preference):
// zooming moves them apart, it does not make them bigger or smaller. toScreen / toPoint below convert
// between a place on the picture and a place on the screen for the viewer's current zoom and position.
import { imagesOf, type Box, type View } from './images'
import type { Character, CharacterImage, MapPin, MapPoint, PinIcon } from './types'
import { PIN_ICONS } from './types'

export { PIN_ICONS }

/** The colours offered for a mark (any "#rrggbb" can be stored; the editor also has a free colour field). */
export const MARK_COLORS = ['#d0583f', '#f0a24a', '#e0b85c', '#71c283', '#3fbcc0', '#4f93db', '#a274e0', '#f1ece0', '#2a2433'] as const
/** What a mark without a colour gets. A default is never written to the file. */
export const DEFAULT_PIN_COLOR = '#d0583f'
export const DEFAULT_PIN_ICON: PinIcon = 'pin'

/** "#rrggbb", the only form of colour a mark stores. */
export const isMarkColor = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)

/** Dark or light ink, whichever reads on the colour (for the outline of a mark and what is drawn inside it). */
export function inkOn(color: string): string {
  if (!isMarkColor(color)) return '#ffffff'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#1b1622' : '#ffffff'
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5))
/** A point kept on the picture, with 5 decimals (finer than a pixel of any map). */
export const mapPoint = (p: MapPoint): MapPoint => ({ x: Math.round(clamp01(p.x) * 1e5) / 1e5, y: Math.round(clamp01(p.y) * 1e5) / 1e5 })

// ---------------- screen <-> picture ----------------

export interface Px {
  x: number
  y: number
}

/** Where a point of the picture is on the stage (pixels from its top left corner). */
export function toScreen(p: MapPoint, view: View, fit: Box, screen: Box): Px {
  return {
    x: screen.width / 2 + view.x + (p.x - 0.5) * fit.width * view.scale,
    y: screen.height / 2 + view.y + (p.y - 0.5) * fit.height * view.scale,
  }
}

/**
 * The point of the picture under a place on the stage. Outside the picture: null, or with `clamp` the
 * nearest point on its edge (a mark being dragged stops at the edge).
 */
export function toPoint(x: number, y: number, view: View, fit: Box, screen: Box, clamp = false): MapPoint | null {
  if (!fit.width || !fit.height) return null
  const px = (x - screen.width / 2 - view.x) / (fit.width * view.scale) + 0.5
  const py = (y - screen.height / 2 - view.y) / (fit.height * view.scale) + 0.5
  if (!clamp && (px < 0 || px > 1 || py < 0 || py > 1)) return null
  return mapPoint({ x: px, y: py })
}

/** The nearest of the targets whose circle (centre x, y; radius r) holds the place. Later targets win a tie: they are drawn on top. */
export function hitTest<T extends Px & { r: number }>(targets: readonly T[], x: number, y: number): T | null {
  let best: T | null = null
  let bestD = Infinity
  for (const tg of targets) {
    const d = Math.hypot(tg.x - x, tg.y - y)
    if (d <= tg.r && d <= bestD) {
      best = tg
      bestD = d
    }
  }
  return best
}

// ---------------- the marks on an image ----------------

type ListKey = 'pins'

/** Changes one image of the character; nothing changes when the image is not there or `fn` returns it as it is. */
export function updateImage(c: Character, imageId: string, fn: (im: CharacterImage) => CharacterImage): Character {
  const list = imagesOf(c)
  const at = list.findIndex((i) => i.id === imageId)
  if (at < 0) return c
  const next = fn(list[at])
  if (next === list[at]) return c
  return { ...c, images: list.map((im, i) => (i === at ? next : im)) }
}

/** A list of marks back on the image; an empty one is not written at all. */
function withList<K extends ListKey>(im: CharacterImage, key: K, list: NonNullable<CharacterImage[K]>): CharacterImage {
  if (list.length) return { ...im, [key]: list }
  if (!(key in im)) return im
  const { [key]: _dropped, ...rest } = im
  void _dropped
  return rest as CharacterImage
}

/** Removes the fields of `o` that hold a default or nothing, so a file carries only what was chosen. */
function tidy<T extends object>(o: T, defaults: Partial<Record<keyof T, unknown>>): T {
  const out = { ...o } as Record<string, unknown>
  for (const [k, v] of Object.entries(out)) {
    if (v === undefined || v === '' || (k in defaults && v === (defaults as Record<string, unknown>)[k])) delete out[k]
  }
  return out as T
}

// ----- pins -----

export const pinsOf = (im: CharacterImage): MapPin[] => im.pins ?? []
export const pinColor = (p: MapPin) => p.color ?? DEFAULT_PIN_COLOR
export const pinIcon = (p: MapPin) => p.icon ?? DEFAULT_PIN_ICON
const PIN_DEFAULTS = { color: DEFAULT_PIN_COLOR, icon: DEFAULT_PIN_ICON }

/** A new pin at a place. The name can be empty here: the caller gives "Pin 3" or what the player typed. */
export function addPin(c: Character, imageId: string, pin: { id: string; name: string } & MapPoint & Partial<MapPin>): Character {
  return updateImage(c, imageId, (im) => {
    if (pinsOf(im).some((p) => p.id === pin.id)) return im
    const { id, name, x, y, ...rest } = pin
    return withList(im, 'pins', [...pinsOf(im), tidy({ id, name: name.trim() || 'Pin', ...mapPoint({ x, y }), ...rest }, PIN_DEFAULTS)])
  })
}

/** Renames a pin, changes its note, colour or icon. An empty name is not taken; an empty note or a default is removed. */
export function patchPin(c: Character, imageId: string, pinId: string, patch: Partial<Pick<MapPin, 'name' | 'note' | 'color' | 'icon'>>): Character {
  return updateImage(c, imageId, (im) => {
    const old = pinsOf(im).find((p) => p.id === pinId)
    if (!old) return im
    const next = { ...old, ...patch }
    next.name = (patch.name ?? old.name).trim() || old.name
    if (next.note !== undefined) next.note = next.note.trim()
    if (next.color !== undefined && !isMarkColor(next.color)) next.color = old.color
    else if (next.color) next.color = next.color.toLowerCase()
    const clean = tidy(next, PIN_DEFAULTS)
    if (JSON.stringify(clean) === JSON.stringify(old)) return im
    return withList(im, 'pins', pinsOf(im).map((p) => (p.id === pinId ? clean : p)))
  })
}

export function movePin(c: Character, imageId: string, pinId: string, to: MapPoint): Character {
  const at = mapPoint(to)
  return updateImage(c, imageId, (im) => {
    const old = pinsOf(im).find((p) => p.id === pinId)
    if (!old || (old.x === at.x && old.y === at.y)) return im
    return withList(im, 'pins', pinsOf(im).map((p) => (p.id === pinId ? { ...p, ...at } : p)))
  })
}

export function removePin(c: Character, imageId: string, pinId: string): Character {
  return updateImage(c, imageId, (im) => (pinsOf(im).some((p) => p.id === pinId) ? withList(im, 'pins', pinsOf(im).filter((p) => p.id !== pinId)) : im))
}

/** "Pin 3": the first number no pin of the image has yet. */
export function nextName(word: string, taken: readonly string[]): string {
  for (let n = taken.length + 1; ; n++) if (!taken.includes(`${word} ${n}`)) return `${word} ${n}`
}

// ---------------- how big the marks are on screen ----------------

/** The side of a pin in screen pixels. Fixed: it does not change with the zoom. */
export const MARK_PX = { small: 22, medium: 30, large: 40, huge: 54 } as const

/** How many marks an image carries, for the grid of the Images tab. */
export const marksCount = (im: CharacterImage): number => pinsOf(im).length
