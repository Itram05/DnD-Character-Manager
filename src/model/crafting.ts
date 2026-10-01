// Crafting (inventory rework, stage 5): the player's recipes, "Craft ×N", and items pinned as counters in Play.
//
// The model in one paragraph: a recipe names its inputs and its output by item NAME (case and spaces
// ignored), never by item id. "Moonpetal ×2" counts every stack called Moonpetal, in every container, and a
// recipe can be written before you own any. Crafting takes the inputs out of those stacks and puts the output
// into one container, all in ONE change (so one Undo takes the whole craft back). Counters in Play are the
// same: a name, the total of its stacks, − takes one out, + puts one in.
//
// Bags (items that are a container) never count as a material and are never taken: taking one would empty
// a container's link. Renaming an item renames it in the recipes and counters too (renameAcross), as long as
// no other stack keeps the old name.
import { containerForItem, defaultContainerId, deleteItem, findContainer } from './containers'
import { newId } from './id'
import type { Character, Item, ItemTemplate, PlayCounter, Recipe, RecipePart } from './types'

/** The form a name is compared in: trimmed, single spaces, lowercase. */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** Quantities may have fractions (0.5 lb of silver): sums are rounded to 1/1000, like weights. */
const round = (n: number) => Math.round(n * 1000) / 1000

/** The stacks a name counts: every item of that name that is not a bag, in inventory order. */
export function stacksOf(c: Pick<Character, 'inventory'>, name: string): Item[] {
  const k = nameKey(name)
  if (!k) return []
  return c.inventory.items.filter((i) => nameKey(i.name) === k && !containerForItem(c, i.id))
}

/** How many of a thing you have: all its stacks together. */
export const countOf = (c: Pick<Character, 'inventory'>, name: string) => round(stacksOf(c, name).reduce((s, i) => s + Math.max(0, i.quantity), 0))

/** A recipe's inputs for `times` crafts, one entry per name (a recipe listing "Herb" twice needs both). */
export function recipeNeeds(r: Pick<Recipe, 'inputs'>, times = 1): RecipePart[] {
  const out: RecipePart[] = []
  for (const p of r.inputs) {
    if (!nameKey(p.name) || !(p.quantity > 0)) continue
    const same = out.find((x) => nameKey(x.name) === nameKey(p.name))
    if (same) same.quantity = round(same.quantity + p.quantity * times)
    else out.push({ name: p.name.trim(), quantity: round(p.quantity * times) })
  }
  return out
}

export interface PartStatus {
  name: string
  /** For the asked number of crafts. */
  need: number
  have: number
  /** How many are missing (0 = enough). */
  short: number
}

export interface CraftStatus {
  /** How many times the recipe can be made now. Infinity for a recipe without inputs. */
  max: number
  /** Every input, for `times` crafts. */
  parts: PartStatus[]
  /** The inputs that are short for `times` crafts. Empty = it can be made. */
  missing: PartStatus[]
}

/** What `times` crafts need, what you have, and how many times you could make it at all. */
export function craftStatus(c: Pick<Character, 'inventory'>, r: Pick<Recipe, 'inputs'>, times = 1): CraftStatus {
  const one = recipeNeeds(r, 1)
  const max = one.length ? Math.min(...one.map((p) => Math.floor(countOf(c, p.name) / p.quantity + 1e-9))) : Infinity
  const parts = recipeNeeds(r, times).map((p) => {
    const have = countOf(c, p.name)
    return { name: p.name, need: p.quantity, have, short: round(Math.max(0, p.quantity - have)) }
  })
  return { max, parts, missing: parts.filter((p) => p.short > 0) }
}

const withItems = (c: Character, items: Item[]): Character => ({ ...c, inventory: { ...c.inventory, items } })

/**
 * Takes `n` of a thing out of its stacks: unequipped stacks first, then in inventory order. A stack emptied
 * here is removed when another stack of the same name still has some (its attacks move to that one); when
 * none has any left, one stack stays at 0, so the item (weight, description, category) is not forgotten.
 * Takes what there is when there is not enough: callers check first (craftStatus).
 */
