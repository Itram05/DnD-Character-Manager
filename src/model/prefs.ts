// The player's choices for the Play screen (preferences.play) and for the marks on maps (preferences.maps),
// per character, saved in the file.
// Every choice is optional: an absent one means the default below, and choosing the default again removes
// the field, so a file only ever carries what the player really changed.
import { ATTACK_ORDERS, MAP_LAYERS, MARK_SIZES, PHONE_STARTS, type AttackOrder, type Character, type CharacterImage, type MapLayer, type MapPrefs, type MarkSize, type PhoneStart, type PlayPrefs } from './types'

export { ATTACK_ORDERS, MAP_LAYERS, MARK_SIZES, PHONE_STARTS }

/** What a character without the preference gets. */
export const DEFAULT_PLAY_PREFS: Required<PlayPrefs> = {
  // the order the player (or their file) put the attacks in: the main weapon first, not "C" before "S"
  attackOrder: 'file',
  // every hand: nothing is behind a filter the player did not set (Second Wind and the reactions used to be)
  phoneStart: 'all',
  editButtons: true,
}

/** The Play preferences in force: the stored ones over the defaults. */
export function playPrefs(c: Pick<Character, 'preferences'>): Required<PlayPrefs> {
  return { ...DEFAULT_PLAY_PREFS, ...(c.preferences.play ?? {}) }
}

/** Sets one Play preference; the default is stored as "absent" (and an empty group is removed). */
export function setPlayPref<K extends keyof PlayPrefs>(c: Character, key: K, value: Required<PlayPrefs>[K]): Character {
  if (playPrefs(c)[key] === value) return c
  const play: PlayPrefs = { ...(c.preferences.play ?? {}) }
  if (value === DEFAULT_PLAY_PREFS[key]) delete play[key]
  else play[key] = value
  const { play: _old, ...rest } = c.preferences
  void _old
  return { ...c, preferences: Object.keys(play).length ? { ...rest, play } : rest }
}

/** The filter a phone opens the Play screen with: one hand, or nothing ("all"). */
export const phoneStartFilter = (c: Pick<Character, 'preferences'>): string[] => {
  const s: PhoneStart = playPrefs(c).phoneStart
  return s === 'all' ? [] : [`zone:${s}`]
}

/**
 * Sorts attack cards (or anything with the attack's id and name) as the character asks: "file" keeps the
 * order of `attacks`; "name" is A to Z by the browser's rules for the text (where Cyrillic lands among Latin names depends on the language of the browser).
 */
export function orderAttacks<T extends { id: string; name: string }>(c: Pick<Character, 'preferences' | 'attacks'>, list: readonly T[]): T[] {
  const order: AttackOrder = playPrefs(c).attackOrder
  if (order === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name))
  const at = new Map(c.attacks.map((a, i) => [a.id, i]))
  return [...list].sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0))
}

// ---------------- preferences.maps: the marks on maps (the viewer of the Images tab) ----------------

/** What a character without the preference gets: everything shown, names on, marks of the middle size. */
export const DEFAULT_MAP_PREFS: Required<MapPrefs> = { size: 'medium', names: true, hide: [] }

/** The map preferences in force: the stored ones over the defaults. */
export function mapPrefs(c: Pick<Character, 'preferences'>): Required<MapPrefs> {
  return { ...DEFAULT_MAP_PREFS, ...(c.preferences.maps ?? {}) }
}

function withMapPrefs(c: Character, maps: MapPrefs): Character {
  const { maps: _old, ...rest } = c.preferences
  void _old
  return { ...c, preferences: Object.keys(maps).length ? { ...rest, maps } : rest }
}

/** Sets the size of the marks or whether their names are written; the default is stored as "absent". */
export function setMapPref<K extends 'size' | 'names'>(c: Character, key: K, value: Required<MapPrefs>[K]): Character {
  if (mapPrefs(c)[key] === value) return c
  const maps: MapPrefs = { ...(c.preferences.maps ?? {}) }
  if (value === DEFAULT_MAP_PREFS[key]) delete maps[key]
  else maps[key] = value
  return withMapPrefs(c, maps)
}

export const layerShown = (c: Pick<Character, 'preferences'>, layer: MapLayer): boolean => !mapPrefs(c).hide.includes(layer)

/** Shows or hides one layer (pins, routes, tokens) on every map of the character. Nothing hidden = the field is absent. */
export function setLayerShown(c: Character, layer: MapLayer, shown: boolean): Character {
  if (layerShown(c, layer) === shown) return c
  const hide = MAP_LAYERS.filter((l) => (l === layer ? !shown : !layerShown(c, l)))
  const maps: MapPrefs = { ...(c.preferences.maps ?? {}) }
  if (hide.length) maps.hide = hide
  else delete maps.hide
  return withMapPrefs(c, maps)
}

/** An image as it is drawn: without the marks of the hidden layers. The scale stays (it is not a layer). */
export function shownMarks(im: CharacterImage, hide: readonly MapLayer[]): CharacterImage {
  if (!hide.length) return im
  const out = { ...im }
  for (const l of hide) delete out[l]
  return out
}

export type { MapLayer, MarkSize }
