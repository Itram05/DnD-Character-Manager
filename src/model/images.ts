// Images of a character (maps of the campaign, a family tree, a portrait): the list on the character,
// and the arithmetic of the full-screen viewer. Pure functions, no browser.
//
// Where the bytes live:
//   - the CHARACTER (localStorage, a few MB at most) holds only the list: id, name, size and a small
//     thumbnail. See CharacterImage.
//   - the PICTURE itself lives in the browser's IndexedDB (imageStore.ts), under character id + image id.
//   - the EXPORTED FILE carries both: each entry gets `data` (the picture as a data URL), so the images
//     travel with the file to another device. On import `data` is taken out again and stored.
import type { Character, CharacterImage } from './types'

/** The image types the app stores and shows. SVG is left out on purpose (it can carry scripts and links). */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/

/** The type and base64 text of an image data URL, or null when it is not one the app accepts. */
export function parseImageDataUrl(url: unknown): { type: string; base64: string } | null {
  if (typeof url !== 'string') return null
  const m = DATA_URL.exec(url)
  return m ? { type: m[1], base64: m[2] } : null
}

/** How many bytes a base64 text decodes to. */
export function base64Bytes(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - pad)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  // in pieces: String.fromCharCode(...wholeArray) overflows the call stack on a large image
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** "812 KB", "3.4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** A file name without its extension, as the name of a new image: "World map.png" -> "World map". */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || 'Image'
}

/**
 * The size an image is stored at: its long side at most `maxSide`, never enlarged, proportions kept.
 * maxSide 0 = keep the size.
 */
export function scaledSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const long = Math.max(width, height)
  if (!maxSide || long <= maxSide) return { width, height }
  const k = maxSide / long
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

// ---------------- the list on the character ----------------

export const imagesOf = (c: Character): CharacterImage[] => c.images ?? []

/** The list back on the character; an empty list is not written at all (a file without images stays as it was). */
function withImages(c: Character, images: CharacterImage[]): Character {
  if (images.length) return { ...c, images }
  if (!c.images) return c
  const { images: _dropped, ...rest } = c
  return rest as Character
}

export const addImages = (c: Character, added: CharacterImage[]): Character => (added.length ? withImages(c, [...imagesOf(c), ...added]) : c)

export function renameImage(c: Character, id: string, name: string): Character {
  const n = name.trim()
  if (!n || !imagesOf(c).some((i) => i.id === id && i.name !== n)) return c
  return withImages(
    c,
    imagesOf(c).map((i) => (i.id === id ? { ...i, name: n } : i)),
  )
}

/** Moves an image `by` places (-1 = one earlier, +1 = one later); stops at the ends. */
export function moveImage(c: Character, id: string, by: number): Character {
  const list = imagesOf(c)
  const from = list.findIndex((i) => i.id === id)
  if (from < 0) return c
  const to = Math.max(0, Math.min(list.length - 1, from + by))
  if (to === from) return c
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return withImages(c, next)
}

export const removeImage = (c: Character, id: string): Character =>
  imagesOf(c).some((i) => i.id === id)
    ? withImages(
        c,
        imagesOf(c).filter((i) => i.id !== id),
      )
    : c

/**
 * A file without an `images` field says nothing about images (a file exported without them, or one
 * written by hand): importing it over a character that has images keeps those. A file WITH the field,
 * even an empty list, is taken at its word.
 */
export function keepImages(incoming: Character, imagesInFile: boolean, existing: Character | undefined): Character {
  const kept = existing ? imagesOf(existing) : []
  return imagesInFile || !kept.length ? incoming : { ...incoming, images: kept }
}

/** Bytes of all the pictures together (what they add to an exported file is about a third more: base64). */
export const imagesBytes = (c: Character): number => imagesOf(c).reduce((s, i) => s + (i.bytes ?? 0), 0)

// ---------------- the viewer ----------------

/**
 * How the picture sits in the viewer. `scale` 1 = the whole picture fits the screen; x, y = how far its
 * centre is from the centre of the screen, in screen pixels.
 */
export interface View {
  scale: number
  x: number
  y: number
}

export const FIT: View = { scale: 1, x: 0, y: 0 }

export interface Box {
  width: number
  height: number
}

/** The picture's size on screen at scale 1: all of it visible, and a small picture is not blown up. */
export function fitSize(natural: Box, screen: Box): Box {
  if (!natural.width || !natural.height || !screen.width || !screen.height) return { width: 0, height: 0 }
  const k = Math.min(screen.width / natural.width, screen.height / natural.height, 1)
  return { width: natural.width * k, height: natural.height * k }
}

/** How far in one can go: 4 times the picture's own pixels, and never less than 4 times the fitted size. */
export function maxScale(natural: Box, fit: Box): number {
  return fit.width ? Math.max(4, (natural.width / fit.width) * 4) : 4
}

/** Keeps the scale in range and the picture on screen: it cannot be dragged past its own edge. */
export function clampView(v: View, fit: Box, screen: Box, max: number): View {
  const scale = Math.min(max, Math.max(1, v.scale))
  const limX = Math.max(0, (fit.width * scale - screen.width) / 2)
  const limY = Math.max(0, (fit.height * scale - screen.height) / 2)
  return { scale, x: Math.min(limX, Math.max(-limX, v.x)), y: Math.min(limY, Math.max(-limY, v.y)) }
}

/**
 * Zooms by `factor` keeping the point under the cursor (or between the fingers) where it is.
 * px, py: that point, measured from the centre of the screen.
 */
export function zoomAt(v: View, factor: number, px: number, py: number, fit: Box, screen: Box, max: number): View {
  const scale = Math.min(max, Math.max(1, v.scale * factor))
  const k = scale / v.scale
  return clampView({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, fit, screen, max)
}

/** The neighbour to show after `step` (-1 back, +1 forward), going round at the ends. */
export const stepIndex = (index: number, step: number, count: number): number => (count ? (((index + step) % count) + count) % count : 0)