export function takeOut(c: Character, name: string, n: number): Character {
  const stacks = stacksOf(c, name)
  const order = [...stacks.filter((i) => !i.equipped), ...stacks.filter((i) => i.equipped)]
  let left = round(n)
  const qty = new Map<string, number>()
  const emptied: string[] = []
  for (const s of order) {
    if (left <= 0) break
    if (s.quantity <= 0) continue
    const take = Math.min(left, s.quantity)
    left = round(left - take)
    const q = round(s.quantity - take)
    qty.set(s.id, q)
    if (q <= 0) emptied.push(s.id)
  }
  let out = withItems(c, c.inventory.items.map((i) => (qty.has(i.id) ? { ...i, quantity: qty.get(i.id)! } : i)))
  const remaining = stacksOf(out, name).filter((i) => i.quantity > 0)
  // when nothing is left, the first stack (in inventory order) stays at 0
  const keep = remaining.length ? undefined : stacksOf(out, name)[0]?.id
  for (const id of emptied) {
    if (id === keep) continue
    if (remaining[0]) out = { ...out, attacks: out.attacks.map((a) => (a.itemId === id ? { ...a, itemId: remaining[0].id } : a)) }
    out = deleteItem(out, id)
  }
  return out
}

/** A new item from a template: a deep copy, its powers with new ids. */
function fromTemplate(name: string, n: number, containerId: string, template: ItemTemplate | undefined): Item {
  const tpl = structuredClone(template ?? {})
  const item: Item = { requiresAttunement: false, description: '', ...tpl, id: newId(), name, quantity: n, equipped: false, attuned: false, containerId }
  if (item.powers) item.powers = item.powers.map((p) => ({ ...p, id: newId() }))
  return item
}

/**
 * Puts `n` of a thing into a container:
 * 1. onto a stack of that name already in the container (not a bag, not attuned: attunement is one item);
 * 2. else a new item from the template, if one is given;
 * 3. else a copy of a stack of that name elsewhere (its description, weight, category), not equipped or attuned;
 * 4. else a plain new item with that name.
 */
export function putIn(c: Character, name: string, n: number, containerId: string, template?: ItemTemplate): { character: Character; itemId: string } {
  const to = findContainer(c, containerId) ? containerId : defaultContainerId(c)
  const stacks = stacksOf(c, name)
  const here = stacks.find((i) => (i.containerId ?? defaultContainerId(c)) === to && !i.attuned)
  if (here) return { character: withItems(c, c.inventory.items.map((i) => (i.id === here.id ? { ...i, quantity: round(i.quantity + n) } : i))), itemId: here.id }
  let item: Item
  if (template) item = fromTemplate(name.trim(), n, to, template)
  else {
    const like = stacks.find((i) => !i.attuned) ?? stacks[0]
    if (like) {
      const { id: _id, name: _n, quantity: _q, containerId: _k, equipped: _e, attuned: _a, ...rest } = like
      void [_id, _n, _q, _k, _e, _a]
      item = fromTemplate(like.name, n, to, rest)
    } else item = fromTemplate(name.trim(), n, to, undefined)
  }
  return { character: withItems(c, [...c.inventory.items, item]), itemId: item.id }
}

// ----- crafting -----

export type CraftResult =
  | { ok: true; character: Character; made: { name: string; quantity: number; itemId: string; containerId: string }; used: RecipePart[] }
  | { ok: false; character: Character; reason: 'not-found' | 'bad-amount' | 'missing'; missing?: PartStatus[] }

/**
 * Makes a recipe `times` times in ONE change: the inputs come out (takeOut), the output goes into the
 * container (putIn), and the recipe remembers the container. Refused, with nothing changed, when an input
 * is short (the list says which and how many), the amount is not a whole number from 1, or the recipe is gone.
 */
