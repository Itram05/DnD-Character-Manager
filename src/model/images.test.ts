// Images (maps): the list on the character, the import and export of the pictures, the viewer's
// arithmetic. No browser: the image store here is the one in memory.
import { describe, expect, it } from 'vitest'
import sample from '../../examples/sample-character.json?raw'
import {
  FIT,
  addImages,
  base64Bytes,
  base64ToBytes,
  bytesToBase64,
  clampView,
  fitSize,
  formatBytes,
  imagesBytes,
  imagesOf,
  keepImages,
  maxScale,
  moveImage,
  nameFromFile,
  parseImageDataUrl,
  removeImage,
  renameImage,
  scaledSize,
  stepIndex,
  zoomAt,
} from './images'
import { dropAll, dropUnlisted, exportWithImages, exportWithoutImages, fromDataUrl, memoryImageStore, storeImported, toDataUrl } from './imageStore'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { CURRENT_SCHEMA_VERSION, type Character, type CharacterImage } from './types'

// a 1x1 PNG and a few bytes that stand for a JPEG (the importer checks the form, not the pixels)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const jpeg = (...bytes: number[]) => `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(bytes))}`
const img = (id: string, name = id): CharacterImage => ({ id, name, width: 1600, height: 900, bytes: 1000, thumb: PNG })
const hero = (images?: CharacterImage[]): Character => normalizeCharacter({ id: 'grav', name: 'Grav', classes: [{ id: 'paladin', level: 5 }], ...(images ? { images } : {}) }).character
const names = (c: Character) => imagesOf(c).map((i) => i.name)

describe('image data URLs and sizes', () => {
  it('accepts JPEG, PNG, WebP and GIF data URLs; nothing else', () => {
    expect(parseImageDataUrl(PNG)?.type).toBe('image/png')
    expect(parseImageDataUrl(jpeg(1, 2, 3))).toEqual({ type: 'image/jpeg', base64: 'AQID' })
    expect(parseImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull()
    expect(parseImageDataUrl('data:text/html;base64,PGI+')).toBeNull()
    expect(parseImageDataUrl('https://example.com/map.png')).toBeNull()
    expect(parseImageDataUrl('data:image/png;base64,not base64!')).toBeNull()
    expect(parseImageDataUrl(42)).toBeNull()
  })
  it('base64 goes there and back, also for a picture larger than one call can spread', () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 7) % 256)
    const b64 = bytesToBase64(big)
    expect(base64Bytes(b64)).toBe(200_000)
    expect(base64ToBytes(b64)).toEqual(big)
    expect([base64Bytes('AQID'), base64Bytes('AQI='), base64Bytes('AQ=='), base64Bytes('')]).toEqual([3, 2, 1, 0])
  })
  it('a stored image and its data URL convert both ways', () => {
    const stored = fromDataUrl(jpeg(9, 8, 7, 6))!
    expect(stored.type).toBe('image/jpeg')
    expect([...new Uint8Array(stored.data)]).toEqual([9, 8, 7, 6])
    expect(toDataUrl(stored)).toBe(jpeg(9, 8, 7, 6))
    expect(fromDataUrl('nope')).toBeNull()
  })
  it('shrinks to the long side, keeps proportions, never enlarges', () => {
    expect(scaledSize(4800, 2400, 2400)).toEqual({ width: 2400, height: 1200 })
    expect(scaledSize(1414, 2000, 1600)).toEqual({ width: 1131, height: 1600 })
    expect(scaledSize(1616, 904, 2400)).toEqual({ width: 1616, height: 904 })
    expect(scaledSize(5000, 3000, 0)).toEqual({ width: 5000, height: 3000 })
  })
  it('names and sizes for people', () => {
    expect(nameFromFile('Карта на света.png')).toBe('Карта на света')
    expect(nameFromFile('Подножието на Хелрик Пиик..png')).toBe('Подножието на Хелрик Пиик.')
    expect(nameFromFile('.png')).toBe('Image')
    expect([formatBytes(900), formatBytes(420_000), formatBytes(3_600_000)]).toEqual(['900 B', '410 KB', '3.4 MB'])
  })
})

