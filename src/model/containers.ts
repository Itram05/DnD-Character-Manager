// Containers (inventory rework, stage 2): where items are kept, how much they weigh, and the changes
// the Gear tab makes (move, split, merge, delete).
//
// The model in one paragraph: `inventory.items` stays ONE flat list; every item names its container
// (Item.containerId). Containers are made by the player. A container can be an item (Container.itemId:
// the Bag of Holding item), and then it is wherever that item is; that is the only way containers nest.
// Wearing is separate: `equipped` means "on you", whatever the container says (the container is where the
// item goes when taken off). Changing that later (a real "worn" container) touches carried() and
// parentOf() here and one migration step; nothing else reads `equipped` for weight.
//
// Nothing here loses an item: deleting a container moves its items out first, deleting the last container
// is refused, and a move that would put a bag inside itself is refused.
import { newId } from './id'
import type { Character, Container, Item } from './types'

export const DEFAULT_CONTAINER: Container = { id: 'backpack', name: 'Backpack', icon: '🎒' }

/** Weights are lb with fractions (0.5, 0.075): sums are rounded to 1/1000 so 0.1 + 0.2 shows as 0.3. */
export const roundWeight = (n: number) => Math.round(n * 1000) / 1000

export const itemWeight = (i: Pick<Item, 'weight' | 'quantity'>) => roundWeight((i.weight ?? 0) * Math.max(0, i.quantity))

type Inv = Pick<Character, 'inventory'>

/** Where new items go and where items of an unknown container end up: the first container. */
export const defaultContainerId = (c: Inv) => c.inventory.containers[0]?.id ?? DEFAULT_CONTAINER.id

export const findContainer = (c: Inv, id: string | undefined) => (id ? c.inventory.containers.find((x) => x.id === id) : undefined)

/** The item's container (the first one if its own is missing). */
export const containerOf = (c: Inv, i: Item): Container | undefined => findContainer(c, i.containerId) ?? c.inventory.containers[0]

/** The container that IS this item (the Bag of Holding item -> the Bag of Holding container). */
export const containerForItem = (c: Inv, itemId: string) => c.inventory.containers.find((x) => x.itemId === itemId)

/** The item a container is, if any. */
export const itemOfContainer = (c: Inv, k: Container) => (k.itemId ? c.inventory.items.find((i) => i.id === k.itemId) : undefined)

/** Items whose container is this one (not those inside bags in it). */
export const itemsIn = (c: Inv, containerId: string) => {
  const first = defaultContainerId(c)
  return c.inventory.items.filter((i) => (findContainer(c, i.containerId) ? i.containerId : first) === containerId)
}

/**
 * The container this one is inside: the container of its item. None when it is not an item, when its
 * item is equipped (a bag worn at the belt is on you), or when the item is gone.
 * `stored`: ignore `equipped` and follow where the item is kept. Weight and warnings follow what is worn
 * now; loop checks must use `stored`, or a worn bag could be put inside a bag inside it, and taking it
 * off later would make a loop.
 */
export function parentOf(c: Inv, k: Container, { stored = false } = {}): Container | undefined {
  const item = itemOfContainer(c, k)
  if (!item || (item.equipped && !stored)) return undefined
  return containerOf(c, item)
}

/** This container and every container around it, innermost first. Stops at a loop (normalize breaks loops on read). */
export function chainOf(c: Inv, k: Container, opts: { stored?: boolean } = {}): Container[] {
  const out: Container[] = []
  for (let cur: Container | undefined = k; cur && !out.includes(cur); cur = parentOf(c, cur, opts)) out.push(cur)
  return out
}

/** True when `inner` is `outer` or kept somewhere inside it (worn or not: this is for loop checks). */
export const isInside = (c: Inv, inner: Container, outer: Container) => chainOf(c, inner, { stored: true }).some((x) => x.id === outer.id)

/**
 * Where the items of a deleted container go: where the container itself is kept, or else the first
 * container that is not inside it (a pouch inside the deleted bag cannot take the bag's items: the pouch's
 * own item is one of them). Undefined when every other container is inside it.
 */
export function deleteTarget(c: Inv, id: string): Container | undefined {
  const k = findContainer(c, id)
  if (!k) return undefined
  const parent = parentOf(c, k, { stored: true })
  if (parent && parent.id !== id) return parent
  return c.inventory.containers.find((x) => x.id !== id && !isInside(c, x, k))
}

