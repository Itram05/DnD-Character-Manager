// Inventory rework stage 2: containers, stacks, weight, categories and Gear preferences.
import { describe, expect, it } from 'vitest'
import { addCategory, categoryList, deleteCategory, guessCategory, itemCategory, updateCategory } from './categories'
import {
  addContainer,
  canMerge,
  carried,
  carriedWeight,
  containerOf,
  contentsWeight,
  deleteContainer,
  deleteItem,
  inventoryWarnings,
  itemsIn,
  mergeCandidates,
  mergeStacks,
  moveItem,
  moveTargets,
  splitStack,
  totalWeight,
  updateContainer,
} from './containers'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { addHealingPotion } from './play'
import type { Character } from './types'

type Obj = Record<string, unknown>
const read = (raw: Obj) => normalizeCharacter(raw)
const item = (c: Character, id: string) => c.inventory.items.find((i) => i.id === id)!
const box = (c: Character, name: string) => c.inventory.containers.find((k) => k.name === name)!
const ok = <T extends { ok: boolean; character: Character }>(r: T) => {
  expect(r.ok).toBe(true)
  return r.character
}

/** A v3 file as the app wrote it before containers existed. */
const v3 = (): Obj => ({
  schemaVersion: 3,
  name: 'Old',
  classes: [{ id: 'fighter', level: 3 }],
  attacks: [{ id: 'a-sword', name: 'Longsword', itemId: 'sword' }],
  inventory: {
    items: [
      { id: 'plate', name: 'Half Plate', quantity: 1, equipped: true, weight: 40, armor: { base: 15, dexCap: 2 } },
      { id: 'sword', name: 'Longsword', quantity: 1, equipped: true, weight: 3 },
      { id: 'rope', name: 'Rope', quantity: 2, weight: 10 },
      { id: 'pot', name: 'Potion of Healing', quantity: 3, weight: 0.5 },
    ],
    money: { gp: 12 },
  },
})

/** Built on the migrated v3 hero: a Bag of Holding (an item, in the Backpack) with things in it. */
function withBag(): Character {
  let c = read(v3()).character
  c = { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, { id: 'boh', name: 'Bag of Holding', quantity: 1, equipped: false, requiresAttunement: false, attuned: false, description: '', weight: 15, containerId: 'backpack' }] } }
  const r = addContainer(c, { name: 'Bag of Holding', capacity: 500, weightless: true, extradimensional: true, itemId: 'boh' })
  if (!('container' in r)) throw new Error('refused')
  c = r.character
  return ok(moveItem(c, 'rope', r.container.id))
}

