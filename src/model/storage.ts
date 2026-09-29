// localStorage persistence. Every access is wrapped in try/catch: storage can be full,
// disabled (private mode), or contain something hand-edited and broken.
import { importCharacterJson, normalizeCharacter } from './normalize'
import type { Character } from './types'

const PREFIX = 'dnd-sheet'
const INDEX_KEY = `${PREFIX}.index`
const charKey = (id: string) => `${PREFIX}.char.${id}`
const SETTINGS_KEY = `${PREFIX}.settings`
const NAV_COLLAPSED_KEY = `${PREFIX}.sideNavCollapsed`

export interface StorageStatus {
  ok: boolean
  error?: string
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): StorageStatus {
  try {
    window.localStorage.setItem(key, value)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `Could not save (${(e as Error).name}). Export your character to a file to be safe.` }
  }
}

function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function readIndex(): string[] {
  const raw = safeGet(INDEX_KEY)
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export interface StoredSummary {
  id: string
  name: string
  summary: string
  updatedAt: string
  broken?: string
}

export function listCharacters(): { characters: Character[]; broken: StoredSummary[] } {
  const characters: Character[] = []
  const broken: StoredSummary[] = []
  for (const id of readIndex()) {
    const raw = safeGet(charKey(id))
    if (!raw) continue
    try {
      characters.push(importCharacterJson(raw).character)
    } catch (e) {
      broken.push({ id, name: id, summary: '', updatedAt: '', broken: (e as Error).message })
    }
  }
  characters.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { characters, broken }
}

export function loadCharacter(id: string): Character | null {
  const raw = safeGet(charKey(id))
  if (!raw) return null
  try {
    return importCharacterJson(raw).character
  } catch {
    return null
  }
}

export function saveCharacter(c: Character): StorageStatus {
  const status = safeSet(charKey(c.id), JSON.stringify(c))
  if (!status.ok) return status
  const idx = readIndex()
  if (!idx.includes(c.id)) return safeSet(INDEX_KEY, JSON.stringify([...idx, c.id]))
  return status
}

export function deleteCharacter(id: string): StorageStatus {
  safeRemove(charKey(id))
  return safeSet(INDEX_KEY, JSON.stringify(readIndex().filter((x) => x !== id)))
}

export function characterToJson(c: Character): string {
  return JSON.stringify(c, null, 2)
}

export function fileNameFor(c: Character): string {
  const base = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'
  return `${base}.json`
}

/** Re-normalizes (e.g. after an app update) without touching storage. */
export const renormalize = (c: Character) => normalizeCharacter(c).character

export interface Settings {
  theme: 'dark' | 'light'
  view: 'cards' | 'list'
}

export function loadSettings(): Settings {
  const def: Settings = {
    theme: typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    view: 'cards',
  }
  const raw = safeGet(SETTINGS_KEY)
  if (!raw) return def
  try {
    const v = JSON.parse(raw)
    return {
      theme: v.theme === 'light' ? 'light' : v.theme === 'dark' ? 'dark' : def.theme,
      view: v.view === 'list' ? 'list' : 'cards',
    }
  } catch {
    return def
  }
}

export const saveSettings = (s: Settings) => safeSet(SETTINGS_KEY, JSON.stringify(s))

/** Whether the side column with the section list (Play, computer) is folded away. Any trouble -> unfolded. */
export function loadSideNavCollapsed(): boolean {
  return safeGet(NAV_COLLAPSED_KEY) === '1'
}

export const saveSideNavCollapsed = (collapsed: boolean) => safeSet(NAV_COLLAPSED_KEY, collapsed ? '1' : '0')

const RESOURCES_OPEN_KEY = `${PREFIX}.phoneResourcesOpen`

/** Whether the phone's "Resources" block (slots, Sorcery Points, concentration, potions) is unfolded. Default: folded. */
export function loadResourcesOpen(): boolean {
  return safeGet(RESOURCES_OPEN_KEY) === '1'
}

export const saveResourcesOpen = (open: boolean) => safeSet(RESOURCES_OPEN_KEY, open ? '1' : '0')