/** Whether the item's weight counts toward what you carry: equipped, or no weightless container around it. */
export function carried(c: Inv, i: Item): boolean {
  if (i.equipped) return true
  const k = containerOf(c, i)
  return !k || !chainOf(c, k).some((x) => x.weightless)
}

/** The weight you carry: every item that counts (see carried), each weight × quantity. */
export const carriedWeight = (c: Inv) => roundWeight(c.inventory.items.reduce((s, i) => s + (carried(c, i) ? itemWeight(i) : 0), 0))

/** Everything you own, carried or not. */
export const totalWeight = (c: Inv) => roundWeight(c.inventory.items.reduce((s, i) => s + itemWeight(i), 0))

/**
 * What a container holds, for its weight limit: its items (not the equipped ones: they are on you), and
 * what is in bags inside it, unless such a bag is weightless (a Bag of Holding inside weighs only its 15 lb).
 */
export function contentsWeight(c: Inv, containerId: string, seen = new Set<string>()): number {
  if (seen.has(containerId)) return 0
  seen.add(containerId)
  let sum = 0
  for (const i of itemsIn(c, containerId)) {
    if (i.equipped) continue
    sum += itemWeight(i)
    const inner = containerForItem(c, i.id)
    if (inner && !inner.weightless) sum += contentsWeight(c, inner.id, seen)
  }
  return roundWeight(sum)
}

export type InventoryWarning =
  | { kind: 'nested-extradimensional'; container: Container; inside: Container }
  | { kind: 'over-capacity'; container: Container; weight: number; capacity: number }

/**
 * What the Gear tab should warn about:
 * - an extradimensional container (Bag of Holding) inside another one, at any depth: in the rules both are
 *   destroyed and everything goes to the Astral Plane. The app does not do that; it only warns.
 * - a container over its weight limit.
 */
export function inventoryWarnings(c: Inv): InventoryWarning[] {
  const out: InventoryWarning[] = []
  for (const k of c.inventory.containers) {
    if (k.extradimensional) {
      const outer = chainOf(c, k).slice(1).find((x) => x.extradimensional)
      if (outer) out.push({ kind: 'nested-extradimensional', container: k, inside: outer })
    }
    if (k.capacity !== undefined) {
      const weight = contentsWeight(c, k.id)
      if (weight > k.capacity) out.push({ kind: 'over-capacity', container: k, weight, capacity: k.capacity })
    }
  }
  return out
}

/**
 * Containers the item can be moved into. Not the container the item itself is (a bag into itself), nor any
 * container inside it (a bag into a pouch that is in the bag): that would be a loop and the items would
 * hang nowhere.
 */
export function moveTargets(c: Inv, itemId: string): Container[] {
  const own = containerForItem(c, itemId)
  return c.inventory.containers.filter((k) => !own || !isInside(c, k, own))
}

// ----- changes -----

export type Change = { ok: true; character: Character } | { ok: false; character: Character; reason: ChangeRefusal }
export type ChangeRefusal = 'not-found' | 'last-container' | 'no-place' | 'into-itself' | 'bad-amount' | 'is-container' | 'not-same' | 'item-taken'

const refuse = (c: Character, reason: ChangeRefusal): Change => ({ ok: false, character: c, reason })
const withItems = (c: Character, items: Item[]): Character => ({ ...c, inventory: { ...c.inventory, items } })
const withContainers = (c: Character, containers: Container[]): Character => ({ ...c, inventory: { ...c.inventory, containers } })

export interface ContainerInput {
  name: string
  icon?: string
  color?: string
  capacity?: number
  weightless?: boolean
  extradimensional?: boolean
  itemId?: string
}

/** Builds a clean container from what the form gives: trimmed text, empty fields left out, a limit only when above 0. */
function cleanContainer(id: string, input: ContainerInput): Container {
  const k: Container = { id, name: input.name.trim() || 'Container' }
  if (input.icon?.trim()) k.icon = input.icon.trim()
  if (input.color?.trim()) k.color = input.color.trim()
  if (input.capacity !== undefined && Number.isFinite(input.capacity) && input.capacity > 0) k.capacity = input.capacity
  if (input.weightless) k.weightless = true
  if (input.extradimensional) k.extradimensional = true
  if (input.itemId) k.itemId = input.itemId
  return k
}