describe('migration: a file without containers', () => {
  it('a v3 file gets one Backpack with every item in it, silently, and loses nothing', () => {
    const before = read({ ...v3(), inventory: { ...(v3().inventory as Obj) } })
    const { character: c, warnings } = before
    expect(c.inventory.containers).toEqual([{ id: 'backpack', name: 'Backpack', icon: '🎒' }])
    expect(c.inventory.items.map((i) => [i.id, i.containerId])).toEqual([
      ['plate', 'backpack'],
      ['sword', 'backpack'],
      ['rope', 'backpack'],
      ['pot', 'backpack'],
    ])
    expect(warnings).toEqual([])
    expect(c.inventory.items.map((i) => [i.name, i.quantity, i.weight, i.equipped])).toEqual([
      ['Half Plate', 1, 40, true],
      ['Longsword', 1, 3, true],
      ['Rope', 2, 10, false],
      ['Potion of Healing', 3, 0.5, false],
    ])
    expect(c.inventory.money.gp).toBe(12)
    expect(c.inventory.categories).toEqual([])
    expect(c.preferences.gear).toEqual({ view: 'hybrid', groupBy: 'container', show: { quantity: true, weight: true, category: true, tags: true, charges: true } })
  })
  it('the carried weight is the old total: everything is in the Backpack, which counts', () => {
    const c = read(v3()).character
    expect(carriedWeight(c)).toBe(40 + 3 + 20 + 1.5)
    expect(totalWeight(c)).toBe(carriedWeight(c))
  })
  it('v1 and v2 files and a bare item list get the Backpack too', () => {
    for (const v of [1, 2]) expect(read({ ...v3(), schemaVersion: v }).character.inventory.items.every((i) => i.containerId === 'backpack')).toBe(true)
    const bare = read({ name: 'B', items: ['Torch', { name: 'Rope' }] }).character
    expect(bare.inventory.items.map((i) => i.containerId)).toEqual(['backpack', 'backpack'])
  })
  it('a character with no items still has one container (new items need a place)', () => {
    expect(read({ name: 'Empty' }).character.inventory.containers).toHaveLength(1)
  })
  it('a second read changes nothing and says nothing (export -> import round trip)', () => {
    const c = withBag()
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('a newer file read by this app keeps container fields it does not know', () => {
    const c = read({ name: 'N', inventory: { items: [{ name: 'Rope', containerId: 'k' }], containers: [{ id: 'k', name: 'Sack', lining: 'silk' }] } })
    expect(c.character.inventory.containers[0]).toMatchObject({ id: 'k', name: 'Sack', lining: 'silk' })
    expect(c.warnings).toEqual(['inventory.containers[0].lining: not a field this app uses; kept unchanged.'])
  })
})

describe('reading containers: broken files are repaired without losing an item', () => {
  it('an item in a container that does not exist goes to the first one, with a warning', () => {
    const r = read({ name: 'X', inventory: { items: [{ id: 'a', name: 'Rope', containerId: 'gone' }], containers: [{ id: 'k1', name: 'Sack' }, { id: 'k2', name: 'Chest' }] } })
    expect(item(r.character, 'a').containerId).toBe('k1')
    expect(r.warnings).toEqual(['inventory.items[0]: "Rope" was in a container that does not exist; it is now in "Sack".'])
  })
  it('two containers with the same id: the second gets a new id, the items stay in the first', () => {
    const r = read({ name: 'X', inventory: { items: [{ id: 'a', name: 'Rope', containerId: 'k' }], containers: [{ id: 'k', name: 'Sack' }, { id: 'k', name: 'Chest' }] } })
    expect(r.character.inventory.containers.map((k) => k.name)).toEqual(['Sack', 'Chest'])
    expect(r.character.inventory.containers[1].id).not.toBe('k')
    expect(item(r.character, 'a').containerId).toBe('k')
    expect(r.warnings).toHaveLength(1)
  })
  it('a link to an item that is gone, or one item claimed twice: the link goes, the container stays', () => {
    const r = read({
      name: 'X',
      inventory: {
        items: [{ id: 'bag', name: 'Bag' }],
        containers: [
          { id: 'k0', name: 'Backpack' },
          { id: 'k1', name: 'Sack', itemId: 'lost' },
          { id: 'k2', name: 'Bag', itemId: 'bag' },
          { id: 'k3', name: 'Bag again', itemId: 'bag' },
        ],
      },
    })
    expect(r.character.inventory.containers.map((k) => [k.id, k.itemId])).toEqual([
      ['k0', undefined],
      ['k1', undefined],
      ['k2', 'bag'],
      ['k3', undefined],
    ])
    expect(r.warnings).toHaveLength(2)
  })
  it('a loop (bag A in bag B, bag B in bag A) is broken by unlinking one bag', () => {
    const r = read({
      name: 'X',
      inventory: {
        items: [
          { id: 'ia', name: 'Bag A', containerId: 'B' },
          { id: 'ib', name: 'Bag B', containerId: 'A' },
          { id: 'gem', name: 'Gem', containerId: 'A' },
        ],
        containers: [
          { id: 'A', name: 'Bag A', itemId: 'ia' },
          { id: 'B', name: 'Bag B', itemId: 'ib' },
        ],
      },
    })
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toMatch(/was inside itself/)
    expect(r.character.inventory.containers.filter((k) => k.itemId)).toHaveLength(1)
    expect(r.character.inventory.items).toHaveLength(3)
    // every item hangs somewhere a weight can be computed for
    expect(() => carriedWeight(r.character)).not.toThrow()
  })
  it('a bag inside itself directly', () => {
    const r = read({ name: 'X', inventory: { items: [{ id: 'ia', name: 'Bag', containerId: 'A' }], containers: [{ id: 'A', name: 'Bag', itemId: 'ia' }] } })
    expect(r.character.inventory.containers[0].itemId).toBeUndefined()
    expect(r.warnings).toHaveLength(1)
  })
  it('bad container fields: capacity 0 or text is dropped, flags read as booleans', () => {
    const r = read({ name: 'X', inventory: { containers: [{ id: 'k', name: '  ', capacity: 0, weightless: 1 }, { name: 'Chest', capacity: 'lots' }] } })
    expect(r.character.inventory.containers[0]).toEqual({ id: 'k', name: 'Container', weightless: true })
    expect(r.character.inventory.containers[1].capacity).toBeUndefined()
    expect(r.warnings).toHaveLength(1)
  })
})

describe('weight', () => {
  it('fractions add up without float noise; quantity 0 weighs nothing', () => {
    const c = read({
      name: 'W',
      inventory: {
        items: [
          { name: 'Bolt', quantity: 40, weight: 0.075 },
          { name: 'A', quantity: 3, weight: 0.1 },
          { name: 'B', quantity: 1, weight: 0.2 },
          { name: 'Empty flask', quantity: 0, weight: 1 },
        ],
      },
    }).character
    expect(carriedWeight(c)).toBe(3.5)
  })
  it('a Bag of Holding: its 15 lb count, what is inside does not; it still counts toward its own 500 lb limit', () => {
    const c = withBag()
    expect(carriedWeight(c)).toBe(40 + 3 + 1.5 + 15)
    expect(totalWeight(c)).toBe(40 + 3 + 1.5 + 15 + 20)
    expect(contentsWeight(c, box(c, 'Bag of Holding').id)).toBe(20)
    expect(contentsWeight(c, 'backpack')).toBe(1.5 + 15)
    expect(carried(c, item(c, 'rope'))).toBe(false)
  })
  it('an equipped item counts as on you even when its container is weightless', () => {
    const c = withBag()
    const x = ok(moveItem(c, 'plate', box(c, 'Bag of Holding').id))
    expect(carried(x, item(x, 'plate'))).toBe(true)
    expect(contentsWeight(x, box(x, 'Bag of Holding').id)).toBe(20)
  })
  it('a plain pouch inside the Bag of Holding: its weight goes to the bag\'s limit; a bag of holding inside only its own weight', () => {
    let c = withBag()
    c = { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, { id: 'pouch', name: 'Pouch', quantity: 1, equipped: false, requiresAttunement: false, attuned: false, weight: 1, containerId: box(c, 'Bag of Holding').id }] } }
    const r = addContainer(c, { name: 'Pouch', itemId: 'pouch' })
    if (!('container' in r)) throw new Error('refused')
    c = ok(moveItem(r.character, 'pot', r.container.id))
    expect(contentsWeight(c, box(c, 'Bag of Holding').id)).toBe(20 + 1 + 1.5)
    expect(carriedWeight(c)).toBe(40 + 3 + 15)
  })
  it('over the weight limit is a warning, not a block', () => {
    const c = withBag()
    const x = ok(updateContainer(c, box(c, 'Bag of Holding').id, { ...box(c, 'Bag of Holding'), capacity: 10 }))
    expect(inventoryWarnings(x)).toEqual([{ kind: 'over-capacity', container: box(x, 'Bag of Holding'), weight: 20, capacity: 10 }])
  })
})