describe('the list on the character', () => {
  const c = addImages(hero(), [img('a', 'World'), img('b', 'North'), img('c', 'Emberhold')])

  it('a hero without images has no images field; adding makes it, removing the last takes it away', () => {
    expect('images' in hero()).toBe(false)
    expect(names(c)).toEqual(['World', 'North', 'Emberhold'])
    const none = removeImage(removeImage(removeImage(c, 'a'), 'b'), 'c')
    expect('images' in none).toBe(false)
    expect(addImages(c, [])).toBe(c)
  })
  it('renames; a blank name or the same name changes nothing', () => {
    expect(names(renameImage(c, 'b', '  The North  '))).toEqual(['World', 'The North', 'Emberhold'])
    expect(renameImage(c, 'b', '   ')).toBe(c)
    expect(renameImage(c, 'b', 'North')).toBe(c)
    expect(renameImage(c, 'zzz', 'X')).toBe(c)
  })
  it('moves earlier and later, to the ends, and stops there', () => {
    expect(names(moveImage(c, 'c', -1))).toEqual(['World', 'Emberhold', 'North'])
    expect(names(moveImage(c, 'a', 1))).toEqual(['North', 'World', 'Emberhold'])
    expect(names(moveImage(c, 'c', -99))).toEqual(['Emberhold', 'World', 'North'])
    expect(names(moveImage(c, 'a', 99))).toEqual(['North', 'Emberhold', 'World'])
    expect(moveImage(c, 'a', -1)).toBe(c)
    expect(moveImage(c, 'c', 1)).toBe(c)
  })
  it('removes one; the total size follows', () => {
    expect(names(removeImage(c, 'b'))).toEqual(['World', 'Emberhold'])
    expect(removeImage(c, 'zzz')).toBe(c)
    expect([imagesBytes(c), imagesBytes(removeImage(c, 'b')), imagesBytes(hero())]).toEqual([3000, 2000, 0])
  })
})

describe('files: older ones, and the round trip with pictures', () => {
  it('the schema version did not change, and a file without images is read as before: no images field, no warning about it', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3)
    for (const text of [sample, '{"schemaVersion":2,"name":"Old"}', '{"schemaVersion":3,"name":"Now","timers":[]}']) {
      const r = importCharacterJson(text)
      expect('images' in r.character).toBe(false)
      expect(r.imagesInFile).toBe(false)
      expect(r.imageData).toEqual({})
      expect(r.warnings.filter((w) => /image/i.test(w))).toEqual([])
      expect(JSON.stringify(r.character)).not.toContain('images')
    }
  })
  it('import takes the pictures out of the character and hands them over by image id', () => {
    const r = normalizeCharacter({ name: 'Grav', images: [{ id: 'w', name: 'World', width: 1616, height: 904, thumb: PNG, data: jpeg(1, 2, 3, 4, 5) }] })
    expect(r.warnings).toEqual([])
    expect(r.imagesInFile).toBe(true)
    expect(r.character.images).toEqual([{ id: 'w', name: 'World', width: 1616, height: 904, bytes: 5, thumb: PNG }])
    expect(r.imageData).toEqual({ w: jpeg(1, 2, 3, 4, 5) })
    // what goes to localStorage has no picture in it
    expect(JSON.stringify(r.character)).not.toContain(jpeg(1, 2, 3, 4, 5))
  })
  it('forgiving: missing id and name are made up, a bad picture or thumbnail is dropped with a warning, a repeated id is replaced', () => {
    const r = normalizeCharacter({
      name: 'Grav',
      images: [{ data: PNG }, 'oops', { id: 'x', name: 'Tree', data: 'data:image/svg+xml;base64,PHN2Zy8+', thumb: 'http://x/y.png' }, { id: 'x', name: 'Twin' }],
    })
    const list = r.character.images!
    expect(list.map((i) => i.name)).toEqual(['Image 1', 'Tree', 'Twin'])
    expect(list[0].id).toBeTruthy()
    expect(Object.keys(r.imageData)).toEqual([list[0].id])
    expect(list[1].thumb).toBeUndefined()
    expect(list[2].id).not.toBe('x')
    expect(r.warnings).toEqual([
      'images[1]: expected an object, ignored.',
      'images[2].data: not a picture the app can show (expected a data URL of a JPEG, PNG, WebP or GIF); "Tree" has no picture.',
      'images[2].thumb: not an image data URL, ignored.',
      'images[3]: the id "x" is used twice; this image got a new one.',
    ])
  })
  it('an empty list is a list: imagesInFile is true, the character has no images', () => {
    const r = normalizeCharacter({ name: 'Grav', images: [] })
    expect(r.imagesInFile).toBe(true)
    expect('images' in r.character).toBe(false)
  })

  it('export puts the pictures back, import of that file gives the same character and the same pictures', async () => {
    const store = memoryImageStore()
    const c = addImages(hero(), [img('a', 'World'), img('b', 'North')])
    await store.put(c.id, 'a', fromDataUrl(jpeg(1, 2, 3))!)
    await store.put(c.id, 'b', fromDataUrl(PNG)!)
    const { json, missing } = await exportWithImages(c, store)
    expect(missing).toEqual([])
    const file = JSON.parse(json)
    expect(file.images.map((i: { data: string }) => i.data)).toEqual([jpeg(1, 2, 3), PNG])

    const r = importCharacterJson(json)
    expect(r.warnings).toEqual([])
    expect(r.imageData).toEqual({ a: jpeg(1, 2, 3), b: PNG })
    // bytes are now the real ones, counted from the pictures
    expect(r.character.images!.map((i) => i.bytes)).toEqual([3, base64Bytes(PNG.split(',')[1])])
    expect({ ...r.character, images: undefined }).toEqual({ ...c, images: undefined })

    // on "another device": an empty store
    const phone = memoryImageStore()
    await storeImported(r.character, r.imageData, phone)
    expect((await phone.ids('grav')).sort()).toEqual(['a', 'b'])
    expect(toDataUrl((await phone.get('grav', 'a'))!)).toBe(jpeg(1, 2, 3))
    expect(toDataUrl((await phone.get('grav', 'b'))!)).toBe(PNG)
  })
  it('a hero without images exports exactly as before', async () => {
    const c = hero()
    expect((await exportWithImages(c, memoryImageStore())).json).toBe(JSON.stringify(c, null, 2))
    expect(exportWithoutImages(c)).toBe(JSON.stringify(c, null, 2))
  })
  it('a picture this browser does not have: exported as an entry without data, and named', async () => {
    const store = memoryImageStore()
    const c = addImages(hero(), [img('a', 'World'), img('b', 'North')])
    await store.put(c.id, 'a', fromDataUrl(jpeg(1))!)
    const { json, missing } = await exportWithImages(c, store)
    expect(missing).toEqual(['North'])
    expect(JSON.parse(json).images.map((i: { data?: string }) => i.data)).toEqual([jpeg(1), undefined])
  })
  it('export without images: no images field at all, everything else the same', () => {
    const c = addImages(hero(), [img('a')])
    const light = JSON.parse(exportWithoutImages(c))
    expect('images' in light).toBe(false)
    expect(light).toEqual(JSON.parse(JSON.stringify(hero())))
    expect(importCharacterJson(exportWithoutImages(c)).imagesInFile).toBe(false)
  })
})