/** Checks a container's item link: the item exists, no other container is that item, and it would not be inside itself. */
function checkItemLink(c: Character, containerId: string, itemId: string | undefined): ChangeRefusal | null {
  if (!itemId) return null
  const item = c.inventory.items.find((i) => i.id === itemId)
  if (!item) return 'not-found'
  const other = containerForItem(c, itemId)
  if (other && other.id !== containerId) return 'item-taken'
  // the bag item must not be kept inside the bag (directly or through another bag), worn or not.
  // A new container is empty, so it cannot hold its own item: only an existing one is checked.
  const where = containerOf(c, item)
  const self = findContainer(c, containerId)
  if (where && self) {
    const probe = { ...c, inventory: { ...c.inventory, containers: c.inventory.containers.map((k) => (k.id === containerId ? { ...k, itemId } : k)) } }
    if (chainOf(probe, where, { stored: true }).some((x) => x.id === containerId)) return 'into-itself'
  }
  return null
}

/** Ready-made settings for common containers (the form's "Kind" list). The player can change any of it after. */
export const CONTAINER_PRESETS: Record<string, Omit<ContainerInput, 'name'> & { name: string }> = {
  bag: { name: 'Bag', icon: '👜' },
  'bag-of-holding': { name: 'Bag of Holding', icon: '🌀', capacity: 500, weightless: true, extradimensional: true },
  'handy-haversack': { name: 'Handy Haversack', icon: '🎒', capacity: 120, weightless: true, extradimensional: true },
  'portable-hole': { name: 'Portable Hole', icon: '🕳', weightless: true, extradimensional: true },
  mount: { name: 'Mount', icon: '🐴', weightless: true },
  home: { name: 'Stored at home', icon: '🏠', weightless: true },
}

/** A new container (empty). Returns it so the caller can open or select it. */
export function addContainer(c: Character, input: ContainerInput): { character: Character; container: Container } | { character: Character; refused: ChangeRefusal } {
  const id = newId()
  const refused = checkItemLink(c, id, input.itemId)
  if (refused) return { character: c, refused }
  const container = cleanContainer(id, input)
  return { character: withContainers(c, [...c.inventory.containers, container]), container }
}

/** Replaces a container's settings (name, icon, colour, limit, flags, item). The id stays. */
export function updateContainer(c: Character, id: string, input: ContainerInput): Change {
  if (!findContainer(c, id)) return refuse(c, 'not-found')
  const refused = checkItemLink(c, id, input.itemId)
  if (refused) return refuse(c, refused)
  // fields this app does not know (from a newer app or a hand-written file) are kept, like everywhere else
  const known = new Set(['id', 'name', 'icon', 'color', 'capacity', 'weightless', 'extradimensional', 'itemId'])
  const keepUnknown = (k: Container) => Object.fromEntries(Object.entries(k).filter(([f]) => !known.has(f)))
  return { ok: true, character: withContainers(c, c.inventory.containers.map((k) => (k.id === id ? { ...keepUnknown(k), ...cleanContainer(id, input) } : k))) }
}

/**
 * Deletes a container. Its items are NOT deleted: they move to where the container itself was (a Bag of
 * Holding in the Backpack -> into the Backpack), or, for a loose container, to the first container not
 * inside it (deleteTarget). The bag's item, if any, stays as a plain item. Refused for the last container,
 * and when every other container is inside this one (there is nowhere to put its items).
 */
export function deleteContainer(c: Character, id: string): Change & { movedTo?: Container; moved?: number } {
  if (!findContainer(c, id)) return refuse(c, 'not-found')
  if (c.inventory.containers.length <= 1) return refuse(c, 'last-container')
  const to = deleteTarget(c, id)
  if (!to) return refuse(c, 'no-place')
  const inside = new Set(itemsIn(c, id).map((i) => i.id))
  const items = c.inventory.items.map((i) => (inside.has(i.id) ? { ...i, containerId: to.id } : i))
  const containers = c.inventory.containers.filter((x) => x.id !== id)
  return { ok: true, character: { ...c, inventory: { ...c.inventory, items, containers } }, movedTo: to, moved: inside.size }
}

/** Moves an item (the whole stack) into a container. Refused if the item is that bag, or a bag around it. */
export function moveItem(c: Character, itemId: string, toContainerId: string): Change {
  const item = c.inventory.items.find((i) => i.id === itemId)
  if (!item || !findContainer(c, toContainerId)) return refuse(c, 'not-found')
  if (!moveTargets(c, itemId).some((k) => k.id === toContainerId)) return refuse(c, 'into-itself')
  if (item.containerId === toContainerId) return { ok: true, character: c }
  return { ok: true, character: withItems(c, c.inventory.items.map((i) => (i.id === itemId ? { ...i, containerId: toContainerId } : i))) }
}

