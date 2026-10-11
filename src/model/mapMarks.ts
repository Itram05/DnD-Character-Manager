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
import type { Character, CharacterImage, MapPin, MapPoint, MapRoute, MapScale, MapToken, PinIcon } from './types'
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

type ListKey = 'pins' | 'routes' | 'tokens'

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

// ----- tokens: where the party, a hero, an NPC or a horse is -----

export const DEFAULT_TOKEN_COLOR = '#e0b85c'
export const tokensOf = (im: CharacterImage): MapToken[] => im.tokens ?? []
export const tokenColor = (tk: MapToken) => tk.color ?? DEFAULT_TOKEN_COLOR
const TOKEN_DEFAULTS = { color: DEFAULT_TOKEN_COLOR }
/** A token's label is short: it has to fit on the token. */
export const TOKEN_LABEL_MAX = 3

/** The letters a token shows when it has no label of its own: "Grav Srashtite" -> "GS", "Party" -> "Pa". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = (w: string) => [...w][0] ?? ''
  if (words.length === 1) return [...words[0]].slice(0, 2).join('')
  return (first(words[0]) + first(words[1])).toUpperCase()
}
export const tokenLabel = (tk: MapToken) => tk.label ?? initials(tk.name)

/** The first colour of the palette no token of the image has yet (so a second token does not look like the first); the default when all are taken. */
export function freeTokenColor(im: CharacterImage): string {
  const taken = new Set(tokensOf(im).map(tokenColor))
  return [DEFAULT_TOKEN_COLOR, ...MARK_COLORS].find((col) => !taken.has(col)) ?? DEFAULT_TOKEN_COLOR
}

export function addToken(c: Character, imageId: string, token: { id: string; name: string } & MapPoint & Partial<MapToken>): Character {
  return updateImage(c, imageId, (im) => {
    if (tokensOf(im).some((x) => x.id === token.id)) return im
    const { id, name, x, y, ...rest } = token
    return withList(im, 'tokens', [...tokensOf(im), tidy({ id, name: name.trim() || 'Token', ...mapPoint({ x, y }), ...rest }, TOKEN_DEFAULTS)])
  })
}

/** Renames a token, changes its label (at most 3 letters; empty or the name's own initials = none), colour or note. */
export function patchToken(c: Character, imageId: string, tokenId: string, patch: Partial<Pick<MapToken, 'name' | 'label' | 'color' | 'note'>>): Character {
  return updateImage(c, imageId, (im) => {
    const old = tokensOf(im).find((x) => x.id === tokenId)
    if (!old) return im
    const next = { ...old, ...patch }
    next.name = (patch.name ?? old.name).trim() || old.name
    if (next.note !== undefined) next.note = next.note.trim()
    if (next.label !== undefined) {
      next.label = [...next.label.trim()].slice(0, TOKEN_LABEL_MAX).join('')
      if (next.label === initials(next.name)) next.label = undefined
    }
    if (next.color !== undefined && !isMarkColor(next.color)) next.color = old.color
    else if (next.color) next.color = next.color.toLowerCase()
    const clean = tidy(next, TOKEN_DEFAULTS)
    if (JSON.stringify(clean) === JSON.stringify(old)) return im
    return withList(im, 'tokens', tokensOf(im).map((x) => (x.id === tokenId ? clean : x)))
  })
}

export function moveToken(c: Character, imageId: string, tokenId: string, to: MapPoint): Character {
  const at = mapPoint(to)
  return updateImage(c, imageId, (im) => {
    const old = tokensOf(im).find((x) => x.id === tokenId)
    if (!old || (old.x === at.x && old.y === at.y)) return im
    return withList(im, 'tokens', tokensOf(im).map((x) => (x.id === tokenId ? { ...x, ...at } : x)))
  })
}

export function removeToken(c: Character, imageId: string, tokenId: string): Character {
  return updateImage(c, imageId, (im) => (tokensOf(im).some((x) => x.id === tokenId) ? withList(im, 'tokens', tokensOf(im).filter((x) => x.id !== tokenId)) : im))
}

/**
 * The name a new token gets: the first on a map is the party; the second is the hero, if no token has
 * that name yet; after that "Token 3"...
 */
