// Tags: short labels on spells, features, items and item powers, used by the filter on the Play
// screen and the Spells tab. Every tag belongs to one of four groups (see tagGroup):
//
// - categories: what a card is for. Damage, Healing and Control are read from the text; Buff, Defense,
//   Mobility and Summon you add yourself; Utility is added when a card has no other category;
// - damage types (fire, psychic...): read from the text, a finer choice under Damage;
// - properties: Concentration and Ritual, from the spell flags;
// - anything else: your own free tags ("staff", "revive"), kept as written.
//
// Automatic tags are read from the data every time (never stored, so they follow edits); your own
// tags are stored in the `tags` field (lowercase). Automatic tags are a reading aid, not a rules
// engine: they look for the same words the text highlighting looks for (highlight.ts). Where they
// miss, add the category yourself (e.g. "control" on Command).
import { DAMAGE_TYPES, tokenize } from './highlight'
import { normalizeTag } from './normalize'
import type { Attack, Character, Feature, Item, ItemPower, Spell } from './types'

/** Categories in display order. */
export const CATEGORIES = ['damage', 'healing', 'control', 'buff', 'defense', 'mobility', 'summon', 'utility'] as const
export type Category = (typeof CATEGORIES)[number]
/** Read from the text. */
export const AUTO_CATEGORIES: readonly Category[] = ['damage', 'healing', 'control']
/** Offered in the tag editor: the categories the text never gives. (Any category can be added by hand.) */
export const MANUAL_CATEGORIES: readonly Category[] = ['buff', 'defense', 'mobility', 'summon']
/** Given to a card with no other category. */
export const FALLBACK_CATEGORY: Category = 'utility'
export const PROPERTIES = ['concentration', 'ritual'] as const
/** Every tag with a built-in label. */
export const BUILT_IN_TAGS: readonly string[] = [...CATEGORIES, ...DAMAGE_TYPES, ...PROPERTIES]

export type TagGroup = 'cat' | 'dmg' | 'prop' | 'other'
const CAT = new Set<string>(CATEGORIES)
const DMG = new Set<string>(DAMAGE_TYPES)
const PROP = new Set<string>(PROPERTIES)
export const tagGroup = (t: string): TagGroup => (CAT.has(t) ? 'cat' : DMG.has(t) ? 'dmg' : PROP.has(t) ? 'prop' : 'other')

const ORDER = new Map<string, number>(BUILT_IN_TAGS.map((t, i) => [t, i]))

// "can't regain Hit Points" (Chill Touch) is the opposite of healing
const NEGATED = /(?:can't|can’t|cannot|can not|no longer|doesn't|does not)\s+$/i

/** Categories and damage types that can be read from a rules text. */
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
      if (!/spell\s+save\s+dc/i.test(tok.text)) hasSave = true
    } else if (tok.kind === 'condition') hasCondition = true
    prevText = tok.kind === 'text' ? tok.text : ''
  }
  // a save that can leave a condition on the target: Hold Person, Thunderous Smite...
  if (hasSave && hasCondition) out.add('control')
  return [...out]
}

export function spellAutoTags(s: Pick<Spell, 'concentration' | 'ritual' | 'description'>): string[] {
  return [...(s.concentration ? ['concentration'] : []), ...(s.ritual ? ['ritual'] : []), ...textTags(s.description)]
}

export function attackAutoTags(a: Pick<Attack, 'damageType' | 'notes'>): string[] {
  const out = ['damage']
  const dt = normalizeTag(a.damageType ?? '')
  if (DMG.has(dt)) out.push(dt)
  return [...out, ...textTags(a.notes)]
}

/**
 * Own tags plus automatic tags, without duplicates, in a stable order. A damage type implies Damage;
 * a card with no category at all gets Utility (so a category you add yourself replaces it).
 */
export function mergeTags(auto: readonly string[], own: readonly string[] | undefined): string[] {
  const all = new Set([...auto, ...(own ?? []).map(normalizeTag).filter(Boolean)])
  if ([...all].some((t) => DMG.has(t))) all.add('damage')
  if (![...all].some((t) => CAT.has(t))) all.add(FALLBACK_CATEGORY)
  return sortTags([...all])
}

/** What the tag editor shows as automatic: everything mergeTags adds on top of your own tags. */
export function autoPart(auto: readonly string[], own: readonly string[] | undefined): string[] {
  const mine = new Set((own ?? []).map(normalizeTag))
  return mergeTags(auto, own).filter((t) => !mine.has(t))
}

export const spellTags = (s: Spell) => mergeTags(spellAutoTags(s), s.tags)
export const featureTags = (f: Feature) => mergeTags(textTags(f.description), f.tags)
export const itemTags = (i: Item) => mergeTags(textTags(i.description), i.tags)
/** A power carries its item's own tags too ("staff" on the item shows every Staff power). */
export const powerTags = (i: Item, p: ItemPower) => mergeTags(textTags(p.description), [...(p.tags ?? []), ...(i.tags ?? [])])
export const attackTags = (a: Attack) => mergeTags(attackAutoTags(a), undefined)

/**
 * Which category wins the colour of a card when it has several (the first two are shown). A separate
 * order from CATEGORIES (the filter's display order): here Defense comes before Buff.
 */
export const CATEGORY_PRIORITY: readonly Category[] = ['damage', 'healing', 'control', 'defense', 'buff', 'mobility', 'summon', 'utility']

/** The categories that colour a card: at most `max` of its tags that are categories, by CATEGORY_PRIORITY. */
export function colourCategories(tags: readonly string[] | undefined, max = 2): Category[] {
  const have = new Set(tags ?? [])
  return CATEGORY_PRIORITY.filter((c) => have.has(c)).slice(0, max)
}

/** Categories, then damage types, then properties (each in their fixed order), then the rest A-Z. */
export function sortTags(tags: readonly string[]): string[] {
  const rank = (t: string) => ORDER.get(t) ?? 1000
  return [...tags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** Every own tag used anywhere on the character: offered as suggestions in the tag editor. */
export function ownTagsIn(c: Pick<Character, 'spells' | 'features' | 'inventory'>): string[] {
  const all = [...c.spells.flatMap((s) => s.tags ?? []), ...c.features.flatMap((f) => f.tags ?? []), ...c.inventory.items.flatMap((i) => [...(i.tags ?? []), ...(i.powers ?? []).flatMap((p) => p.tags ?? [])])]
  return sortTags([...new Set(all)])
}
