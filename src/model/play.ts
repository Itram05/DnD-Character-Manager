// Play-screen logic, independent of React: which cards exist, which zone ("hand") they
// belong to, whether they are tapped, and how a spell is paid for.
//
// Metaphor: every active feature, prepared spell and usable item is a card.
// Spent = "tapped" (turned sideways). Rests "untap" the cards they restore.
// Spell slots are "mana". Passive features lie on the "battlefield".
import type { SrdSpell } from '../data/srd'
import { HEALING_NAME, HEALING_TIERS, healingDescription, healingTier, isHealingPotion, isPotion, isScroll, scrollInfo, type HealingTier } from './consumables'
import { newId } from './normalize'
import { pactSlots, spellSlots, usesMax } from './rules'
import { bonusSlotsAt, isSorceryPoints } from './sorcery'
import { featureTags, itemTags, mergeTags, powerTags, spellAutoTags, spellTags } from './tags'
import type { Activation, Character, Feature, Item, ItemPower, PowerCost, SourceType, Spell, Uses } from './types'

export type Zone = 'action' | 'bonus' | 'reaction' | 'other'
export const ZONES: Zone[] = ['action', 'bonus', 'reaction', 'other']

export type CardKind = 'feature' | 'spell' | 'scroll' | 'potion' | 'item' | 'power'
/**
 * Groups the Play screen is split into and filtered by. Attacks are built in the UI, not here.
 * Scrolls and (non-healing) potions share one group, "scroll"; item powers are in the "item" group; see kindGroup.
 */
export type PlayKind = 'attack' | Exclude<CardKind, 'potion' | 'power'>
// scrolls come right after spells, so in every hand they sit directly under them
export const PLAY_KINDS: PlayKind[] = ['attack', 'feature', 'spell', 'scroll', 'item']
/** The group a card is shown in: potions sit with the scrolls, item powers with the items. */
export const kindGroup = (k: CardKind | 'attack'): PlayKind => (k === 'potion' ? 'scroll' : k === 'power' ? 'item' : k)
export type Frame = SourceType | 'spell'

export interface PlayCard {
  key: string
  kind: CardKind
  id: string
  name: string
  frame: Frame
  sourceLabel: string
  zone: Zone
  /** Corner cost: "A", "BA", "R", "F", "*", or for spells the level ("C" for cantrip). */
  cost: string
  spellLevel?: number
  text: string
  uses?: { left: number; max: number }
  /** For consumable items without charges: how many are left. Shown with - / + on the card (scrolls: count + "Use"). */
  quantity?: number
  tapped: boolean
  /** Spell with no way to pay for it right now. */
  unaffordable?: boolean
  concentration?: boolean
  ritual?: boolean
  /** Short line under the type, e.g. "Action · 60 feet" on a scroll. */
  meta?: string
  /** Own + automatic tags (tags.ts), for the tag filter. */
  tags?: string[]
  /** Item power: the item it belongs to, and what one use costs from the item's charges. */
  itemId?: string
  chargeCost?: PowerCost
}

export const activationZone = (a: Activation | undefined): Zone =>
  a === 'action' ? 'action' : a === 'bonus' ? 'bonus' : a === 'reaction' ? 'reaction' : 'other'

export function spellZone(castingTime: string | undefined): Zone {
  const t = (castingTime ?? '').trim().toLowerCase()
  if (t.startsWith('bonus action')) return 'bonus'
  if (t.startsWith('reaction')) return 'reaction'
  if (t.startsWith('action') || t === '') return 'action'
  return 'other'
}

const COST: Record<Activation, string> = { action: 'A', bonus: 'BA', reaction: 'R', free: 'F', special: '*', passive: '' }

/** First sentence(s) of a description, for the card face. */
export function shortText(s: string | undefined, max = 140): string {
  const plain = (s ?? '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const dot = cut.lastIndexOf('. ')
  return (dot > 60 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '')) + (dot > 60 ? '' : '...')
}

function usesView(c: Character, u: Uses | undefined) {
  if (!u) return undefined
  const max = usesMax(c, u.max)
  return { max, left: Math.max(0, max - Math.min(u.used, max)) }
}