describe('Bag of Holding inside a Bag of Holding', () => {
  function twoBags() {
    let c = withBag()
    c = { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, { id: 'boh2', name: 'Second bag', quantity: 1, equipped: false, requiresAttunement: false, attuned: false, weight: 15, containerId: 'backpack' }] } }
    const r = addContainer(c, { name: 'Second bag', weightless: true, extradimensional: true, itemId: 'boh2' })
    if (!('container' in r)) throw new Error('refused')
    return r.character
  }
  it('side by side: no warning', () => {
    expect(inventoryWarnings(twoBags())).toEqual([])
  })
  it('one inside the other: a warning naming both', () => {
    const c = twoBags()
    const x = ok(moveItem(c, 'boh2', box(c, 'Bag of Holding').id))
    expect(inventoryWarnings(x)).toEqual([{ kind: 'nested-extradimensional', container: box(x, 'Second bag'), inside: box(x, 'Bag of Holding') }])
  })
  it('through a plain pouch in between: still a warning', () => {
    let c = twoBags()
    c = { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, { id: 'pouch', name: 'Pouch', quantity: 1, equipped: false, requiresAttunement: false, attuned: false, containerId: box(c, 'Bag of Holding').id }] } }
    const r = addContainer(c, { name: 'Pouch', itemId: 'pouch' })
    if (!('container' in r)) throw new Error('refused')
    const x = ok(moveItem(r.character, 'boh2', r.container.id))
    expect(inventoryWarnings(x).map((w) => w.kind)).toEqual(['nested-extradimensional'])
  })
  it('a bag cannot go into itself, nor into a bag that is in it', () => {
    let c = twoBags()
    c = ok(moveItem(c, 'boh2', box(c, 'Bag of Holding').id))
    expect(moveItem(c, 'boh', box(c, 'Bag of Holding').id)).toMatchObject({ ok: false, reason: 'into-itself' })
    expect(moveItem(c, 'boh', box(c, 'Second bag').id)).toMatchObject({ ok: false, reason: 'into-itself' })
    expect(moveTargets(c, 'boh').map((k) => k.name)).toEqual(['Backpack'])
  })
  it('linking a container to an item that is inside it is refused; one item cannot be two containers', () => {
    const c = withBag()
    expect(updateContainer(c, box(c, 'Bag of Holding').id, { name: 'Bag of Holding', itemId: 'rope' })).toMatchObject({ ok: false, reason: 'into-itself' })
    expect(addContainer(c, { name: 'Copy', itemId: 'boh' })).toMatchObject({ refused: 'item-taken' })
  })
})

