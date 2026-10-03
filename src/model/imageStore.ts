// Where the pictures themselves are kept: IndexedDB, the browser's storage for large data. localStorage
// (where the characters are) holds about 5 MB in all; a handful of maps is more than that.
// Like localStorage it belongs to this browser on this device: the pictures reach another device only
// inside an exported file (exportWithImages below), and come back out on import (storeImported).
//
// Everything goes through the ImageStore interface, so the tests run on memoryImageStore (no browser).
import { base64ToBytes, bytesToBase64, imagesOf, parseImageDataUrl } from './images'
import type { Character } from './types'

export interface StoredImage {
  /** MIME type, e.g. "image/jpeg". */
  type: string
  data: ArrayBuffer
}

export interface ImageStore {
  put(characterId: string, imageId: string, image: StoredImage): Promise<void>
  get(characterId: string, imageId: string): Promise<StoredImage | undefined>
  /** Ids of the images stored for a character. */
  ids(characterId: string): Promise<string[]>
  remove(characterId: string, imageIds: string[]): Promise<void>
}

/** An image store in memory: for tests, and the fallback when the browser has no IndexedDB (pictures then last until the page closes). */
export function memoryImageStore(): ImageStore {
  const map = new Map<string, StoredImage>()
  const key = (c: string, i: string) => `${c}/${i}`
  return {
    put: async (c, i, image) => void map.set(key(c, i), image),
    get: async (c, i) => map.get(key(c, i)),
    ids: async (c) => [...map.keys()].filter((k) => k.startsWith(`${c}/`)).map((k) => k.slice(c.length + 1)),
    remove: async (c, ids) => ids.forEach((i) => map.delete(key(c, i))),
  }
}

const DB_NAME = 'dnd-sheet'
const STORE = 'images'

/** The store in the browser's IndexedDB. Keys are "<character id>/<image id>". */
export function indexedDbImageStore(factory: IDBFactory): ImageStore {
  let opened: Promise<IDBDatabase> | undefined
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened'))
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
    }).catch((e) => {
      opened = undefined // try again next time (e.g. after the other tab is closed)
      throw e
    }))
  const run = async <T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const db = await open()
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = work(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB: the change was aborted (storage full?)'))
    })
  }
  const key = (c: string, i: string) => `${c}/${i}`
  return {
    put: async (c, i, image) => void (await run('readwrite', (s) => s.put(image, key(c, i)))),
    get: async (c, i) => (await run('readonly', (s) => s.get(key(c, i)) as IDBRequest<StoredImage | undefined>)) ?? undefined,
    ids: async (c) => {
      const keys = (await run('readonly', (s) => s.getAllKeys(IDBKeyRange.bound(`${c}/`, `${c}/￿`)))) ?? []
      return keys.map((k) => String(k).slice(c.length + 1))
    },
    remove: async (c, ids) => {
      if (ids.length)
        await run('readwrite', (s) => {
          for (const i of ids) s.delete(key(c, i))
        })
    },
  }
}

let shared: ImageStore | undefined
/** The app's image store: IndexedDB when the browser has it, memory otherwise. */
export function imageStore(): ImageStore {
  return (shared ??= typeof indexedDB !== 'undefined' ? indexedDbImageStore(indexedDB) : memoryImageStore())
}

export const toDataUrl = (image: StoredImage): string => `data:${image.type};base64,${bytesToBase64(new Uint8Array(image.data))}`

export function fromDataUrl(url: string): StoredImage | null {
  const d = parseImageDataUrl(url)
  return d ? { type: d.type, data: base64ToBytes(d.base64).buffer } : null
}

/**
 * The character as the text of an export file, each image with its picture inside (`data`).
 * `missing`: names of the images whose picture is not in this browser; they are exported as entries
 * without `data`.
 */
export async function exportWithImages(c: Character, store: ImageStore): Promise<{ json: string; missing: string[] }> {
  const list = imagesOf(c)
  if (!list.length) return { json: JSON.stringify(c, null, 2), missing: [] }
  const missing: string[] = []
  const images = []
  for (const im of list) {
    let stored: StoredImage | undefined
    try {
      stored = await store.get(c.id, im.id)
    } catch {
      stored = undefined
    }
    if (stored) images.push({ ...im, data: toDataUrl(stored) })
    else {
      missing.push(im.name)
      images.push(im)
    }
  }
  return { json: JSON.stringify({ ...c, images }, null, 2), missing }
}

/** The character as export text WITHOUT its images: a small file. Importing it over the same character keeps the browser's images. */
export function exportWithoutImages(c: Character): string {
  const { images: _images, ...rest } = c
  return JSON.stringify(rest, null, 2)
}

/**
 * Stores the pictures an imported file carried (NormalizeResult.imageData) under the character's id.
 * `copyFrom`: when the character is imported as a copy under a new id, the id it had; images that came
 * without a picture are copied from there, if this browser has them.
 */
export async function storeImported(c: Character, imageData: Record<string, string>, store: ImageStore, copyFrom?: string): Promise<void> {
  for (const im of imagesOf(c)) {
    const stored = imageData[im.id] ? fromDataUrl(imageData[im.id]) : null
    if (stored) await store.put(c.id, im.id, stored)
    else if (copyFrom && copyFrom !== c.id) {
      const old = await store.get(copyFrom, im.id)
      if (old) await store.put(c.id, im.id, old)
    }
  }
}

/** Deletes the stored pictures the character no longer lists (removed images, undone additions). */
export async function dropUnlisted(c: Character, store: ImageStore): Promise<string[]> {
  const listed = new Set(imagesOf(c).map((i) => i.id))
  const gone = (await store.ids(c.id)).filter((id) => !listed.has(id))
  await store.remove(c.id, gone)
  return gone
}

/** Deletes every stored picture of a character (when the character is deleted). */
export async function dropAll(characterId: string, store: ImageStore): Promise<void> {
  await store.remove(characterId, await store.ids(characterId))
}