describe('import over an existing character', () => {
  const existing = addImages(hero(), [img('a', 'World')])

  it('a file without an images field keeps the images the browser has', () => {
    const r = importCharacterJson(JSON.stringify({ id: 'grav', name: 'Grav, edited by hand' }))
    const c = keepImages(r.character, r.imagesInFile, existing)
    expect(c.name).toBe('Grav, edited by hand')
    expect(names(c)).toEqual(['World'])
  })
  it('a file with the field is taken at its word, also when the list is empty', () => {
    const empty = importCharacterJson(JSON.stringify({ id: 'grav', name: 'Grav', images: [] }))
    expect(imagesOf(keepImages(empty.character, empty.imagesInFile, existing))).toEqual([])
    const other = importCharacterJson(JSON.stringify({ id: 'grav', name: 'Grav', images: [{ id: 'z', name: 'Other' }] }))
    expect(names(keepImages(other.character, other.imagesInFile, existing))).toEqual(['Other'])
  })
  it('nothing to keep: the character is returned as it is', () => {
    const r = importCharacterJson('{"name":"New"}')
    expect(keepImages(r.character, false, undefined)).toBe(r.character)
    expect(keepImages(r.character, false, hero())).toBe(r.character)
  })
  it('an entry without data keeps the picture already stored under the same id', async () => {
    const store = memoryImageStore()
    await store.put('grav', 'a', fromDataUrl(jpeg(5, 5))!)
    const r = importCharacterJson(JSON.stringify({ id: 'grav', name: 'Grav', images: [{ id: 'a', name: 'World' }] }))
    await storeImported(r.character, r.imageData, store)
    expect(toDataUrl((await store.get('grav', 'a'))!)).toBe(jpeg(5, 5))
  })
  it('imported as a copy: the pictures are stored under the new id, the ones without data copied from the original', async () => {
    const store = memoryImageStore()
    await store.put('grav', 'a', fromDataUrl(jpeg(5, 5))!)
    const r = importCharacterJson(JSON.stringify({ id: 'grav', name: 'Grav', images: [{ id: 'a', name: 'World' }, { id: 'b', name: 'North', data: jpeg(7) }] }))
    const copy = { ...r.character, id: 'grav-2' }
    await storeImported(copy, r.imageData, store, 'grav')
    expect((await store.ids('grav-2')).sort()).toEqual(['a', 'b'])
    expect(toDataUrl((await store.get('grav-2', 'a'))!)).toBe(jpeg(5, 5))
    expect(await store.ids('grav')).toEqual(['a'])
  })
})