describe('deleting', () => {
  it('a bag in the Backpack: its items go to the Backpack (where the bag was); the bag item stays', () => {
    const c = withBag()
    const r = deleteContainer(c, box(c, 'Bag of Holding').id)
    expect(r).toMatchObject({ ok: true, moved: 1 })
    expect(r.movedTo!.name).toBe('Backpack')
    expect(item(r.character, 'rope').containerId).toBe('backpack')
    expect(item(r.character, 'boh').name).toBe('Bag of Holding')
    expect(r.character.inventory.items).toHaveLength(c.inventory.items.length)
  })
  it('a loose container: its items go to the first other container', () => {
    let c = read(v3()).character
    const r = addContainer(c, { name: 'Horse', weightless: true })
    if (!('container' in r)) throw new Error('refused')
    c = ok(moveItem(r.character, 'rope', r.container.id))
    const d = deleteContainer(c, 'backpack')
    expect(d.ok).toBe(true)
    expect(d.character.inventory.items.every((i) => i.containerId === r.container.id)).toBe(true)
  })
  it('an empty container: just gone', () => {
    const c = read(v3()).character
    const r = addContainer(c, { name: 'Chest' })
    if (!('container' in r)) throw new Error('refused')
    const d = deleteContainer(r.character, r.container.id)
    expect(d).toMatchObject({ ok: true, moved: 0 })
    expect(d.character.inventory.containers.map((k) => k.name)).toEqual(['Backpack'])
  })
  it('the last container is refused', () => {
    const c = read(v3()).character
    expect(deleteContainer(c, 'backpack')).toMatchObject({ ok: false, reason: 'last-container' })
  })
  it('a bag inside the deleted bag moves with its contents, still a bag', () => {
    let c = withBag()
    c = { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, { id: 'pouch', name: 'Pouch', quantity: 1, equipped: false, requiresAttunement: false, attuned: false, containerId: box(c, 'Bag of Holding').id }] } }
    const r = addContainer(c, { name: 'Pouch', itemId: 'pouch' })
    if (!('container' in r)) throw new Error('refused')
    c = ok(moveItem(r.character, 'pot', r.container.id))
    const d = ok(deleteContainer(c, box(c, 'Bag of Holding').id))
    expect(item(d, 'pouch').containerId).toBe('backpack')
    expect(item(d, 'pot').containerId).toBe(r.container.id)
  })
  it('deleting the bag ITEM keeps the container and everything in it (loose now); attacks unlink', () => {
    const c = withBag()
    const d = deleteItem(c, 'boh')
    expect(box(d, 'Bag of Holding').itemId).toBeUndefined()
    expect(item(d, 'rope').containerId).toBe(box(d, 'Bag of Holding').id)
    expect(deleteItem(c, 'sword').attacks[0].itemId).toBeNull()
  })
})