/**
 * Splits `count` off a stack into a new item, in the same container or another one. The new stack is a copy
 * with its own id (its powers too), not equipped and not attuned: attunement is one item, not a stack.
 * Attacks stay linked to the old stack. A bag (an item that is a container) cannot be split.
 */
export function splitStack(c: Character, itemId: string, count: number, toContainerId?: string): Change & { newId?: string } {
  const item = c.inventory.items.find((i) => i.id === itemId)
  if (!item) return refuse(c, 'not-found')
  if (containerForItem(c, itemId)) return refuse(c, 'is-container')
  const n = Math.floor(count)
  if (!Number.isFinite(count) || n !== count || n < 1 || n >= item.quantity) return refuse(c, 'bad-amount')
  const to = toContainerId ?? item.containerId ?? defaultContainerId(c)
  if (!findContainer(c, to)) return refuse(c, 'not-found')
  const copy: Item = {
    ...structuredClone(item),
    id: newId(),
    quantity: n,
    equipped: false,
    attuned: false,
    containerId: to,
  }
  if (copy.powers) copy.powers = copy.powers.map((p) => ({ ...p, id: newId() }))
  const at = c.inventory.items.findIndex((i) => i.id === itemId)
  const items = [...c.inventory.items]
  items[at] = { ...item, quantity: item.quantity - n }
  items.splice(at + 1, 0, copy)
  return { ok: true, character: withItems(c, items), newId: copy.id }
}

/** An item without what may differ between two stacks of the same thing: id, quantity, container, equipped, power ids. */
function stackKey(i: Item): string {
  const { id: _id, quantity: _q, containerId: _k, equipped: _e, ...rest } = i
  void [_id, _q, _k, _e]
  const powers = rest.powers?.map(({ id: _pid, ...p }) => (void _pid, p))
  return JSON.stringify({ ...rest, name: rest.name.trim().toLowerCase(), powers })
}

/**
 * Two stacks are the same thing when everything but id, quantity, container and `equipped` is equal
 * (name ignoring case; charges with the same used count). Attuned items and bags never merge.
 */
export function canMerge(c: Inv, a: Item, b: Item): boolean {
  if (a.id === b.id || a.attuned || b.attuned) return false
  if (containerForItem(c, a.id) || containerForItem(c, b.id)) return false
  return stackKey(a) === stackKey(b)
}

/** Stacks this one can merge into, nearest first: same container, then the rest in inventory order. */
export function mergeCandidates(c: Inv, itemId: string): Item[] {
  const item = c.inventory.items.find((i) => i.id === itemId)
  if (!item) return []
  const list = c.inventory.items.filter((x) => canMerge(c, item, x))
  const here = (x: Item) => (x.containerId === item.containerId ? 0 : 1)
  return list.sort((x, y) => here(x) - here(y))
}

/** Merges stack `fromId` into `intoId`: quantities add up, `from` is removed, its attacks move to `into`. */
export function mergeStacks(c: Character, fromId: string, intoId: string): Change {
  const from = c.inventory.items.find((i) => i.id === fromId)
  const into = c.inventory.items.find((i) => i.id === intoId)
  if (!from || !into) return refuse(c, 'not-found')
  if (!canMerge(c, from, into)) return refuse(c, 'not-same')
  const items = c.inventory.items.filter((i) => i.id !== fromId).map((i) => (i.id === intoId ? { ...i, quantity: i.quantity + from.quantity } : i))
  const attacks = c.attacks.map((a) => (a.itemId === fromId ? { ...a, itemId: intoId } : a))
  return { ok: true, character: { ...withItems(c, items), attacks } }
}

/**
 * Deletes an item. Attacks made with it stay, unlinked. If it was a bag, the container stays with
 * everything in it, as a loose container (only the link to the deleted item goes).
 */
export function deleteItem(c: Character, itemId: string): Character {
  return {
    ...c,
    inventory: {
      ...c.inventory,
      items: c.inventory.items.filter((x) => x.id !== itemId),
      containers: c.inventory.containers.map((k) => (k.itemId === itemId ? withoutItemLink(k) : k)),
    },
    attacks: c.attacks.map((a) => (a.itemId === itemId ? { ...a, itemId: null } : a)),
  }
}

export function withoutItemLink(k: Container): Container {
  const { itemId: _drop, ...rest } = k
  void _drop
  return rest
}