describe('the image store: cleaning up', () => {
  it('drops the pictures the character no longer lists, and only this character’s', async () => {
    const store = memoryImageStore()
    for (const [c, i] of [['grav', 'a'], ['grav', 'b'], ['grav', 'c'], ['gravity', 'a'], ['other', 'b']]) await store.put(c, i, fromDataUrl(jpeg(1))!)
    const c = addImages(hero(), [img('a'), img('c')])
    expect(await dropUnlisted(c, store)).toEqual(['b'])
    expect((await store.ids('grav')).sort()).toEqual(['a', 'c'])
    expect(await store.ids('gravity')).toEqual(['a'])
    expect(await store.ids('other')).toEqual(['b'])
    await dropAll('grav', store)
    expect(await store.ids('grav')).toEqual([])
    expect(await store.ids('gravity')).toEqual(['a'])
  })
})

describe('the viewer: fit, zoom, drag', () => {
  const phone = { width: 390, height: 700 }
  const desk = { width: 1920, height: 1000 }
  const map = { width: 1616, height: 904 }

  it('fits the whole picture on the screen; a small picture is not blown up', () => {
    expect(fitSize(map, phone)).toEqual({ width: 390, height: (904 * 390) / 1616 })
    expect(fitSize(map, desk)).toEqual(map)
    expect(fitSize({ width: 1414, height: 2000 }, desk)).toEqual({ width: 707, height: 1000 })
    expect(fitSize({ width: 0, height: 0 }, desk)).toEqual({ width: 0, height: 0 })
  })
  it('zoom goes up to 4 times the picture’s own pixels (on a phone that is far more than 4 times the fitted size)', () => {
    expect(maxScale(map, fitSize(map, desk))).toBe(4)
    expect(maxScale(map, fitSize(map, phone))).toBeCloseTo((1616 / 390) * 4)
  })
  it('zooming keeps the point under the cursor where it is', () => {
    const fit = fitSize(map, desk)
    const v = zoomAt(FIT, 2, 300, -100, fit, desk, 4)
    expect(v.scale).toBe(2)
    // the picture point that was at (300, -100) is still there: (300 - x) / 2 = 300, measured from the picture's centre
    expect((300 - v.x) / v.scale).toBeCloseTo(300)
    expect((-100 - v.y) / v.scale).toBeCloseTo(-100)
    const again = zoomAt(v, 1.5, 300, -100, fit, desk, 4)
    expect((300 - again.x) / again.scale).toBeCloseTo(300)
  })
  it('zoom stays between "fits" and the maximum; back at "fits" the picture is centred again', () => {
    const fit = fitSize(map, desk)
    expect(zoomAt(FIT, 100, 0, 0, fit, desk, 4).scale).toBe(4)
    expect(zoomAt({ scale: 2, x: 400, y: 200 }, 0.01, 500, 300, fit, desk, 4)).toEqual(FIT)
  })
  it('the picture cannot be dragged past its edge; a side that fits the screen stays centred', () => {
    const fit = fitSize(map, phone) // 390 x 218
    const v = clampView({ scale: 2, x: 9999, y: 9999 }, fit, phone, 16)
    expect(v.x).toBeCloseTo((390 * 2 - 390) / 2)
    expect(v.y).toBe(0) // 436 px high on a 700 px stage: nothing to drag vertically
    expect(clampView({ scale: 2, x: -9999, y: 0 }, fit, phone, 16).x).toBeCloseTo(-195)
    expect(clampView({ scale: 0.2, x: 50, y: 50 }, fit, phone, 16)).toEqual(FIT)
  })
  it('next and previous go round at the ends', () => {
    expect([stepIndex(0, 1, 9), stepIndex(8, 1, 9), stepIndex(0, -1, 9), stepIndex(4, -1, 9), stepIndex(0, 1, 0)]).toEqual([1, 0, 8, 3, 0])
  })
})