describe('stacks: split and merge', () => {
  const potions = () =>
    read({
      name: 'S',
      attacks: [{ name: 'Dagger', itemId: 'd1' }],
      inventory: {
        items: [
          { id: 'p1', name: 'Potion of Healing', quantity: 5, weight: 0.5 },
          { id: 'p2', name: 'potion of healing', quantity: 2, weight: 0.5 },
          { id: 'w1', name: 'Wand', quantity: 1, charges: { max: 7, used: 2 }, powers: [{ id: 'pw', name: 'Web' }] },
          { id: 'w2', name: 'Wand', quantity: 1, charges: { max: 7, used: 0 }, powers: [{ id: 'pw2', name: 'Web' }] },
          { id: 'd1', name: 'Dagger', quantity: 3, equipped: true, weight: 1 },
          { id: 'zero', name: 'Torch', quantity: 0, weight: 1 },
        ],
        containers: [{ id: 'k1', name: 'Backpack' }, { id: 'k2', name: 'Belt pouch' }],
      },
    }).character

  it('split 2 of 5 into another container: a new stack after the old one, not equipped or attuned', () => {
    const c = potions()
    const r = splitStack(c, 'p1', 2, 'k2')
    const x = ok(r)
    expect(x.inventory.items.map((i) => [i.name, i.quantity, i.containerId]).slice(0, 2)).toEqual([
      ['Potion of Healing', 3, 'k1'],
      ['Potion of Healing', 2, 'k2'],
    ])
    expect(r.newId).not.toBe('p1')
    expect(carriedWeight(x)).toBe(carriedWeight(c))
  })
  it('split of an equipped stack: the split part is not equipped; attacks stay on the old stack', () => {
    const x = ok(splitStack(potions(), 'd1', 1))
    const parts = x.inventory.items.filter((i) => i.name === 'Dagger')
    expect(parts.map((i) => [i.quantity, i.equipped])).toEqual([
      [2, true],
      [1, false],
    ])
    expect(x.attacks[0].itemId).toBe('d1')
  })
  it('the split stack gets new power ids', () => {
    let c = potions()
    c = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'w1' ? { ...i, quantity: 2 } : i)) } }
    const r = splitStack(c, 'w1', 1)
    expect(item(r.character, r.newId!).powers![0].id).not.toBe('pw')
  })
  it('bad amounts are refused: 0, the whole stack, more, a fraction, a stack of 0', () => {
    const c = potions()
    for (const n of [0, 5, 6, 1.5, -1, NaN]) expect(splitStack(c, 'p1', n)).toMatchObject({ ok: false, reason: 'bad-amount' })
    expect(splitStack(c, 'zero', 1)).toMatchObject({ ok: false, reason: 'bad-amount' })
  })
  it('merge: same item (name ignoring case), quantities add, the stack goes, attacks follow', () => {
    const c = potions()
    expect(mergeCandidates(c, 'p2').map((i) => i.id)).toEqual(['p1'])
    const x = ok(mergeStacks(c, 'p2', 'p1'))
    expect(item(x, 'p1').quantity).toBe(7)
    expect(x.inventory.items.some((i) => i.id === 'p2')).toBe(false)
  })
  it('a split and merge back is the same character', () => {
    const c = potions()
    const r = splitStack(c, 'p1', 2, 'k2')
    const back = ok(mergeStacks(r.character, r.newId!, 'p1'))
    expect(back).toEqual(c)
  })
  it('merge moves attacks from the merged stack', () => {
    const c = potions()
    const r = splitStack(c, 'd1', 1)
    const x = { ...r.character, attacks: [{ ...r.character.attacks[0], itemId: r.newId! }] }
    expect(ok(mergeStacks(x, r.newId!, 'd1')).attacks[0].itemId).toBe('d1')
  })
  it('different charges, attuned items and bags do not merge', () => {
    const c = potions()
    expect(canMerge(c, item(c, 'w1'), item(c, 'w2'))).toBe(false)
    expect(mergeStacks(c, 'w1', 'w2')).toMatchObject({ ok: false, reason: 'not-same' })
    const att = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'p2' ? { ...i, requiresAttunement: true, attuned: true } : i)) } }
    expect(canMerge(att, item(att, 'p2'), item(att, 'p1'))).toBe(false)
  })
  it('a stack of 0 can be moved and merged', () => {
    const c = potions()
    const x = ok(moveItem(c, 'zero', 'k2'))
    expect(item(x, 'zero').containerId).toBe('k2')
    expect(itemsIn(x, 'k2').map((i) => i.id)).toEqual(['zero'])
  })
  it('a container item cannot be split', () => {
    const c = withBag()
    const x = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'boh' ? { ...i, quantity: 2 } : i)) } }
    expect(splitStack(x, 'boh', 1)).toMatchObject({ ok: false, reason: 'is-container' })
  })
})

