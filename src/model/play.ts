// Play-screen logic, independent of React: which cards exist, which zone ("hand") they
// belong to, whether they are tapped, and how a spell is paid for.
//
// Metaphor: every active feature, prepared spell and usable item is a card.
// Spent = "tapped" (turned sideways). Rests "untap" the cards they restore.
// Spell slots are "mana". Passive features lie on the "battlefield".
import { pactSlots, spellSlots, usesMax } from './rules'
import type { Activation, Character, Feature, Item, SourceType, Spell, Uses } from './types'

export type Zone = 'action' | 'bonus' | 'reaction' | 'other'
export const ZONES: Zone[] = ['action', 'bonus', 'reaction', 'other']

export type CardKind = 'feature' | 'spell' | 'item'
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
  /** For consumable items without charges: how many are left. */
  quantity?: number
  tapped: boolean
  /** Spell with no way to pay for it right now. */
  unaffordable?: boolean
  concentration?: boolean
  ritual?: boolean
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
    sourceLabel: uses ? 'Item' : `Item x${i.quantity}`,
    zone: activationZone(i.activation ?? 'action'),
    cost: COST[i.activation ?? 'action'] || 'A',
    text: shortText(i.description),
    uses,
    quantity: uses ? undefined : i.quantity,
    tapped: uses ? uses.max > 0 && uses.left === 0 : i.quantity <= 0,
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
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Spells that are on the table: cantrips, prepared, always prepared. */
export const castableSpells = (c: Character) => c.spells.filter((s) => s.level === 0 || s.prepared || s.alwaysPrepared)

export function playCards(c: Character): PlayCard[] {
  const cards: PlayCard[] = []
  for (const f of c.features) if (!isPassive(f)) cards.push(featureCard(c, f))
  for (const s of castableSpells(c)) cards.push(spellCard(c, s))
  for (const i of c.inventory.items) if (i.charges || i.activation) cards.push(itemCard(c, i))
  return cards
}

// ---------------- mana (spell slots) ----------------

export interface ManaRow {
  kind: 'slot' | 'pact'
  level: number
  max: number
  used: number
}

export function manaRows(c: Character): ManaRow[] {
  const rows: ManaRow[] = []
  spellSlots(c).forEach((max, i) => {
    if (max > 0) rows.push({ kind: 'slot', level: i + 1, max, used: Math.min(max, c.spellcasting.slotsUsed[i] ?? 0) })
  })
  const p = pactSlots(c)
  if (p.slots > 0) rows.push({ kind: 'pact', level: p.level, max: p.slots, used: Math.min(p.slots, c.spellcasting.pactSlotsUsed) })
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
  const max = spellSlots(c)[level - 1] ?? 0
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
