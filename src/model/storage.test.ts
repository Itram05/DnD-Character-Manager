// One character open in two tabs of the app. Both tabs share one localStorage; each open sheet has its own
// session (characterSession) and its own copy of the character in memory. A sheet used to write its copy
// back whenever it was left, so the tab left last won, however old its copy was.
// Here: two sessions over one fake localStorage. What the sheet does with the outcome (shows the stored
// version, empties Undo, the toast) and the browser's `storage` event are checked in Chrome by hand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addImages, imagesOf } from './images'
import { dropUnlisted, fromDataUrl, memoryImageStore, storeImported } from './imageStore'
import { importCharacterJson } from './normalize'
import { characterSession, deleteCharacter, listCharacters, loadCharacter, saveCharacter } from './storage'
import type { Character, CharacterImage } from './types'

import sampleText from '../../examples/sample-character.json?raw'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const img = (id: string): CharacterImage => ({ id, name: id, width: 1600, height: 900, bytes: 1000, thumb: PNG })
const withHp = (c: Character, current: number): Character => ({ ...c, combat: { ...c.combat, hp: { ...c.combat.hp, current } }, updatedAt: new Date().toISOString() })
const hpOf = (c: Character | null) => c?.combat.hp.current

let full = false
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException('full', 'QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
  }
}

let hero: Character
beforeEach(() => {
  full = false
  vi.stubGlobal('window', { localStorage: fakeStorage() })
  // the character as it is in storage when the tabs open it
  const sample = importCharacterJson(sampleText).character
  saveCharacter(withHp(sample, 20))
  hero = loadCharacter(sample.id)!
})
afterEach(() => vi.unstubAllGlobals())

describe('one tab: saving works as before', () => {
  it('every change is written, one after another, and the last one is what the next opening reads', () => {
    const tab = characterSession(hero.id)
    expect(tab.save(withHp(hero, 15))).toEqual({ kind: 'saved' })
    expect(tab.save(withHp(hero, 11))).toEqual({ kind: 'saved' })
    expect(hpOf(loadCharacter(hero.id))).toBe(11)
    // Undo is a save of an earlier state, with its earlier updatedAt: written like any other
    expect(tab.save(hero)).toEqual({ kind: 'saved' })
    expect(hpOf(loadCharacter(hero.id))).toBe(20)
    expect(tab.check()).toEqual({ kind: 'same' })
  })
  it('a save that fails (storage full) says so, writes nothing, and the next one goes through', () => {
    const tab = characterSession(hero.id)
    full = true
    expect(tab.save(withHp(hero, 5)).kind).toBe('failed')
    expect(hpOf(loadCharacter(hero.id))).toBe(20)
    full = false
    expect(tab.save(withHp(hero, 5))).toEqual({ kind: 'saved' })
    expect(hpOf(loadCharacter(hero.id))).toBe(5)
  })
  it('a session reads the storage events of its own character only', () => {
    const tab = characterSession(hero.id)
    expect(tab.concerns(`dnd-sheet.char.${hero.id}`)).toBe(true)
    expect(tab.concerns(null)).toBe(true) // all of storage cleared
    expect(tab.concerns('dnd-sheet.settings')).toBe(false)
    expect(tab.concerns(`dnd-sheet.char.${hero.id}-2`)).toBe(false)
  })
})

describe('the same character in two tabs', () => {
  it('a change made in tab A survives tab B being closed with its older copy', () => {
    const a = characterSession(hero.id)
    const b = characterSession(hero.id)
    expect(a.save(withHp(hero, 7))).toEqual({ kind: 'saved' })
    // tab B is closed: it tries to write the copy it opened with
    const out = b.save(hero)
    expect(out.kind).toBe('replaced')
    expect(hpOf(out.kind === 'replaced' ? out.character : null)).toBe(7)
    expect(hpOf(loadCharacter(hero.id))).toBe(7)
  })
  it('tab B learns of the change once, takes it, and its own next change is written on top of it', () => {
    const a = characterSession(hero.id)
    const b = characterSession(hero.id)
    a.save(withHp(hero, 7))
    const found = b.check()
    expect(found.kind === 'replaced' && hpOf(found.character)).toBe(7)
    expect(b.check()).toEqual({ kind: 'same' })
    const inB = { ...(found as { character: Character }).character, name: 'Renamed in B' }
    expect(b.save(inB)).toEqual({ kind: 'saved' })
    expect(loadCharacter(hero.id)).toMatchObject({ name: 'Renamed in B', combat: { hp: { current: 7 } } })
    // and now A is the one with the older copy
    expect(a.save(withHp(hero, 1)).kind).toBe('replaced')
    expect(loadCharacter(hero.id)?.name).toBe('Renamed in B')
  })
  it('both tabs hold a change that is not written yet: the one written first stays, the other is told', () => {
    const a = characterSession(hero.id)
    const b = characterSession(hero.id)
    expect(a.save(withHp(hero, 7))).toEqual({ kind: 'saved' })
    // B's change is the later one by the clock; it still does not go over A's
    expect(b.save(withHp(hero, 3)).kind).toBe('replaced')
    expect(hpOf(loadCharacter(hero.id))).toBe(7)
  })
})

