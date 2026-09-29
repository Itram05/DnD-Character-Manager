// Potions and spell scrolls: how the Play screen recognizes them among the items, and what it shows.
// The data stays plain items with a quantity (no schema change); everything here is derived from
// the item's name and description at display time.
//
// Rules:
// - Scroll: an item without charges whose name contains the word "scroll" (or "свитък").
//   The spell is read from the name: "Scroll of X", "Spell Scroll of X", "Spell Scroll (X)",
//   "Scroll: X", "Scroll - X", "X Scroll", "Свитък с/на/за X".
// - Potion: an item without charges, not a scroll, whose name contains "potion", "elixir",
//   "philter"/"philtre" (or "отвара").
// - Healing potion: a potion whose name also says "healing" (or "лекуване"/"лечебна").
//   The four kinds (Healing, Greater, Superior, Supreme) are counters next to Concentration, always all four
//   (a kind without an item shows ×0; "+" on it creates the item, see addHealingPotion in play.ts);
//   every other potion (Climbing, Water Breathing...) is a card next to the scrolls.
// An item with charges is never a consumable here: it keeps its card with pips.
// "Scroll case" / "scroll tube" are containers, not scrolls.
import type { SrdSpell } from '../data/srd'
import type { Character, Item, Spell } from './types'

type Named = Pick<Item, 'name' | 'charges'>

const SCROLL_WORD = /\bscrolls?\b|свит[ъа]к/i
const POTION_WORD = /\b(potions?|elixirs?|philters?|philtres?)\b|отвар/i

const NOT_SCROLL = /\bscroll\s*(case|tube|holder)s?\b/i

export const isScroll = (i: Named) => !i.charges && SCROLL_WORD.test(i.name) && !NOT_SCROLL.test(i.name)
export const isPotion = (i: Named) => !i.charges && !isScroll(i) && POTION_WORD.test(i.name)

/**
 * Carried and used up, not equipped: scrolls, potions, and any item the Play screen spends by quantity
 * (no charges, an activation, no active powers: Alchemist's Fire, a flask of oil, caltrops).
 * These are on the Play screen without "equipped" (itemInPlay in rules.ts).
 */
export const isCarriedConsumable = (i: Pick<Item, 'name' | 'charges' | 'activation' | 'powers'>) =>
  isScroll(i) || isPotion(i) || (!i.charges && !!i.activation && !(i.powers ?? []).some((p) => p.activation !== 'passive'))

const NAME_PATTERNS: RegExp[] = [
  /^(?:spell\s+)?scroll\s*\((.+)\)$/i, // Spell Scroll (Fireball)
  /^(?:spell\s+)?scroll\s*(?:of\b|:|-|–|—)\s*(.+)$/i, // Scroll of Fireball, Spell Scroll: Fireball
  /^(.+?)\s+(?:spell\s+)?scroll$/i, // Fireball scroll
  /свит[ъа]к\s+(?:с|на|за)\s+(.+)$/i, // Свитък с Fireball
]

/** The spell name written in a scroll's name, or undefined ("Spell Scroll" alone names no spell). */
export function scrollSpellName(itemName: string): string | undefined {
  const n = itemName.trim()
  for (const re of NAME_PATTERNS) {
    const m = n.match(re)
    if (!m) continue
    const s = m[1].trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()
    if (s && !/^spell$/i.test(s)) return s
  }
  return undefined
}

const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim()
const dropParen = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '')

/** "Fireball (3rd level)" and "Fireball, level 3" should still find Fireball. */
function candidates(name: string): string[] {
  const out = [name, dropParen(name), name.split(',')[0]].map(norm).filter(Boolean)
  return [...new Set(out)]
}

type SrdLite = Pick<SrdSpell, 'name' | 'level' | 'school' | 'castingTime' | 'range' | 'components' | 'duration' | 'concentration' | 'ritual' | 'text'>

export interface ScrollInfo {
  /** Spell name read from the item name (may be undefined). */
  spellName?: string
  /** Where the spell text came from. "item" = spell not found, the item's own description is shown. */
  from: 'character' | 'srd' | 'item'
  /** The spell as found (character spell name wins; else the SRD name). */
  resolvedName?: string
  level?: number
  school?: string
  castingTime?: string
  range?: string
  components?: string
  duration?: string
  concentration: boolean
  ritual: boolean
  description: string
  /** The item's own description, when the spell text comes from elsewhere. */
  note?: string
}

function findCharacterSpell(c: Character, name: string): Spell | undefined {
  const keys = candidates(name)
  for (const k of keys) {
    const exact = c.spells.find((s) => norm(s.name) === k)
    if (exact) return exact
  }
  // "Cure Wounds (Paladin)" in the spell list still matches a Scroll of Cure Wounds
  for (const k of keys) {
    const loose = c.spells.find((s) => norm(dropParen(s.name)) === k)
    if (loose) return loose
  }
  return undefined
}

function findSrdSpell(srd: readonly SrdLite[] | undefined, name: string): SrdLite | undefined {
  if (!srd) return undefined
  for (const k of candidates(name)) {
    const s = srd.find((x) => norm(x.name) === k)
    if (s) return s
  }
  return undefined
}

