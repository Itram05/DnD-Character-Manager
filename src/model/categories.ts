// Item categories: eight built-in ones, plus the player's own (inventory.categories).
// A player category with the id of a built-in one renames it (or changes its icon or colour).
// An item names its category (Item.category); an item without one gets a guess at display time,
// from what the app already knows about it. The guess is never written into the file.
import { isPotion, isScroll } from './consumables'
import type { Character, Item, ItemCategory } from './types'

export const BUILTIN_CATEGORIES: readonly ItemCategory[] = [
  { id: 'weapon', name: 'Weapons', icon: '⚔', color: '#d0583f' },
  { id: 'armor', name: 'Armor', icon: '⛉', color: '#b3aea3' },
  { id: 'magic', name: 'Magic items', icon: '◈', color: '#e0b85c' },
  { id: 'scroll', name: 'Scrolls', icon: '✉', color: '#3fbcc0' },
  { id: 'potion', name: 'Potions', icon: '⚗', color: '#71c283' },
  { id: 'material', name: 'Materials', icon: '✿', color: '#a274e0' },
  { id: 'valuable', name: 'Valuables', icon: '◇', color: '#4f93db' },
  { id: 'gear', name: 'Gear', icon: '▣', color: '#8d879a' },
]

export const isBuiltinCategory = (id: string) => BUILTIN_CATEGORIES.some((b) => b.id === id)

type WithCategories = { inventory: Pick<Character['inventory'], 'categories'> }

/** Every category, built-in first (with the player's renames applied), then the player's own, in their order. */
export function categoryList(c: WithCategories): ItemCategory[] {
  const own = c.inventory.categories
  const builtins = BUILTIN_CATEGORIES.map((b) => {
    const o = own.find((x) => x.id === b.id)
    return o ? { ...b, ...o, name: o.name.trim() || b.name } : b
  })
  return [...builtins, ...own.filter((x) => !isBuiltinCategory(x.id))]
}

export const findCategory = (c: WithCategories, id: string | undefined) => (id ? categoryList(c).find((x) => x.id === id) : undefined)

/**
 * The category the app guesses for an item without one. Order matters: a scroll with an attack is still a scroll.
 * Weapon = an attack is made with it; armor = body armor or an AC bonus (shield); magic = attunement,
 * powers, charges or a bonus to spells; material = tagged "material".
 */
export function guessCategory(c: Pick<Character, 'attacks'>, i: Item): string {
  if (isScroll(i)) return 'scroll'
  if (isPotion(i)) return 'potion'
  if (i.armor || i.acBonus) return 'armor'
  if (c.attacks.some((a) => a.itemId === i.id)) return 'weapon'
  if (i.requiresAttunement || i.powers?.length || i.charges || i.spellDcBonus || i.spellAttackBonus || i.saveBonus) return 'magic'
  if (i.tags?.includes('material')) return 'material'
  return 'gear'
}

/** The item's category: its own if it still exists, otherwise the guess. */
export function itemCategory(c: WithCategories & Pick<Character, 'attacks'>, i: Item): ItemCategory {
  return findCategory(c, i.category) ?? findCategory(c, guessCategory(c, i))!
}

// ----- changes -----

const catId = () => `cat-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`

/** A new category of the player's. Returns its id. */
export function addCategory(c: Character, input: { name: string; icon?: string; color?: string }): { character: Character; id: string } {
  const cat: ItemCategory = { id: catId(), name: input.name.trim() || 'Category' }
  if (input.icon?.trim()) cat.icon = input.icon.trim()
  if (input.color?.trim()) cat.color = input.color.trim()
  return { character: { ...c, inventory: { ...c.inventory, categories: [...c.inventory.categories, cat] } }, id: cat.id }
}

/** Renames or recolours a category. For a built-in one this stores an override with the same id. */
export function updateCategory(c: Character, id: string, patch: Partial<Omit<ItemCategory, 'id'>>): Character {
  const cur = findCategory(c, id)
  if (!cur) return c
  const next: ItemCategory = { ...cur, ...patch, id }
  const has = c.inventory.categories.some((x) => x.id === id)
  const categories = has ? c.inventory.categories.map((x) => (x.id === id ? next : x)) : [...c.inventory.categories, next]
  return { ...c, inventory: { ...c.inventory, categories } }
}

/**
 * Deletes one of the player's categories: its items lose the category and fall back to the guess (nothing
 * else changes). On a built-in id it only removes the rename; built-in categories themselves always exist.
 */
export function deleteCategory(c: Character, id: string): Character {
  if (!c.inventory.categories.some((x) => x.id === id)) return c
  const builtin = isBuiltinCategory(id)
  const items = builtin ? c.inventory.items : c.inventory.items.map((i) => (i.category === id ? withoutCategory(i) : i))
  return { ...c, inventory: { ...c.inventory, items, categories: c.inventory.categories.filter((x) => x.id !== id) } }
}

function withoutCategory(i: Item): Item {
  const { category: _drop, ...rest } = i
  void _drop
  return rest
}