export function craft(c: Character, recipeId: string, times: number, containerId?: string): CraftResult {
  const r = c.recipes.find((x) => x.id === recipeId)
  if (!r) return { ok: false, character: c, reason: 'not-found' }
  if (!Number.isInteger(times) || times < 1) return { ok: false, character: c, reason: 'bad-amount' }
  const status = craftStatus(c, r, times)
  if (status.missing.length) return { ok: false, character: c, reason: 'missing', missing: status.missing }
  const to = containerId && findContainer(c, containerId) ? containerId : r.containerId && findContainer(c, r.containerId) ? r.containerId : outputHome(c, r)
  let x = c
  const used = recipeNeeds(r, times)
  for (const p of used) x = takeOut(x, p.name, p.quantity)
  const n = round(r.output.quantity * times)
  const put = putIn(x, r.output.name, n, to, r.output.template)
  x = put.character
  if (r.containerId !== to) x = { ...x, recipes: x.recipes.map((y) => (y.id === r.id ? { ...y, containerId: to } : y)) }
  return { ok: true, character: x, made: { name: r.output.name, quantity: n, itemId: put.itemId, containerId: to }, used }
}

/** Where the output goes when the recipe has no container yet: where a stack of it already is, else the first container. */
export function outputHome(c: Character, r: Pick<Recipe, 'output'>): string {
  const s = stacksOf(c, r.output.name).find((i) => !i.attuned)
  return s?.containerId && findContainer(c, s.containerId) ? s.containerId : defaultContainerId(c)
}

// ----- recipes -----

/** A recipe as the editor saves it: trimmed text, inputs without a name or amount dropped, empty optional fields left out. Unknown fields stay. */
export function cleanRecipe(r: Recipe): Recipe {
  const name = r.name.trim() || r.output.name.trim() || 'Recipe'
  const out: Recipe = {
    ...r,
    name,
    inputs: r.inputs.filter((p) => nameKey(p.name) && p.quantity > 0).map((p) => ({ ...p, name: p.name.trim(), quantity: round(p.quantity) })),
    output: { ...r.output, name: r.output.name.trim() || name, quantity: r.output.quantity > 0 ? round(r.output.quantity) : 1 },
  }
  for (const f of ['time', 'tool', 'dc', 'note'] as const) {
    const v = out[f]?.trim()
    if (v) out[f] = v
    else delete out[f]
  }
  // a field cleared in the editor is undefined: left out, and a template with nothing left goes
  if (out.output.template) {
    const tpl = Object.fromEntries(Object.entries(out.output.template).filter(([, v]) => v !== undefined))
    if (Object.keys(tpl).length) out.output = { ...out.output, template: tpl }
    else {
      const { template: _drop, ...rest } = out.output
      void _drop
      out.output = rest
    }
  }
  return out
}

/** Adds the recipe, or replaces the one with its id. */
export function saveRecipe(c: Character, r: Recipe): Character {
  const clean = cleanRecipe(r)
  const has = c.recipes.some((x) => x.id === r.id)
  return { ...c, recipes: has ? c.recipes.map((x) => (x.id === r.id ? clean : x)) : [...c.recipes, clean] }
}

/** Deletes a recipe. Nothing else changes: its materials stay in the inventory. */
export const deleteRecipe = (c: Character, id: string): Character => ({ ...c, recipes: c.recipes.filter((x) => x.id !== id) })

export const blankRecipe = (): Recipe => ({ id: newId(), name: '', inputs: [{ name: '', quantity: 1 }], output: { name: '', quantity: 1 } })

/**
 * Examples the player can add and change (the recipe list's "From an example"). Not rules: the materials
 * are made up, the tools are the 2024 Player's Handbook ones. Nothing is added unless the player picks it.
 */
export const RECIPE_EXAMPLES: Record<string, Omit<Recipe, 'id'>> = {
  'potion-of-healing': {
    name: 'Potion of Healing',
    inputs: [
      { name: 'Healing herb', quantity: 2 },
      { name: 'Empty vial', quantity: 1 },
    ],
    output: { name: 'Potion of Healing', quantity: 1, template: { category: 'potion', weight: 0.5, description: 'You regain 2d4 + 2 Hit Points when you drink this potion.' } },
    tool: "Herbalism Kit",
    note: 'An example: change the materials and amounts to what your table uses.',
  },
  antitoxin: {
    name: 'Antitoxin',
    inputs: [
      { name: 'Healing herb', quantity: 1 },
      { name: 'Empty vial', quantity: 1 },
    ],
    output: { name: 'Antitoxin', quantity: 1, template: { category: 'potion', description: 'Advantage on saving throws to avoid or end the Poisoned condition for 1 hour.' } },
    tool: 'Herbalism Kit',
    note: 'An example: change the materials and amounts to what your table uses.',
  },
  arrows: {
    name: 'Arrows',
    inputs: [
      { name: 'Wood', quantity: 1 },
      { name: 'Feathers', quantity: 1 },
    ],
    output: { name: 'Arrows', quantity: 20, template: { category: 'weapon', weight: 0.05 } },
    tool: "Woodcarver's Tools",
    note: 'An example: change the materials and amounts to what your table uses.',
  },
}

