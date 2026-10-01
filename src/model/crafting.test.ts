// Inventory rework stage 5: crafting recipes, "Craft ×N" and counters in Play.
import { describe, expect, it } from 'vitest'
import { deleteItem, mergeStacks, splitStack } from './containers'
import {
  RECIPE_EXAMPLES,
  bumpCounter,
  cleanRecipe,
  countOf,
  counterViews,
  craft,
  craftStatus,
  deleteRecipe,
  movePin,
  outputHome,
  putIn,
  recipeFromExample,
  recipesUsing,
  renameAcross,
  saveRecipe,
  stacksOf,
  takeOut,
  togglePin,
} from './crafting'
import { importCharacterJson, normalizeCharacter } from './normalize'
import type { Character, Recipe } from './types'

type Obj = Record<string, unknown>
const named = (c: Character, name: string) => c.inventory.items.filter((i) => i.name === name)

/** An alchemist: herbs in two stacks (backpack and pouch), vials, one potion, a Bag of Holding item. */
const alchemist = (extra: Obj = {}): Character =>
  normalizeCharacter({
    schemaVersion: 3,
    name: 'Alchemist',
    classes: [{ id: 'wizard', level: 3 }],
    attacks: [{ id: 'atk-dart', name: 'Dart', itemId: 'dart-a' }],
    inventory: {
      containers: [
        { id: 'backpack', name: 'Backpack' },
        { id: 'pouch', name: 'Pouch' },
        { id: 'boh', name: 'Bag of Holding', itemId: 'boh-item', weightless: true },
      ],
      items: [
        { id: 'herb-a', name: 'Moonpetal', quantity: 3, category: 'material', weight: 0.1, containerId: 'backpack' },
        { id: 'herb-b', name: 'moonpetal ', quantity: 4, category: 'material', weight: 0.1, containerId: 'pouch' },
        { id: 'vial', name: 'Empty vial', quantity: 2, category: 'material', containerId: 'backpack' },
        { id: 'pot', name: 'Potion of Healing', quantity: 1, weight: 0.5, description: 'Regain 2d4 + 2 HP.', containerId: 'pouch' },
        { id: 'boh-item', name: 'Bag of Holding', quantity: 1, containerId: 'backpack' },
        { id: 'dart-a', name: 'Dart', quantity: 1, containerId: 'backpack' },
        { id: 'dart-b', name: 'Dart', quantity: 5, containerId: 'pouch' },
      ],
    },
    recipes: [
      {
        id: 'r-heal',
        name: 'Potion of Healing',
        inputs: [
          { name: 'Moonpetal', quantity: 2 },
          { name: 'Empty vial', quantity: 1 },
        ],
        output: { name: 'Potion of Healing', quantity: 1 },
        tool: 'Herbalism Kit',
      },
    ],
    ...extra,
  }).character

const ok = <T extends { ok: boolean; character: Character }>(r: T) => {
  expect(r.ok).toBe(true)
  return r as Extract<T, { ok: true }>
}

describe('counting by name', () => {
  it('every stack of a name counts, in any container, case and spaces ignored', () => {
    const c = alchemist()
    expect(stacksOf(c, 'MOONPETAL').map((i) => i.id)).toEqual(['herb-a', 'herb-b'])
    expect(countOf(c, ' moonpetal')).toBe(7)
    expect(countOf(c, 'Nothing')).toBe(0)
    expect(countOf(c, '')).toBe(0)
  })
  it('a bag (an item that is a container) never counts as a material', () => {
    expect(countOf(alchemist(), 'Bag of Holding')).toBe(0)
  })
})

describe('craft status', () => {
  it('how many times it can be made: the scarcest input decides', () => {
    const c = alchemist()
    // 7 Moonpetal / 2 = 3, 2 vials / 1 = 2
    expect(craftStatus(c, c.recipes[0]).max).toBe(2)
  })
  it('missing for N: which input and how many', () => {
    const c = alchemist()
    const s = craftStatus(c, c.recipes[0], 4)
    expect(s.parts).toEqual([
      { name: 'Moonpetal', need: 8, have: 7, short: 1 },
      { name: 'Empty vial', need: 4, have: 2, short: 2 },
    ])
    expect(s.missing.map((p) => `${p.short} ${p.name}`)).toEqual(['1 Moonpetal', '2 Empty vial'])
  })
  it('the same input listed twice needs both', () => {
    const s = craftStatus(alchemist(), { inputs: [{ name: 'Moonpetal', quantity: 4 }, { name: 'moonpetal', quantity: 4 }] })
    expect(s.max).toBe(0)
    expect(s.parts).toEqual([{ name: 'Moonpetal', need: 8, have: 7, short: 1 }])
  })
  it('a recipe without inputs can always be made', () => {
    expect(craftStatus(alchemist(), { inputs: [] }).max).toBe(Infinity)
  })
})

