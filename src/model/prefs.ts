// The player's choices for the Play screen (preferences.play), per character, saved in the file.
// Every choice is optional: an absent one means the default below, and choosing the default again removes
// the field, so a file only ever carries what the player really changed.
import { ATTACK_ORDERS, PHONE_STARTS, type AttackOrder, type Character, type PhoneStart, type PlayPrefs } from './types'

export { ATTACK_ORDERS, PHONE_STARTS }

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