export function isPassive(f: Feature) {
  return f.activation === 'passive'
}

// ---------------- attunement filter ----------------
// The Play screen shows only items you can use right now: items that need no attunement,
// and attuned ones. An item that needs attunement but is not attuned lives only on the
// Gear tab, where it can be attuned with one tap. "equipped" does not matter here:
// potions and scrolls are not equipped, yet they belong on the Play screen.

/** Does this item belong on the Play screen? */
export const itemInPlay = (i: Pick<Item, 'requiresAttunement' | 'attuned'>) => !i.requiresAttunement || i.attuned

const norm = (s: string) => s.trim().toLowerCase()

/** A feature that comes from an item (source type "item", source name = item name) follows that item. */
export function featureInPlay(c: Character, f: Feature): boolean {
  if (f.source.type !== 'item' || !f.source.name.trim()) return true
  const item = c.inventory.items.find((i) => norm(i.name) === norm(f.source.name))
  return !item || itemInPlay(item)
}

/** The four healing potions: counters next to Concentration, not cards. Same attunement filter as every item. */
export const playHealingPotions = (c: Character) => c.inventory.items.filter((i) => isHealingPotion(i) && itemInPlay(i))

/** One counter in the Concentration panel. `item` is missing when the character has no potion of that kind. */
export interface HealingRow {
  tier: HealingTier
  item?: Item
  name: string
  quantity: number
}

/**
 * The healing-potion counters: always all four kinds, in order, so a potion found mid-game is one "+" away.
 * A kind without an item is a row at 0 with no item (nothing is created just to show it);
 * a kind with several items (two "Potion of Healing" entries) shows each of them.
 */
export function healingPotionRows(c: Character): HealingRow[] {
  const have = playHealingPotions(c)
  return HEALING_TIERS.flatMap((tier): HealingRow[] => {
    const items = have.filter((i) => healingTier(i) === tier)
    if (items.length === 0) return [{ tier, name: HEALING_NAME[tier], quantity: 0 }]
    return items.map((i) => ({ tier, item: i, name: i.name, quantity: i.quantity }))
  })
}

/**
 * "+" on a kind the character has no item for: a new item in the inventory with the standard name,
 * its dice in the description and quantity 1. If an item of that kind is on the Play screen, one more of it.
 */
export function addHealingPotion(c: Character, tier: HealingTier): Character {
  const existing = playHealingPotions(c).find((i) => healingTier(i) === tier)
  if (existing) return { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i)) } }
  const potion: Item = {
    id: newId(),
    name: HEALING_NAME[tier],
    quantity: 1,
    equipped: false,
    requiresAttunement: false,
    attuned: false,
    description: healingDescription(tier),
  }
  return { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, potion] } }
}

/** Passive features shown on the Play screen ("battlefield"). */
export const playPassives = (c: Character) => c.features.filter((f) => isPassive(f) && featureInPlay(c, f))

export function featureCard(c: Character, f: Feature): PlayCard {
  const uses = usesView(c, f.uses)
  return {
    key: `feature:${f.id}`,
    kind: 'feature',
    id: f.id,
    name: f.name,
    frame: f.source.type,
    sourceLabel: f.source.name || f.source.type,
    zone: activationZone(f.activation),
    cost: COST[f.activation],
    text: shortText(f.description),
    uses,
    tapped: !!uses && uses.max > 0 && uses.left === 0,
    tags: featureTags(f),
  }
}

export function itemCard(c: Character, i: Item): PlayCard {
  const uses = usesView(c, i.charges)
  return {
    key: `item:${i.id}`,
    kind: 'item',
    id: i.id,
    name: i.name,
    frame: 'item',
    sourceLabel: 'Item',
    zone: activationZone(i.activation ?? 'action'),
    cost: COST[i.activation ?? 'action'] || 'A',
    text: shortText(i.description),
    uses,
    quantity: uses ? undefined : i.quantity,
    tapped: uses ? uses.max > 0 && uses.left === 0 : i.quantity <= 0,
    tags: itemTags(i),
  }
}

