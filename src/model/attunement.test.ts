// Attunement: the Play screen shows only items you can use now, and the 3-item limit is enforced loudly.
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { featureInPlay, itemInPlay, playCards, playPassives } from './play'
import { MAX_ATTUNED, armorClass, attunedCount, setAttunement } from './rules'
import type { Character } from './types'

const hero = (): Character =>
  normalizeCharacter({
    name: 'A',
    classes: [{ id: 'fighter', level: 5 }],
    features: [
      { id: 'f-web', name: 'Web from wand', activation: 'action', source: { type: 'item', name: 'Wand of Web' } },
      { id: 'f-ring', name: 'Ring aura', activation: 'passive', source: { type: 'item', name: 'ring of protection' } },
      { id: 'f-helm', name: 'Truesight', activation: 'passive', source: { type: 'item', name: 'Helm' } },
      { id: 'f-lost', name: 'Old item power', activation: 'passive', source: { type: 'item', name: 'Sold item' } },
    ],
    inventory: {
      items: [
        { id: 'pot', name: 'Potion', quantity: 2, activation: 'action' },
        { id: 'helm', name: 'Helm', quantity: 1, equipped: true, activation: 'action', charges: { max: 1, recharge: 'long' } },
        { id: 'staff', name: 'Staff', quantity: 1, requiresAttunement: true, attuned: true, activation: 'reaction', charges: { max: 3, recharge: 'dawn' } },
        { id: 'wand', name: 'Wand of Web', quantity: 1, requiresAttunement: true, activation: 'action', charges: { max: 7, recharge: 'dawn' } },
        { id: 'ring', name: 'Ring of Protection', quantity: 1, requiresAttunement: true, acBonus: 1 },
        { id: 'am', name: 'Amulet', quantity: 1, requiresAttunement: true, attuned: true },
        { id: 'pearl', name: 'Pearl', quantity: 1, requiresAttunement: true, attuned: true, activation: 'action' },
      ],
    },
  }).character

const ids = (c: Character) => playCards(c).map((x) => x.id)

describe('Play screen: attunement filter', () => {
  it('itemInPlay: no attunement needed, or attuned', () => {
    expect(itemInPlay({ requiresAttunement: false, attuned: false })).toBe(true)
    expect(itemInPlay({ requiresAttunement: true, attuned: true })).toBe(true)
    expect(itemInPlay({ requiresAttunement: true, attuned: false })).toBe(false)
  })
  it('an item that needs attunement but is not attuned has no card; the rest do', () => {
    const c = hero()
    expect(ids(c)).toEqual(expect.arrayContaining(['pot', 'helm', 'staff', 'pearl']))
    expect(ids(c)).not.toContain('wand')
  })
  it('"equipped" does not decide: an unequipped potion is in Play, an equipped unattuned item is not', () => {
    let c = hero()
    c = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'wand' ? { ...i, equipped: true } : i)) } }
    expect(ids(c)).toContain('pot')
    expect(ids(c)).not.toContain('wand')
  })
  it('features that come from an unattuned item are hidden too (name match ignores case)', () => {
    const c = hero()
    const f = (id: string) => c.features.find((x) => x.id === id)!
    expect(featureInPlay(c, f('f-web'))).toBe(false)
    expect(ids(c)).not.toContain('f-web')
    expect(playPassives(c).map((x) => x.id)).not.toContain('f-ring')
    expect(playPassives(c).map((x) => x.id)).toContain('f-helm')
    // the item is gone from the bag: the feature stays visible rather than vanishing silently
    expect(playPassives(c).map((x) => x.id)).toContain('f-lost')
  })
  it('attuning brings the item and its feature onto the Play screen', () => {
    let c = setAttunement(hero(), 'am', false).character
    c = setAttunement(c, 'wand', true).character
    expect(ids(c)).toContain('wand')
    expect(ids(c)).toContain('f-web')
  })
})

describe('attunement limit', () => {
  it('the hero starts at the limit', () => {
    expect(attunedCount(hero())).toBe(MAX_ATTUNED)
  })
  it('a 4th attunement is refused, nothing changes, and the attuned items are named', () => {
    const c = hero()
    const r = setAttunement(c, 'wand', true)
    expect(r.ok).toBe(false)
    expect(r.character).toBe(c)
    if (!r.ok) expect(r.attuned).toEqual(['Staff', 'Amulet', 'Pearl'])
  })
  it('un-attune one, then the 4th fits', () => {
    let c = hero()
    const off = setAttunement(c, 'am', false)
    expect(off.ok).toBe(true)
    c = off.character
    expect(attunedCount(c)).toBe(2)
    const on = setAttunement(c, 'wand', true)
    expect(on.ok).toBe(true)
    expect(attunedCount(on.character)).toBe(3)
  })
  it('attuning also equips (so AC bonuses count); un-attuning keeps equipped', () => {
    let c = setAttunement(hero(), 'pearl', false).character
    expect(armorClass(c).parts.some((p) => p.label === 'Ring of Protection')).toBe(false)
    c = setAttunement(c, 'ring', true).character
    const ring = c.inventory.items.find((i) => i.id === 'ring')!
    expect(ring).toMatchObject({ attuned: true, equipped: true })
    expect(armorClass(c).parts.some((p) => p.label === 'Ring of Protection')).toBe(true)
    c = setAttunement(c, 'ring', false).character
    expect(c.inventory.items.find((i) => i.id === 'ring')).toMatchObject({ attuned: false, equipped: true })
  })
  it('items that do not need attunement cannot be attuned; unknown ids change nothing', () => {
    const c = hero()
    expect(setAttunement(c, 'pot', true).character).toBe(c)
    expect(setAttunement(c, 'nope', true).character).toBe(c)
  })
})