export function nextTokenName(im: CharacterImage, words: { party: string; token: string }, heroName: string): string {
  const taken = tokensOf(im).map((x) => x.name)
  if (!taken.length) return words.party
  const hero = heroName.trim()
  if (hero && !taken.includes(hero)) return hero
  return nextName(words.token, taken)
}

// ----- routes -----

export const DEFAULT_ROUTE_COLOR = '#f0a24a'
export const routesOf = (im: CharacterImage): MapRoute[] => im.routes ?? []
export const routeColor = (r: MapRoute) => r.color ?? DEFAULT_ROUTE_COLOR
const ROUTE_DEFAULTS = { color: DEFAULT_ROUTE_COLOR }

const withRoute = (c: Character, imageId: string, routeId: string, fn: (r: MapRoute) => MapRoute | null): Character =>
  updateImage(c, imageId, (im) => {
    const old = routesOf(im).find((r) => r.id === routeId)
    if (!old) return im
    const next = fn(old)
    if (next === old) return im
    return withList(im, 'routes', next ? routesOf(im).map((r) => (r.id === routeId ? next : r)) : routesOf(im).filter((r) => r.id !== routeId))
  })

/** A new route that starts at a place (one point; the next taps add the rest). */
export function addRoute(c: Character, imageId: string, route: { id: string; name: string; points: MapPoint[] } & Partial<MapRoute>): Character {
  return updateImage(c, imageId, (im) => {
    if (!route.points.length || routesOf(im).some((r) => r.id === route.id)) return im
    const { id, name, points, ...rest } = route
    return withList(im, 'routes', [...routesOf(im), tidy({ id, name: name.trim() || 'Route', points: points.map(mapPoint), ...rest }, ROUTE_DEFAULTS)])
  })
}

/** Adds a point to a route: at the end, or with `at` before the point that has that number (0 = a new start). */
export function addRoutePoint(c: Character, imageId: string, routeId: string, point: MapPoint, at?: number): Character {
  return withRoute(c, imageId, routeId, (r) => {
    const points = [...r.points]
    points.splice(at === undefined ? points.length : Math.max(0, Math.min(points.length, at)), 0, mapPoint(point))
    return { ...r, points }
  })
}

export function moveRoutePoint(c: Character, imageId: string, routeId: string, index: number, to: MapPoint): Character {
  const p = mapPoint(to)
  return withRoute(c, imageId, routeId, (r) => (!r.points[index] || (r.points[index].x === p.x && r.points[index].y === p.y) ? r : { ...r, points: r.points.map((x, i) => (i === index ? p : x)) }))
}

/** Takes a point out of a route. A route's last point takes the route with it. */
export function removeRoutePoint(c: Character, imageId: string, routeId: string, index: number): Character {
  return withRoute(c, imageId, routeId, (r) => (!r.points[index] ? r : r.points.length === 1 ? null : { ...r, points: r.points.filter((_, i) => i !== index) }))
}

/** Renames a route, changes its colour or its own day's travel (0 or less = back to the map's). */
export function patchRoute(c: Character, imageId: string, routeId: string, patch: Partial<Pick<MapRoute, 'name' | 'color' | 'perDay'>>): Character {
  return withRoute(c, imageId, routeId, (old) => {
    const next = { ...old, ...patch }
    next.name = (patch.name ?? old.name).trim() || old.name
    if (next.color !== undefined && !isMarkColor(next.color)) next.color = old.color
    else if (next.color) next.color = next.color.toLowerCase()
    if (next.perDay !== undefined && !(Number.isFinite(next.perDay) && next.perDay > 0)) next.perDay = undefined
    const clean = tidy(next, ROUTE_DEFAULTS)
    return JSON.stringify(clean) === JSON.stringify(old) ? old : clean
  })
}

export const removeRoute = (c: Character, imageId: string, routeId: string): Character => withRoute(c, imageId, routeId, () => null)

// ----- the scale of the map, and what a route measures -----

export const DEFAULT_UNIT = 'mi'
export const scaleUnit = (s: MapScale) => s.unit ?? DEFAULT_UNIT

/**
 * Sets the scale of a map ("from a to b is 120 mi"), or with null removes it. Not taken when the two
 * points are the same place or the distance is not above 0: such a scale measures nothing.
 */