describe('Craft ×N', () => {
  it('short: refused, nothing changes, and it says what is missing', () => {
    const c = alchemist()
    const r = craft(c, 'r-heal', 3, 'pouch')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('missing')
    expect(r.character).toBe(c)
    expect(r.missing).toEqual([{ name: 'Empty vial', need: 3, have: 2, short: 1 }])
  })
  it('exactly enough: the inputs run out, the last stack stays at 0, the output is made', () => {
    const c = alchemist()
    const r = ok(craft(c, 'r-heal', 2, 'pouch'))
    const x = r.character
    expect(countOf(x, 'Empty vial')).toBe(0)
    expect(named(x, 'Empty vial')).toHaveLength(1) // kept at 0: weight, description, category stay known
    expect(countOf(x, 'Moonpetal')).toBe(3)
    expect(countOf(x, 'Potion of Healing')).toBe(3)
    expect(r.made).toMatchObject({ name: 'Potion of Healing', quantity: 2, itemId: 'pot', containerId: 'pouch' })
    expect(r.used).toEqual([
      { name: 'Moonpetal', quantity: 4 },
      { name: 'Empty vial', quantity: 2 },
    ])
  })
  it('more than enough: only what one craft needs × N is taken', () => {
    const c = alchemist()
    const x = ok(craft(c, 'r-heal', 1, 'pouch')).character
    expect(countOf(x, 'Moonpetal')).toBe(5)
    expect(countOf(x, 'Empty vial')).toBe(1)
    expect(countOf(x, 'Potion of Healing')).toBe(2)
  })
  it('stacks are emptied in order; an emptied stack goes when another of that name has some left', () => {
    const c = alchemist()
    // 4 Moonpetal: all 3 from the backpack stack, 1 from the pouch stack; the backpack one is removed
    const x = ok(craft(c, 'r-heal', 2, 'pouch')).character
    expect(named(x, 'Moonpetal')).toHaveLength(0)
    expect(stacksOf(x, 'Moonpetal').map((i) => [i.id, i.quantity])).toEqual([['herb-b', 3]])
  })
  it('equipped stacks are taken last', () => {
    const c = alchemist()
    const eq = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'herb-a' ? { ...i, equipped: true } : i)) } }
    const x = takeOut(eq, 'Moonpetal', 4)
    expect(stacksOf(x, 'Moonpetal').map((i) => [i.id, i.quantity])).toEqual([['herb-a', 3]])
  })
  it('an emptied stack with an attack: the attack moves to the stack that is left', () => {
    const x = takeOut(alchemist(), 'Dart', 1)
    expect(stacksOf(x, 'Dart').map((i) => i.id)).toEqual(['dart-b'])
    expect(x.attacks[0].itemId).toBe('dart-b')
  })
  it('the output merges into the stack of that name in the chosen container', () => {
    const x = ok(craft(alchemist(), 'r-heal', 1, 'pouch')).character
    expect(named(x, 'Potion of Healing')).toHaveLength(1)
    expect(named(x, 'Potion of Healing')[0]).toMatchObject({ id: 'pot', quantity: 2 })
  })
  it('another container: a new stack there, a copy of the one you have (description, weight)', () => {
    const r = ok(craft(alchemist(), 'r-heal', 1, 'boh'))
    const made = r.character.inventory.items.find((i) => i.id === r.made.itemId)!
    expect(made).toMatchObject({ name: 'Potion of Healing', quantity: 1, containerId: 'boh', weight: 0.5, description: 'Regain 2d4 + 2 HP.', equipped: false })
    expect(made.id).not.toBe('pot')
    expect(countOf(r.character, 'Potion of Healing')).toBe(2)
  })
  it('a new thing: from the template when there is one, else a plain item', () => {
    let c = saveRecipe(alchemist(), { id: 'r-oil', name: 'Oil', inputs: [], output: { name: 'Glow oil', quantity: 2, template: { category: 'material', weight: 1, tags: ['light'] } } })
    const r = ok(craft(c, 'r-oil', 3, 'backpack'))
    expect(r.character.inventory.items.at(-1)).toMatchObject({ name: 'Glow oil', quantity: 6, category: 'material', weight: 1, tags: ['light'], containerId: 'backpack' })
    c = saveRecipe(alchemist(), { id: 'r-x', name: 'X', inputs: [], output: { name: 'Thing', quantity: 1 } })
    expect(ok(craft(c, 'r-x', 1)).character.inventory.items.at(-1)).toMatchObject({ name: 'Thing', quantity: 1, description: '', equipped: false, attuned: false, containerId: 'backpack' })
  })
  it('a template with powers: each crafted item gets its own power ids', () => {
    const c = saveRecipe(alchemist(), { id: 'r-w', name: 'Wand', inputs: [], output: { name: 'Wand', quantity: 1, template: { powers: [{ id: 'p1', name: 'Zap', activation: 'action', description: '' }] } } })
    const a = ok(craft(c, 'r-w', 1, 'backpack'))
    const b = ok(craft(a.character, 'r-w', 1, 'pouch'))
    const ids = b.character.inventory.items.filter((i) => i.name === 'Wand').flatMap((i) => i.powers!.map((p) => p.id))
    expect(new Set([...ids, 'p1']).size).toBe(3)
  })
  it('the recipe remembers the container; the next craft starts there', () => {
    const c = alchemist()
    expect(outputHome(c, c.recipes[0])).toBe('pouch') // where the potion already is
    const x = ok(craft(c, 'r-heal', 1, 'boh')).character
    expect(x.recipes[0].containerId).toBe('boh')
    expect(ok(craft(x, 'r-heal', 1)).made.containerId).toBe('boh')
  })
  it('bad amounts and a missing recipe are refused', () => {
    const c = alchemist()
    for (const n of [0, -1, 1.5, NaN]) expect(craft(c, 'r-heal', n)).toMatchObject({ ok: false, reason: 'bad-amount' })
    expect(craft(c, 'nope', 1)).toMatchObject({ ok: false, reason: 'not-found' })
  })
  it('the whole craft is one change: going back to the character before it is one Undo', () => {
    // the sheet keeps the character before each update; Craft is one update, so the snapshot before it is all of it
    const before = alchemist()
    const after = ok(craft(before, 'r-heal', 2, 'boh')).character
    expect(after).not.toBe(before)
    expect(before.inventory.items.map((i) => [i.id, i.quantity])).toEqual(alchemist().inventory.items.map((i) => [i.id, i.quantity]))
    expect(before.recipes[0].containerId).toBeUndefined()
  })
  it('fractions: 0.5 lb of silver per craft', () => {
    const c = saveRecipe(alchemist({ inventory: { items: [{ name: 'Silver', quantity: 1.5 }] } }), { id: 'r-s', name: 'Ring', inputs: [{ name: 'Silver', quantity: 0.5 }], output: { name: 'Ring', quantity: 1 } })
    expect(craftStatus(c, c.recipes[1]).max).toBe(3)
    expect(countOf(ok(craft(c, 'r-s', 3)).character, 'Silver')).toBe(0)
  })
})