describe('new items land in the first container', () => {
  it('a healing potion made by "+" in Play', () => {
    const c = read({ name: 'P', inventory: { containers: [{ id: 'k1', name: 'Belt' }, { id: 'k2', name: 'Pack' }] } }).character
    const x = addHealingPotion(c, 'greater')
    expect(x.inventory.items[0].containerId).toBe('k1')
  })
  it('an item without a container (written by an older app) is shown in the first one', () => {
    const c = read(v3()).character
    const x = { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, { id: 'n', name: 'New', quantity: 1, equipped: false, requiresAttunement: false, attuned: false }] } }
    expect(containerOf(x, item(x, 'n'))!.id).toBe('backpack')
    expect(itemsIn(x, 'backpack').map((i) => i.id)).toContain('n')
  })
})

describe('categories: built-in, renamed, the player\'s own', () => {
  it('guesses: scroll, potion, armor, weapon (has an attack), magic, gear', () => {
    const c = read({
      name: 'G',
      attacks: [{ name: 'Sword', itemId: 's' }],
      inventory: {
        items: [
          { id: 'sc', name: 'Scroll of Fireball' },
          { id: 'po', name: 'Potion of Climbing' },
          { id: 'ar', name: 'Shield', acBonus: 2 },
          { id: 's', name: 'Sword' },
          { id: 'ri', name: 'Ring', requiresAttunement: true },
          { id: 'mo', name: 'Moonvine leaf', tags: ['material'] },
          { id: 'ro', name: 'Rope' },
        ],
      },
    }).character
    expect(c.inventory.items.map((i) => guessCategory(c, i))).toEqual(['scroll', 'potion', 'armor', 'weapon', 'magic', 'material', 'gear'])
    expect(c.inventory.items.every((i) => i.category === undefined)).toBe(true)
  })
  it('an item\'s own category wins over the guess', () => {
    const c = read({ name: 'G', inventory: { items: [{ id: 'g', name: 'Diamond', category: 'valuable' }] } }).character
    expect(itemCategory(c, item(c, 'g')).name).toBe('Valuables')
  })
  it('the player\'s category, renamed built-in, and deleting', () => {
    let c = read({ name: 'G', inventory: { items: [{ id: 'g', name: 'Troll blood' }] } }).character
    const added = addCategory(c, { name: 'Alchemy', icon: '⚗' })
    c = added.character
    c = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => ({ ...i, category: added.id })) } }
    expect(itemCategory(c, item(c, 'g'))).toMatchObject({ name: 'Alchemy', icon: '⚗' })
    c = updateCategory(c, 'gear', { name: 'Stuff' })
    expect(categoryList(c).find((k) => k.id === 'gear')).toMatchObject({ name: 'Stuff', icon: '▣' })
    expect(categoryList(c)).toHaveLength(9)
    // deleting the player's category: the item falls back to the guess; nothing else changes
    const d = deleteCategory(c, added.id)
    expect(item(d, 'g').category).toBeUndefined()
    expect(itemCategory(d, item(d, 'g')).name).toBe('Stuff')
    // deleting a rename brings the built-in name back
    expect(categoryList(deleteCategory(d, 'gear')).find((k) => k.id === 'gear')!.name).toBe('Gear')
    // and survives a round trip
    expect(importCharacterJson(JSON.stringify(c)).character).toEqual(c)
  })
  it('an item with a category that is not in the list: it is added, so it is not lost', () => {
    const r = read({ name: 'G', inventory: { items: [{ name: 'Key', category: 'Quest' }] } })
    expect(r.character.inventory.categories).toEqual([{ id: 'Quest', name: 'Quest' }])
    expect(r.warnings).toHaveLength(1)
  })
})

describe('Gear preferences', () => {
  it('defaults, a bad value with a warning, unknown fields kept', () => {
    const r = read({ name: 'P', preferences: { gear: { view: 'tiles', groupBy: 'shelf', show: { weight: false, glow: true } }, theme: 'x' } })
    expect(r.character.preferences.gear).toMatchObject({ view: 'tiles', groupBy: 'container', show: { weight: false, quantity: true, glow: true } })
    expect((r.character.preferences as unknown as Obj).theme).toBe('x')
    expect(r.warnings).toHaveLength(3)
  })
})