export function setScale(c: Character, imageId: string, scale: MapScale | null): Character {
  return updateImage(c, imageId, (im) => {
    if (!scale) {
      if (!im.scale) return im
      const { scale: _dropped, ...rest } = im
      void _dropped
      return rest as CharacterImage
    }
    const a = mapPoint(scale.a)
    const b = mapPoint(scale.b)
    if ((a.x === b.x && a.y === b.y) || !(Number.isFinite(scale.distance) && scale.distance > 0)) return im
    const next: MapScale = { a, b, distance: scale.distance }
    const unit = scale.unit?.trim()
    if (unit && unit !== DEFAULT_UNIT) next.unit = unit
    if (scale.perDay !== undefined && Number.isFinite(scale.perDay) && scale.perDay > 0) next.perDay = scale.perDay
    return JSON.stringify(next) === JSON.stringify(im.scale) ? im : { ...im, scale: next }
  })
}

/**
 * The length of a line through the points, in the pixels of `box`. Any box with the picture's proportions
 * gives the same answer once it is divided by the scale's own length in that box, so the stored size of
 * the picture does not matter.
 */
export function pathLength(points: readonly MapPoint[], box: Box): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) sum += Math.hypot((points[i].x - points[i - 1].x) * box.width, (points[i].y - points[i - 1].y) * box.height)
  return sum
}

/** How long a route is in the world, in the unit of the scale. Null without a scale (or a picture of unknown proportions). */
export function routeLength(points: readonly MapPoint[], scale: MapScale | undefined, box: Box): number | null {
  if (!scale || !box.width || !box.height) return null
  const ruler = pathLength([scale.a, scale.b], box)
  return ruler > 0 ? (pathLength(points, box) / ruler) * scale.distance : null
}

/** Days on the road: the length over a day's travel (the route's own, else the map's). Null when neither is set. */
export function routeDays(route: Pick<MapRoute, 'perDay'>, scale: MapScale | undefined, length: number | null): number | null {
  const perDay = route.perDay ?? scale?.perDay
  return length === null || !perDay || perDay <= 0 ? null : length / perDay
}

/** A length or a number of days as text: one decimal under 10, whole above ("7.5", "42", "1,240" is not used: no separators). */
export function formatAmount(n: number): string {
  if (n < 10) return String(Math.round(n * 10) / 10)
  return String(Math.round(n))
}

/** "86 mi" and "3.6 days" for a route, each null when it cannot be known. */
export function routeNumbers(route: MapRoute, scale: MapScale | undefined, box: Box, points: readonly MapPoint[] = route.points): { length: string | null; days: string | null } {
  const len = routeLength(points, scale, box)
  const days = routeDays(route, scale, len)
  return { length: len === null || !scale ? null : `${formatAmount(len)} ${scaleUnit(scale)}`, days: days === null ? null : formatAmount(days) }
}

/**
 * Which stretch of a line a touch is on: the number of the point the stretch starts at, or -1 when the
 * touch is further than `r` from every stretch. Points and touch in screen pixels.
 */
export function segmentHit(points: readonly Px[], x: number, y: number, r: number): number {
  let best = -1
  let bestD = r
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = len2 ? Math.min(1, Math.max(0, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / len2)) : 0
    const d = Math.hypot(x - (a.x + t * (b.x - a.x)), y - (a.y + t * (b.y - a.y)))
    if (d <= bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

/** The place half way along a line (by length): where a route's name is written. */
export function midway(points: readonly Px[]): Px | null {
  if (!points.length) return null
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  let left = total / 2
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (d >= left && d > 0) {
      const t = left / d
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t }
    }
    left -= d
  }
  return points[0]
}

/** "Pin 3": the first number no pin of the image has yet. */
export function nextName(word: string, taken: readonly string[]): string {
  for (let n = taken.length + 1; ; n++) if (!taken.includes(`${word} ${n}`)) return `${word} ${n}`
}

// ---------------- how big the marks are on screen ----------------

/** The side of a pin in screen pixels. Fixed: it does not change with the zoom. */
export const MARK_PX = { small: 22, medium: 30, large: 40, huge: 54 } as const
/** A token is a little bigger than a pin of the same setting: it carries letters. */
export const tokenPx = (pinPx: number) => Math.round(pinPx * 1.2)

/** How many marks an image carries, for the grid of the Images tab. */
export const marksCount = (im: CharacterImage): number => pinsOf(im).length + routesOf(im).length + tokensOf(im).length