describe('putting in and taking out', () => {
  it('putIn never adds to an attuned stack', () => {
    const c = normalizeCharacter({ inventory: { items: [{ id: 'r', name: 'Ring', quantity: 1, requiresAttunement: true, attuned: true }] } }).character
    const x = putIn(c, 'Ring', 1, 'backpack').character
    expect(named(x, 'Ring').map((i) => [i.quantity, i.attuned])).toEqual([
      [1, true],
      [1, false],
    ])
  })
  it('after split and merge the counts stay right (names, not ids)', () => {
    const c = alchemist()
    const s = splitStack(c, 'herb-b', 2, 'backpack')
    expect(countOf(s.character, 'Moonpetal')).toBe(7)
    const m = mergeStacks(s.character, s.newId!, 'herb-a')
    expect(countOf(m.character, 'Moonpetal')).toBe(7)
    expect(craftStatus(m.character, c.recipes[0]).max).toBe(2)
  })
})

describe('a material used in a recipe is deleted', () => {
  it('the recipe stays and shows it missing; the counter shows 0 and + makes it again', () => {
    let c = togglePin(alchemist(), 'Empty vial')
    c = deleteItem(c, 'vial')
    expect(c.recipes[0].inputs.map((p) => p.name)).toEqual(['Moonpetal', 'Empty vial'])
    const s = craftStatus(c, c.recipes[0])
    expect(s.max).toBe(0)
    expect(s.missing).toEqual([{ name: 'Empty vial', need: 1, have: 0, short: 1 }])
    expect(counterViews(c)).toEqual([{ counter: { name: 'Empty vial' }, label: 'Empty vial', count: 0 }])
    const x = bumpCounter(c, 'Empty vial', 1)
    expect(named(x, 'Empty vial')).toMatchObject([{ quantity: 1, containerId: 'backpack' }])
    expect(craftStatus(x, x.recipes[0]).max).toBe(1)
  })
  it('the item editor can say which recipes use a name', () => {
    expect(recipesUsing(alchemist(), 'empty VIAL').map((r) => r.name)).toEqual(['Potion of Healing'])
    expect(recipesUsing(alchemist(), 'Dart')).toEqual([])
  })
})