// ---------------- item powers ----------------
// A magic item with several abilities (Staff of Ages: Temporal Echo, Hourglass Ward, Echo of Ages)
// lists them in `powers`. Each active power is its own card, in the hand of its activation; using it
// spends `cost` charges from the item's pool (and one of its own `uses`, if it has them).
// Passive powers are chips next to the passive features. An item with active powers shows no card
// of its own: the powers are the item on the Play screen.

export const activePowers = (i: Item) => (i.powers ?? []).filter((p) => p.activation !== 'passive')
export const passivePowers = (i: Item) => (i.powers ?? []).filter((p) => p.activation === 'passive')

/** Charges one use takes now: a number, or for "all" every charge left (at least 1). 0 = free. */
export function chargesNeeded(c: Character, i: Item, p: ItemPower): number {
  if (!p.cost || !i.charges) return 0
  if (p.cost === 'all') return Math.max(1, usesView(c, i.charges)!.left)
  return p.cost
}

/** Can this power be used right now (enough charges in the item, own uses left)? */
export function powerAffordable(c: Character, i: Item, p: ItemPower): boolean {
  const own = usesView(c, p.uses)
  if (own && own.max > 0 && own.left <= 0) return false
  const need = chargesNeeded(c, i, p)
  if (need === 0) return true
  return usesView(c, i.charges)!.left >= need
}

export function powerCard(c: Character, i: Item, p: ItemPower): PlayCard {
  // the counter on the card: the power's own uses if it has them, else the item's charges
  const uses = usesView(c, p.uses) ?? (p.cost && i.charges ? usesView(c, i.charges) : undefined)
  return {
    key: `power:${i.id}:${p.id}`,
    kind: 'power',
    id: p.id,
    itemId: i.id,
    name: p.name,
    frame: 'item',
    sourceLabel: i.name,
    zone: activationZone(p.activation),
    cost: COST[p.activation] || '*',
    text: shortText(p.description),
    uses,
    chargeCost: p.cost && i.charges ? p.cost : undefined,
    tapped: !powerAffordable(c, i, p),
    tags: powerTags(i, p),
  }
}

/** The item and power behind a power card id. */
export function findPower(c: Character, powerId: string): { item: Item; power: ItemPower } | undefined {
  for (const item of c.inventory.items) {
    const power = item.powers?.find((p) => p.id === powerId)
    if (power) return { item, power }
  }
  return undefined
}

/** Passive powers of the items usable in Play (attunement filter), for the "Always on" row. */
export function playPassivePowers(c: Character): { item: Item; power: ItemPower }[] {
  return c.inventory.items.filter(itemInPlay).flatMap((item) => passivePowers(item).map((power) => ({ item, power })))
}

/**
 * Uses a power: spends its cost from the item's charges and one of its own uses.
 * Nothing happens when it cannot be paid. delta -1 (undo) gives back one own use and the cost
 * (for "all": one charge, since how many were spent is not remembered).
 */
export function spendPower(c: Character, powerId: string, delta = 1): Character {
  const hit = findPower(c, powerId)
  if (!hit) return c
  const { item, power } = hit
  if (delta > 0 && !powerAffordable(c, item, power)) return c
  const clamp = (u: Uses, d: number): Uses => ({ ...u, used: Math.min(usesMax(c, u.max), Math.max(0, u.used + d)) })
  const pay = delta > 0 ? chargesNeeded(c, item, power) : power.cost === 'all' ? 1 : (power.cost ?? 0)
  const next: Item = {
    ...item,
    charges: item.charges && pay > 0 ? clamp(item.charges, delta > 0 ? pay : -pay) : item.charges,
    powers: item.powers!.map((p) => (p.id === power.id && p.uses ? { ...p, uses: clamp(p.uses, delta > 0 ? 1 : -1) } : p)),
  }
  return { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((x) => (x.id === item.id ? next : x)) } }
}

