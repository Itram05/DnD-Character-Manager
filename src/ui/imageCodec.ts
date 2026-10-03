// Browser only: turns a picture file the user picked into what the app stores. The picture is drawn on
// a canvas at the chosen size and saved as JPEG (every browser can write JPEG; Safari cannot write WebP).
// The original file is never changed.
import { IMAGE_TYPES, bytesToBase64, imagesOf, nameFromFile, scaledSize } from '../model/images'
import { fromDataUrl, type StoredImage } from '../model/imageStore'
import { newId } from '../model/normalize'
import type { Character, CharacterImage } from '../model/types'

/** Long side of a stored picture, in pixels; 0 = keep the file exactly as it is. */
export const MAX_SIDES = [1600, 2400, 3200, 0] as const
export type MaxSide = (typeof MAX_SIDES)[number]
export const DEFAULT_MAX_SIDE: MaxSide = 2400
const JPEG_QUALITY = 0.85
const THUMB_SIDE = 320
const THUMB_QUALITY = 0.7

type Drawable = ImageBitmap | HTMLImageElement

async function decode(blob: Blob): Promise<{ source: Drawable; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob)
      return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() }
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('not a picture this browser can read'))
    img.src = url
  })
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) }
}

function draw(source: Drawable, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('no canvas'))
  // JPEG has no transparency: without this a transparent PNG would get a black background
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the picture could not be saved'))), 'image/jpeg', quality))
}

export interface PreparedImage {
  entry: CharacterImage
  stored: StoredImage
}

/**
 * Reads one picture file: stored picture (long side at most `maxSide`) and the entry for the character,
 * with a thumbnail. The original bytes are kept instead of a JPEG when the picture needs no shrinking
 * and the original is the smaller of the two (a small PNG drawing with text stays sharp that way).
 */
export async function prepareImage(file: Blob, fileName: string, maxSide: MaxSide): Promise<PreparedImage> {
  const d = await decode(file)
  try {
    if (!d.width || !d.height) throw new Error('empty picture')
    const size = scaledSize(d.width, d.height, maxSide)
    const sameSize = size.width === d.width && size.height === d.height
    const keepable = (IMAGE_TYPES as readonly string[]).includes(file.type)
    let blob: Blob = file
    if (!(maxSide === 0 && keepable)) {
      const jpeg = await draw(d.source, size.width, size.height, JPEG_QUALITY)
      blob = sameSize && keepable && file.size <= jpeg.size ? file : jpeg
    }
    const t = scaledSize(d.width, d.height, THUMB_SIDE)
    const thumb = await draw(d.source, t.width, t.height, THUMB_QUALITY)
    const kept = blob === file
    return {
      entry: {
        id: newId(),
        name: nameFromFile(fileName),
        width: kept ? d.width : size.width,
        height: kept ? d.height : size.height,
        bytes: blob.size,
        thumb: `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await thumb.arrayBuffer()))}`,
      },
      stored: { type: blob.type || 'image/jpeg', data: await blob.arrayBuffer() },
    }
  } finally {
    d.done()
  }
}

/** A thumbnail and the size of a stored picture: for images that came in a file without them (written by hand). */
export async function describeStored(stored: StoredImage): Promise<{ width: number; height: number; thumb: string }> {
  const d = await decode(new Blob([stored.data], { type: stored.type }))
  try {
    const t = scaledSize(d.width, d.height, THUMB_SIDE)
    const thumb = await draw(d.source, t.width, t.height, THUMB_QUALITY)
    return { width: d.width, height: d.height, thumb: `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await thumb.arrayBuffer()))}` }
  } finally {
    d.done()
  }
}

/**
 * After an import: gives every image that came with a picture but without a thumbnail or a size
 * (a file written by hand) both, read from the picture. An image that cannot be read stays as it is.
 */
export async function fillPreviews(c: Character, imageData: Record<string, string>): Promise<Character> {
  const list = imagesOf(c)
  if (!list.some((im) => imageData[im.id] && !(im.thumb && im.width && im.height))) return c
  const images: CharacterImage[] = []
  for (const im of list) {
    const stored = imageData[im.id] && !(im.thumb && im.width && im.height) ? fromDataUrl(imageData[im.id]) : null
    if (!stored) {
      images.push(im)
      continue
    }
    try {
      const d = await describeStored(stored)
      images.push({ ...im, width: d.width, height: d.height, thumb: im.thumb ?? d.thumb })
    } catch {
      images.push(im)
    }
  }
  return { ...c, images }
}