describe('renaming', () => {
  it('the last stack renamed: recipes and counters follow', () => {
    let c = togglePin(alchemist(), 'Empty vial')
    c = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'vial' ? { ...i, name: 'Glass vial' } : i)) } }
    const x = renameAcross(c, 'Empty vial', 'Glass vial')
    expect(x.recipes[0].inputs[1].name).toBe('Glass vial')
    expect(x.playCounters).toEqual([{ name: 'Glass vial' }])
    expect(craftStatus(x, x.recipes[0]).max).toBe(2)
  })
  it('one of two stacks renamed: nothing follows (the other keeps the old name)', () => {
    const c = alchemist()
    const x = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'herb-a' ? { ...i, name: 'Old moonpetal' } : i)) } }
    expect(renameAcross(x, 'Moonpetal', 'Old moonpetal')).toBe(x)
  })
  it('the output name follows too; two counters that become one name merge', () => {
    let c = togglePin(togglePin(alchemist(), 'Potion of Healing'), 'Healing draught')
    c = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'pot' ? { ...i, name: 'Healing draught' } : i)) } }
    const x = renameAcross(c, 'Potion of Healing', 'Healing draught')
    expect(x.recipes[0].output.name).toBe('Healing draught')
    expect(x.playCounters).toEqual([{ name: 'Healing draught' }])
  })
})

describe('counters in Play', () => {
  it('pin, unpin, order', () => {
    let c = togglePin(togglePin(alchemist(), 'Moonpetal'), 'Dart')
    expect(c.playCounters.map((p) => p.name)).toEqual(['Moonpetal', 'Dart'])
    expect(togglePin(c, 'moonpetal').playCounters.map((p) => p.name)).toEqual(['Dart'])
    c = movePin(c, 'Dart', -1)
    expect(c.playCounters.map((p) => p.name)).toEqual(['Dart', 'Moonpetal'])
    expect(movePin(c, 'Dart', -1)).toBe(c)
    expect(togglePin(c, '  ')).toBe(c)
  })
  it('the total of all stacks; − takes one, + adds one to the first stack; never below 0', () => {
    const c = togglePin(alchemist(), 'Moonpetal')
    expect(counterViews(c)[0]).toMatchObject({ label: 'Moonpetal', count: 7 })
    const less = bumpCounter(c, 'Moonpetal', -1)
    expect(countOf(less, 'Moonpetal')).toBe(6)
    const more = bumpCounter(c, 'Moonpetal', 1)
    expect(stacksOf(more, 'Moonpetal').map((i) => i.quantity)).toEqual([4, 4])
    const none = takeOut(c, 'Moonpetal', 7)
    expect(bumpCounter(none, 'Moonpetal', -1)).toBe(none)
  })
})