/** A spell scroll: looks like the spell it holds, counts like an item. */
export function scrollCard(c: Character, i: Item, srd?: readonly SrdSpell[]): PlayCard {
  const s = scrollInfo(c, i, srd)
  return {
    key: `scroll:${i.id}`,
    kind: 'scroll',
    id: i.id,
    name: i.name,
    frame: 'spell',
    sourceLabel: ['Scroll', s.school].filter(Boolean).join(' · '),
    // casting from a scroll takes the spell's casting time
    zone: s.castingTime ? spellZone(s.castingTime) : activationZone(i.activation ?? 'action'),
    cost: s.level === undefined ? COST[i.activation ?? 'action'] || 'A' : s.level === 0 ? 'C' : String(s.level),
    spellLevel: s.level,
    text: shortText(s.description),
    quantity: i.quantity,
    tapped: i.quantity <= 0,
    concentration: s.concentration,
    ritual: s.ritual,
    meta: [s.castingTime, s.range].filter(Boolean).join(' · ') || undefined,
    tags: mergeTags(spellAutoTags(s), i.tags),
  }
}

/** Any potion that is not a healing potion (Climbing, Water Breathing...): a card next to the scrolls, with "Use". */
export function potionCard(i: Item): PlayCard {
  return {
    key: `potion:${i.id}`,
    kind: 'potion',
    id: i.id,
    name: i.name,
    frame: 'item',
    sourceLabel: 'Potion',
    zone: activationZone(i.activation ?? 'action'),
    cost: COST[i.activation ?? 'action'] || 'A',
    text: shortText(i.description),
    quantity: i.quantity,
    tapped: i.quantity <= 0,
    tags: itemTags(i),
  }
}