/**
 * What a scroll casts. Order: the character's own spell (their notes win), then the SRD spell,
 * then the item's description. Missing fields of a character spell are filled from the SRD.
 */
export function scrollInfo(c: Character, item: Item, srd?: readonly SrdLite[]): ScrollInfo {
  const spellName = scrollSpellName(item.name)
  const own = spellName ? findCharacterSpell(c, spellName) : undefined
  const ref = spellName ? findSrdSpell(srd, spellName) : undefined
  const itemText = (item.description ?? '').trim()
  if (!own && !ref) {
    return { spellName, from: 'item', concentration: false, ritual: false, description: itemText }
  }
  const description = own?.description?.trim() || ref?.text || itemText
  return {
    spellName,
    from: own ? 'character' : 'srd',
    resolvedName: own?.name ?? ref?.name,
    level: own?.level ?? ref?.level,
    school: own?.school || ref?.school,
    castingTime: own?.castingTime || ref?.castingTime,
    range: own?.range || ref?.range,
    components: own?.components || ref?.components,
    duration: own?.duration || ref?.duration,
    concentration: own ? own.concentration : !!ref?.concentration,
    ritual: own ? own.ritual : !!ref?.ritual,
    description,
    note: itemText && itemText !== description ? itemText : undefined,
  }
}

// ---------------- potions ----------------

/** "Potion of Greater Healing" -> "Greater Healing", for the compact counter. */
export function potionLabel(name: string): string {
  const s = name
    .trim()
    .replace(/^potion\s+of\s+(the\s+)?/i, '')
    .replace(/^potion\s*[:\-–—]\s*/i, '')
    .trim()
  return s || name.trim()
}

/** First dice expression of the description ("Regain 4d4 + 4 HP." -> "4d4+4"), shown on the counter. */
export function potionDice(description: string | undefined): string | undefined {
  const m = (description ?? '').match(/\b\d*d\d+(?:\s*[+\-−]\s*\d+)?(?!\w)/)
  return m ? m[0].replace(/\s+/g, '') : undefined
}

// ---------------- healing potions ----------------

export type HealingTier = 'healing' | 'greater' | 'superior' | 'supreme'

/** Standard healing of the four potions (SRD), used when the item's description has no dice. */
export const HEALING_DICE: Record<HealingTier, string> = {
  healing: '2d4+2',
  greater: '4d4+4',
  superior: '8d4+8',
  supreme: '10d4+20',
}

/** The four kinds in the order the Concentration panel shows them. */
export const HEALING_TIERS: HealingTier[] = ['healing', 'greater', 'superior', 'supreme']

/** Standard item name of each kind, used when "+" creates a potion the character did not have. */
export const HEALING_NAME: Record<HealingTier, string> = {
  healing: 'Potion of Healing',
  greater: 'Potion of Greater Healing',
  superior: 'Potion of Superior Healing',
  supreme: 'Potion of Supreme Healing',
}

/** Description of a created potion: it names the dice, so healingDice reads them back like on any other potion. */
export const healingDescription = (tier: HealingTier) => `You regain ${HEALING_DICE[tier].replace('+', ' + ')} Hit Points when you drink this potion.`

const HEALING_WORD = /\bheal(ing)?\b|лекув|лечеб/i

/**
 * Which of the four healing potions this is, or undefined for any other item.
 * "Potion of Greater Healing", "Greater Healing Potion", "potion of healing (superior)" all work.
 */
export function healingTier(i: Named): HealingTier | undefined {
  if (!isPotion(i) || !HEALING_WORD.test(i.name)) return undefined
  const n = i.name.toLowerCase()
  if (/\bsupreme\b/.test(n)) return 'supreme'
  if (/\bsuperior\b/.test(n)) return 'superior'
  if (/\bgreater\b/.test(n)) return 'greater'
  return 'healing'
}

export const isHealingPotion = (i: Named) => healingTier(i) !== undefined

/** Healing potion dice: the item's own description wins, else the standard for its kind. */
export function healingDice(i: Pick<Item, 'name' | 'charges' | 'description'>): string | undefined {
  const tier = healingTier(i)
  if (!tier) return undefined
  return potionDice(i.description) ?? HEALING_DICE[tier]
}

/**
 * Reads a scroll: one fewer, and a concentration spell goes into the Concentration slot,
 * like casting it. Nothing happens at quantity 0.
 */
export function readScroll(c: Character, itemId: string, srd?: readonly SrdLite[]): { character: Character; spell?: string; droppedConcentration?: string; left: number } | undefined {
  const item = c.inventory.items.find((i) => i.id === itemId)
  if (!item || item.quantity <= 0) return undefined
  const info = scrollInfo(c, item, srd)
  const left = item.quantity - 1
  let next: Character = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === itemId ? { ...i, quantity: left } : i)) } }
  let dropped: string | undefined
  const spell = info.resolvedName ?? info.spellName
  if (info.concentration && spell) {
    const cur = next.spellcasting.concentration
    if (cur && cur !== spell) dropped = cur
    next = { ...next, spellcasting: { ...next.spellcasting, concentration: spell } }
  }
  return { character: next, spell, droppedConcentration: dropped, left }
}