describe('recipes: editing and examples', () => {
  it('cleanRecipe: trims, drops empty inputs, output name defaults to the recipe name, empty notes go', () => {
    const r = cleanRecipe({ id: 'x', name: ' Tea ', inputs: [{ name: ' Leaf ', quantity: 2 }, { name: '', quantity: 1 }, { name: 'Water', quantity: 0 }], output: { name: '', quantity: 0 }, note: '  ', time: ' 1 hour ' })
    expect(r).toEqual({ id: 'x', name: 'Tea', inputs: [{ name: 'Leaf', quantity: 2 }], output: { name: 'Tea', quantity: 1 }, time: '1 hour' })
  })
  it('save adds or replaces, delete removes only the recipe', () => {
    const c = alchemist()
    const r: Recipe = { ...c.recipes[0], name: 'Better potion' }
    expect(saveRecipe(c, r).recipes.map((x) => x.name)).toEqual(['Better potion'])
    expect(saveRecipe(c, { ...r, id: 'new' }).recipes).toHaveLength(2)
    const d = deleteRecipe(c, 'r-heal')
    expect(d.recipes).toEqual([])
    expect(d.inventory).toBe(c.inventory)
  })
  it('examples: copies with their own id; none is added by itself', () => {
    expect(normalizeCharacter({}).character.recipes).toEqual([])
    const a = recipeFromExample('potion-of-healing')
    const b = recipeFromExample('potion-of-healing')
    expect(a.id).not.toBe(b.id)
    a.inputs[0].quantity = 99
    expect(RECIPE_EXAMPLES['potion-of-healing'].inputs[0].quantity).toBe(2)
  })
})

describe('reading and writing', () => {
  it('a file without recipes or counters: both empty, silently', () => {
    const r = normalizeCharacter({ schemaVersion: 3, name: 'X' })
    expect(r.character.recipes).toEqual([])
    expect(r.character.playCounters).toEqual([])
    expect(r.warnings).toEqual([])
  })
  it('export and import again: identical and silent (templates too)', () => {
    let c = alchemist()
    c = saveRecipe(c, { ...recipeFromExample('arrows'), inputs: [] })
    c = togglePin(c, 'Moonpetal')
    c = ok(craft(c, c.recipes[1].id, 1)).character
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('forgiving: strings, missing parts, bad amounts, duplicates', () => {
    const r = normalizeCharacter({
      recipes: [
        { id: 'a', name: 'A', inputs: ['Herb', { quantity: 2 }, { name: 'Salt', quantity: -1 }], output: 'Tea' },
        { id: 'a', name: 'B' },
      ],
      playCounters: ['Herb', { name: 'herb' }, {}],
    })
    const [a, b] = r.character.recipes
    expect(a).toEqual({ id: 'a', name: 'A', inputs: [{ name: 'Herb', quantity: 1 }, { name: 'Salt', quantity: 1 }], output: { name: 'Tea', quantity: 1 } })
    expect(b.id).not.toBe('a')
    expect(b.output).toEqual({ name: 'B', quantity: 1 })
    expect(r.character.playCounters).toEqual([{ name: 'Herb' }])
    expect(r.warnings).toEqual([
      'recipes[0].inputs[1]: no item name, ignored.',
      'recipes[0].inputs[2].quantity: -1 is out of range; using 0.',
      'recipes[0].inputs[2].quantity: must be above 0; using 1.',
      'recipes[1]: the id "a" is used by another recipe; this one got a new id.',
      'recipes[1]: no output; it makes 1 "B".',
      'playCounters[1]: "herb" is pinned twice; the second was ignored.',
      'playCounters[2]: no item name, ignored.',
    ])
  })
  it('unknown fields are kept: on a recipe, its parts, its output, its template, a counter', () => {
    const raw = {
      recipes: [{ id: 'a', name: 'A', mood: 'calm', inputs: [{ name: 'Herb', quantity: 1, grade: 'fine' }], output: { name: 'Tea', quantity: 1, flavour: 'mint', template: { weight: 1, colour: 'green' } } }],
      playCounters: [{ name: 'Herb', icon: '🌿' }],
    }
    const r = normalizeCharacter(raw)
    const c = JSON.parse(JSON.stringify(r.character))
    expect(c.recipes[0]).toMatchObject(raw.recipes[0])
    expect(c.playCounters).toEqual(raw.playCounters)
    expect(r.warnings).toHaveLength(5)
  })
  it('a template keeps item fields and drops the ones of one stack (with a warning)', () => {
    const r = normalizeCharacter({ recipes: [{ name: 'A', output: { name: 'Wand', template: { id: 'w', quantity: 5, equipped: true, charges: { max: 7, recharge: 'dawn' }, requiresAttunement: true } } }] })
    expect(r.character.recipes[0].output.template).toEqual({ charges: { max: 7, used: 0, recharge: 'dawn' }, requiresAttunement: true })
    expect(r.warnings).toEqual(['recipes[0].output.template: id, quantity, equipped ignored (a template is not one stack: the crafted item gets its own).'])
  })
})
