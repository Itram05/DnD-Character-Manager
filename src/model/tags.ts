// Tags: short labels on spells, features, items and item powers, used to filter the Play screen
// and the spell list ("show me everything that heals", "fire", "concentration").
//
// Two sources, merged at display time:
// - automatic tags, read from the data every time (never stored, so they follow edits):
//   concentration, ritual (spell flags); healing, damage + damage type, save, attack, control (from the text);
// - your own tags, stored in the `tags` field (lowercase), anything you like.
// Automatic tags are a reading aid, not a rules engine: they look for the same words the text
// highlighting looks for (highlight.ts). Where they miss or overreach, add your own tag.
import { DAMAGE_TYPES, tokenize } from './highlight'
import { normalizeTag } from './normalize'
import type { Attack, Feature, Item, ItemPower, Spell } from './types'

/** Automatic tags in display order. */
export const AUTO_TAGS = ['concentration', 'ritual', 'healing', 'damage', ...DAMAGE_TYPES, 'save', 'attack', 'control'] as const
/** Offered in the tag editor as a starting vocabulary; nothing depends on them. */
export const SUGGESTED_TAGS = ['buff', 'debuff', 'defense', 'control', 'mobility', 'utility', 'aoe', 'summon', 'social'] as const

const AUTO_ORDER = new Map<string, number>(AUTO_TAGS.map((t, i) => [t, i]))
const SUGGESTED = new Set<string>(SUGGESTED_TAGS)

// "can't regain Hit Points" (Chill Touch) is the opposite of healing
const NEGATED = /(?:can't|can’t|cannot|can not|no longer|doesn't|does not)\s+$/i
const ATTACK = /\b(?:spell attack|melee attack|ranged attack|weapon attack|attack roll)s?\b/i

/** Tags that can be read from a rules text. */
export function textTags(text: string | undefined): string[] {
  const s = text ?? ''
  if (!s.trim()) return []
  const out = new Set<string>()
  let prevText = ''
  let hasCondition = false
  let hasSave = false
  for (const tok of tokenize(s)) {
    if (tok.kind === 'damage') {
      out.add('damage')
      out.add(tok.damageType)
    } else if (tok.kind === 'heal') {
      if (!NEGATED.test(prevText.slice(-20))) out.add('healing')
    } else if (tok.kind === 'save') {
      // "+1 spell save DC" on an item is a bonus, not a save the target makes
      if (!/spell\s+save\s+dc/i.test(tok.text)) {
        out.add('save')
        hasSave = true
      }
    } else if (tok.kind === 'condition') hasCondition = true
    prevText = tok.kind === 'text' ? tok.text : ''
  }
  // a save that can leave a condition on the target: Hold Person, Command, Thunderous Smite...
  if (hasSave && hasCondition) out.add('control')
  if (ATTACK.test(s)) out.add('attack')
  return [...out]
}

export function spellAutoTags(s: Pick<Spell, 'concentration' | 'ritual' | 'description'>): string[] {
  return [...(s.concentration ? ['concentration'] : []), ...(s.ritual ? ['ritual'] : []), ...textTags(s.description)]
}

export function attackAutoTags(a: Pick<Attack, 'damageType' | 'notes'>): string[] {
  const out = ['attack', 'damage']
  const dt = normalizeTag(a.damageType ?? '')
  if ((DAMAGE_TYPES as readonly string[]).includes(dt)) out.push(dt)
  return [...out, ...textTags(a.notes)]
}

/** Own tags plus automatic tags, without duplicates, in a stable order (automatic first, then own A-Z). */
export function mergeTags(auto: readonly string[], own: readonly string[] | undefined): string[] {
  return sortTags([...new Set([...auto, ...(own ?? []).map(normalizeTag).filter(Boolean)])])
}

export const spellTags = (s: Spell) => mergeTags(spellAutoTags(s), s.tags)
export const featureTags = (f: Feature) => mergeTags(textTags(f.description), f.tags)
export const itemTags = (i: Item) => mergeTags(textTags(i.description), i.tags)
/** A power carries its item's own tags too ("staff" on the item shows every Staff power). */
export const powerTags = (i: Item, p: ItemPower) => mergeTags(textTags(p.description), [...(p.tags ?? []), ...(i.tags ?? [])])
export const attackTags = (a: Attack) => mergeTags(attackAutoTags(a), undefined)

export const isAutoTag = (t: string) => AUTO_ORDER.has(t)

/** Automatic tags in their fixed order, then suggested ones, then the rest alphabetically. */
export function sortTags(tags: readonly string[]): string[] {
  const rank = (t: string) => (AUTO_ORDER.has(t) ? AUTO_ORDER.get(t)! : SUGGESTED.has(t) ? 100 : 200)
  return [...tags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** Every tag used by a list of tagged things, with how many carry it; sorted like sortTags. */
export function tagCounts(lists: readonly (readonly string[] | undefined)[]): { tag: string; n: number }[] {
  const m = new Map<string, number>()
  for (const l of lists) for (const t of new Set(l ?? [])) m.set(t, (m.get(t) ?? 0) + 1)
  return sortTags([...m.keys()]).map((tag) => ({ tag, n: m.get(tag)! }))
}

/** A thing passes the tag filter when it has every selected tag (an empty selection lets everything through). */
export const matchesTags = (tags: readonly string[] | undefined, selected: readonly string[]) => selected.every((t) => (tags ?? []).includes(t))