export function spellCard(c: Character, s: Spell): PlayCard {
  const free = usesView(c, s.freeCasts)
  const opts = paymentOptions(c, s)
  return {
    key: `spell:${s.id}`,
    kind: 'spell',
    id: s.id,
    name: s.name,
    frame: 'spell',
    sourceLabel: s.source ? cap(s.source) : 'Spell',
    zone: spellZone(s.castingTime),
    cost: s.level === 0 ? 'C' : String(s.level),
    spellLevel: s.level,
    text: shortText(s.description),
    uses: free,
    tapped: false,
    unaffordable: s.level > 0 && opts.length === 0,
    concentration: s.concentration,
    ritual: s.ritual,
    tags: spellTags(s),
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Spells that are on the table: cantrips, prepared, always prepared. */
export const castableSpells = (c: Character) => c.spells.filter((s) => s.level === 0 || s.prepared || s.alwaysPrepared)

/**
 * All cards of the Play screen. Healing potions are not cards (they are counters next to Concentration,
 * see playHealingPotions); scrolls and other potions are cards in their own group.
 * `srd` (loaded lazily) fills in scroll spells the character lacks.
 */
export function playCards(c: Character, srd?: readonly SrdSpell[]): PlayCard[] {
  const cards: PlayCard[] = []
  // Sorcery Points live next to the spell slots, not in a hand.
  for (const f of c.features) if (!isPassive(f) && !isSorceryPoints(f.uses) && featureInPlay(c, f)) cards.push(featureCard(c, f))
  for (const s of castableSpells(c)) cards.push(spellCard(c, s))
  for (const i of c.inventory.items) {
    if (!itemInPlay(i) || isHealingPotion(i)) continue
    if (isScroll(i)) cards.push(scrollCard(c, i, srd))
    else if (isPotion(i)) cards.push(potionCard(i))
    else if (activePowers(i).length > 0) for (const p of activePowers(i)) cards.push(powerCard(c, i, p))
    else if (i.charges || i.activation) cards.push(itemCard(c, i))
  }
  return cards
}

// ---------------- mana (spell slots) ----------------

export interface ManaRow {
  kind: 'slot' | 'pact'
  level: number
  /** Total available, including slots created with Flexible Casting. */
  max: number
  used: number
  /** How many of max are created slots (they vanish on a Long Rest). */
  bonus: number
}

export function manaRows(c: Character): ManaRow[] {
  const rows: ManaRow[] = []
  spellSlots(c).forEach((base, i) => {
    const bonus = bonusSlotsAt(c, i + 1)
    const max = base + bonus
    if (max > 0) rows.push({ kind: 'slot', level: i + 1, max, used: Math.min(max, c.spellcasting.slotsUsed[i] ?? 0), bonus })
  })
  const p = pactSlots(c)
  if (p.slots > 0) rows.push({ kind: 'pact', level: p.level, max: p.slots, used: Math.min(p.slots, c.spellcasting.pactSlotsUsed), bonus: 0 })
  return rows
}

export type Payment = { kind: 'slot'; level: number } | { kind: 'pact'; level: number } | { kind: 'free' } | { kind: 'ritual' } | { kind: 'none' }

/** Ways to pay for a spell right now. Cantrips are free ("none"). */
export function paymentOptions(c: Character, s: Spell): Payment[] {
  if (s.level === 0) return [{ kind: 'none' }]
  const out: Payment[] = []
  const free = usesView(c, s.freeCasts)
  if (free && free.left > 0) out.push({ kind: 'free' })
  for (const row of manaRows(c)) {
    if (row.level >= s.level && row.used < row.max) out.push({ kind: row.kind, level: row.level })
  }
  if (s.ritual) out.push({ kind: 'ritual' })
  return out
}

export function spendSlot(c: Character, kind: 'slot' | 'pact', level: number, delta = 1): Character {
  if (kind === 'pact') {
    const max = pactSlots(c).slots
    const used = Math.min(max, Math.max(0, c.spellcasting.pactSlotsUsed + delta))
    return { ...c, spellcasting: { ...c.spellcasting, pactSlotsUsed: used } }
  }
  const max = (spellSlots(c)[level - 1] ?? 0) + bonusSlotsAt(c, level)
  const slotsUsed = [...c.spellcasting.slotsUsed]
  slotsUsed[level - 1] = Math.min(max, Math.max(0, (slotsUsed[level - 1] ?? 0) + delta))
  return { ...c, spellcasting: { ...c.spellcasting, slotsUsed } }
}

export interface CastResult {
  character: Character
  /** The concentration spell that was dropped, if any. */
  droppedConcentration?: string
}

/** Casts a spell: pays for it and, for concentration spells, puts it in play. */
export function castSpell(c: Character, spellId: string, pay: Payment): CastResult {
  const s = c.spells.find((x) => x.id === spellId)
  if (!s) return { character: c }
  let next = c
  if (pay.kind === 'slot' || pay.kind === 'pact') next = spendSlot(next, pay.kind, pay.level, 1)
  if (pay.kind === 'free' && s.freeCasts) {
    next = { ...next, spells: next.spells.map((x) => (x.id === s.id && x.freeCasts ? { ...x, freeCasts: { ...x.freeCasts, used: x.freeCasts.used + 1 } } : x)) }
  }
  let dropped: string | undefined
  if (s.concentration) {
    if (next.spellcasting.concentration && next.spellcasting.concentration !== s.name) dropped = next.spellcasting.concentration
    next = { ...next, spellcasting: { ...next.spellcasting, concentration: s.name } }
  }
  return { character: { ...next, updatedAt: new Date().toISOString() }, droppedConcentration: dropped }
}

/** Use one charge/use of a feature or item (tap). delta -1 = undo. */
export function useCard(c: Character, card: Pick<PlayCard, 'kind' | 'id'>, delta = 1): Character {
  const bump = (u: Uses): Uses => {
    const max = usesMax(c, u.max)
    return { ...u, used: Math.min(max, Math.max(0, u.used + delta)) }
  }
  if (card.kind === 'feature') {
    return { ...c, features: c.features.map((f) => (f.id === card.id && f.uses ? { ...f, uses: bump(f.uses) } : f)) }
  }
  if (card.kind === 'power') return spendPower(c, card.id, delta)
  if (card.kind === 'spell') {
    return { ...c, spells: c.spells.map((s) => (s.id === card.id && s.freeCasts ? { ...s, freeCasts: bump(s.freeCasts) } : s)) }
  }
  return {
    ...c,
    inventory: {
      ...c.inventory,
      items: c.inventory.items.map((i) => {
        if (i.id !== card.id) return i
        if (i.charges) return { ...i, charges: bump(i.charges) }
        return { ...i, quantity: Math.max(0, i.quantity - delta) }
      }),
    },
  }
}