/** A new recipe from an example, with its own id. */
export const recipeFromExample = (key: string): Recipe => ({ ...structuredClone(RECIPE_EXAMPLES[key]), id: newId() })

// ----- counters in Play -----

export const isPinned = (c: Pick<Character, 'playCounters'>, name: string) => c.playCounters.some((p) => nameKey(p.name) === nameKey(name))

/** Pins a thing as a counter in Play (at the end), or unpins it. */
export function togglePin(c: Character, name: string): Character {
  if (!nameKey(name)) return c
  if (isPinned(c, name)) return { ...c, playCounters: c.playCounters.filter((p) => nameKey(p.name) !== nameKey(name)) }
  return { ...c, playCounters: [...c.playCounters, { name: name.trim() }] }
}

/** Moves a counter one place up (-1) or down (+1). */
export function movePin(c: Character, name: string, dir: -1 | 1): Character {
  const list = [...c.playCounters]
  const at = list.findIndex((p) => nameKey(p.name) === nameKey(name))
  const to = at + dir
  if (at < 0 || to < 0 || to >= list.length) return c
  ;[list[at], list[to]] = [list[to], list[at]]
  return { ...c, playCounters: list }
}

export interface CounterView {
  counter: PlayCounter
  /** The name as the first stack spells it (the pin may be older). */
  label: string
  count: number
}

export const counterViews = (c: Character): CounterView[] =>
  c.playCounters.map((counter) => ({ counter, label: stacksOf(c, counter.name)[0]?.name ?? counter.name, count: countOf(c, counter.name) }))

/** − (take one out, see takeOut) or + (one more on the first stack; a new item if there is none). Nothing below 0. */
export function bumpCounter(c: Character, name: string, delta: 1 | -1): Character {
  if (delta < 0) return countOf(c, name) >= 1 ? takeOut(c, name, 1) : c
  const first = stacksOf(c, name).find((i) => !i.attuned)
  return putIn(c, name, 1, first?.containerId ?? defaultContainerId(c)).character
}

// ----- renaming -----

/**
 * After an item was renamed from `oldName` to `newName`: if no stack keeps the old name, recipes (inputs and
 * outputs) and counters that used it follow the new one. Renaming one of two stacks changes nothing here:
 * the other stack still answers to the old name.
 */
export function renameAcross(c: Character, oldName: string, newName: string): Character {
  const from = nameKey(oldName)
  if (!from || !nameKey(newName) || from === nameKey(newName) || stacksOf(c, oldName).length) return c
  const ren = <T extends { name: string }>(p: T): T => (nameKey(p.name) === from ? { ...p, name: newName.trim() } : p)
  const touched = c.recipes.some((r) => r.inputs.some((p) => nameKey(p.name) === from) || nameKey(r.output.name) === from) || c.playCounters.some((p) => nameKey(p.name) === from)
  if (!touched) return c
  return {
    ...c,
    recipes: c.recipes.map((r) => ({ ...r, inputs: r.inputs.map(ren), output: ren(r.output) })),
    // renamed to a name that was pinned too: one counter
    playCounters: c.playCounters.map(ren).filter((p, i, all) => all.findIndex((q) => nameKey(q.name) === nameKey(p.name)) === i),
  }
}

/** The recipes that use a name (as an input or as the output), for the item editor's note. */
export const recipesUsing = (c: Pick<Character, 'recipes'>, name: string) =>
  c.recipes.filter((r) => r.inputs.some((p) => nameKey(p.name) === nameKey(name)) || nameKey(r.output.name) === nameKey(name))