describe('tab B has the character open, tab A imports a newer one with "Replace existing"', () => {
  it('leaving tab B does not bring the old character back, and the imported pictures stay', async () => {
    const store = memoryImageStore()
    const b = characterSession(hero.id)
    // the import in tab A (CharacterList.commit): the pictures first, then the character that lists them.
    // The file is an older export: its updatedAt is before tab B's. It is still the one that stays.
    const imported: Character = { ...addImages(withHp(hero, 33), [img('map'), img('portrait')]), updatedAt: '2020-01-01T00:00:00.000Z' }
    await storeImported(imported, { map: PNG, portrait: PNG }, store)
    saveCharacter(imported)

    expect(b.save(withHp(hero, 2)).kind).toBe('replaced')
    const stored = loadCharacter(hero.id)!
    expect(hpOf(stored)).toBe(33)
    expect(imagesOf(stored).map((i) => i.id)).toEqual(['map', 'portrait'])

    // the next opening cleans up the pictures no version lists; none of the imported ones
    await store.put(hero.id, 'removed-long-ago', fromDataUrl(PNG)!)
    expect(await dropUnlisted(stored, store)).toEqual(['removed-long-ago'])
    expect((await store.ids(hero.id)).sort()).toEqual(['map', 'portrait'])
  })
  it('a sheet that opened just before the import does not delete the pictures the import brought', async () => {
    const store = memoryImageStore()
    await store.put(hero.id, 'removed-long-ago', fromDataUrl(PNG)!)
    const imported = addImages(hero, [img('map')])
    await storeImported(imported, { map: PNG }, store)
    saveCharacter(imported)
    // `hero` is what the sheet opened with (no images); storage lists the map by the time it deletes
    expect(await dropUnlisted(hero, store, () => [hero, loadCharacter(hero.id)])).toEqual(['removed-long-ago'])
    expect(await store.ids(hero.id)).toEqual(['map'])
    // the character deleted meanwhile: nothing to ask, the sheet's own list decides
    deleteCharacter(hero.id)
    expect(await dropUnlisted(hero, store, () => [hero, loadCharacter(hero.id)])).toEqual(['map'])
  })
})

describe('the character is deleted in tab A while tab B has it open', () => {
  it('leaving tab B does not bring it back, now or later', () => {
    const b = characterSession(hero.id)
    deleteCharacter(hero.id)
    expect(b.save(withHp(hero, 2))).toEqual({ kind: 'gone' })
    expect(b.check()).toEqual({ kind: 'gone' })
    // (storage now holds nothing, which is what the session saw last: it must still not write)
    expect(b.save(withHp(hero, 2))).toEqual({ kind: 'gone' })
    expect(loadCharacter(hero.id)).toBeNull()
    expect(listCharacters().characters).toEqual([])
  })
  it('deleted and imported again in tab A: tab B stays out of it', () => {
    const b = characterSession(hero.id)
    deleteCharacter(hero.id)
    expect(b.check()).toEqual({ kind: 'gone' })
    saveCharacter(withHp(hero, 40))
    expect(b.save(withHp(hero, 2))).toEqual({ kind: 'gone' })
    expect(hpOf(loadCharacter(hero.id))).toBe(40)
  })
  it('stored text that is no longer a character is left alone', () => {
    const b = characterSession(hero.id)
    window.localStorage.setItem(`dnd-sheet.char.${hero.id}`, '{ broken')
    expect(b.save(hero)).toEqual({ kind: 'gone' })
    expect(window.localStorage.getItem(`dnd-sheet.char.${hero.id}`)).toBe('{ broken')
  })
})
