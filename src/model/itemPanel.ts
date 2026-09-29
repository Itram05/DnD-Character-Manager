// The "Items" section of the Play screen: one tile per magic item in play, and the panel a tile opens
// with everything that item does. A second view of cards that are already in the hands (by action type),
// not a replacement: the same card, spent here, is spent there too (spendPower / useCard).
//
// Which items get a tile: the ones in Play by the attunement filter (itemInPlay: needs no attunement, or
// attuned; "equipped" does not matter, as for every item card), that do something at the table: powers,
// charges, an activation, a linked attack or a feature that comes from it. Scrolls and potions are left out:
// they have their own group (and the healing potions their counters), and six scroll tiles would bury the rest.
import { isPotion, isScroll } from './consumables'
import { activePowers, featureCard, isPassive, itemBonusPowers, itemCard, itemInPlay, passivePowers, powerCard, type PlayCard } from './play'
import { usesMax } from './rules'
import { isSorceryPoints } from './sorcery'
import type { Attack, Character, Feature, Item } from './types'

const norm = (s: string) => s.trim().toLowerCase()

/** The attacks made with this item (Attack.itemId). */
export const itemAttacks = (c: Character, item: Item): Attack[] => c.attacks.filter((a) => a.itemId === item.id)

/** Features whose source is this item (source type "item", source name = the item's name), as featureInPlay reads them. */
export const itemFeatures = (c: Character, item: Item): Feature[] =>
  c.features.filter((f) => f.source.type === 'item' && !!f.source.name.trim() && norm(f.source.name) === norm(item.name))

export interface ItemTile {
  item: Item
  /** The item's charges, for the dots on the tile. */
  charges?: { left: number; max: number }
}

function charges(c: Character, i: Item) {
  if (!i.charges) return undefined
  const max = usesMax(c, i.charges.max)
  return { max, left: Math.max(0, max - Math.min(i.charges.used, max)) }
}

/** The tiles, in inventory order. */
export function itemTiles(c: Character): ItemTile[] {
  return c.inventory.items
    .filter((i) => itemInPlay(i) && !isScroll(i) && !isPotion(i))
    .filter((i) => (i.powers?.length ?? 0) > 0 || !!i.charges || !!i.activation || itemAttacks(c, i).length > 0 || itemFeatures(c, i).length > 0)
    .map((item) => ({ item, charges: charges(c, item) }))
}

/** A passive thing of the item for the chip row of its panel: a passive power, a bonus field, a passive feature. */
export interface ItemChip {
  key: string
  name: string
  description: string
  /** "item" for the item's own powers and bonuses; the feature's source type for a feature. */
  frame: string
}

export interface ItemPanelView {
  item: Item
  charges?: { left: number; max: number }
  /** Active powers; or the item itself when it has no active powers but charges or an activation (Pearl of Power); active features. */
  cards: PlayCard[]
  /** Attacks made with the item; the UI turns them into attack cards like the Attack group does. */
  attacks: Attack[]
  chips: ItemChip[]
}

/** Everything one item does in Play. Staff of Ages: 3 powers + its attack = 4 cards, the +3 spell attack as a chip. */
export function itemPanel(c: Character, item: Item): ItemPanelView {
  const active = activePowers(item)
  const features = itemFeatures(c, item)
  const cards: PlayCard[] = [
    ...(active.length > 0 ? active.map((p) => powerCard(c, item, p)) : item.charges || item.activation ? [itemCard(c, item)] : []),
    ...features.filter((f) => !isPassive(f) && !isSorceryPoints(f.uses)).map((f) => featureCard(c, f)),
  ]
  const chips: ItemChip[] = [
    ...[...itemBonusPowers(item), ...passivePowers(item)].map((p) => ({ key: p.id, name: p.name, description: p.description, frame: 'item' })),
    ...features.filter(isPassive).map((f) => ({ key: f.id, name: f.name, description: f.description, frame: f.source.type })),
  ]
  return { item, charges: charges(c, item), cards, attacks: itemAttacks(c, item), chips }
}
