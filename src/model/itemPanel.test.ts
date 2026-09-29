// Stage 4 of the inventory redesign (2026-09-29): attacks linked to their item (Attack.itemId), and the
// Items section of Play: one tile per item in play, a panel with the item's cards.
import { describe, expect, it } from 'vitest'
import { itemPanel, itemTiles, playHiddenReason } from './itemPanel'
import { importCharacterJson, itemForAttackName, normalizeCharacter } from './normalize'
import { attackInPlay, playCards, playPassivePowers, spendPower } from './play'
import type { Item } from './types'

const item = (name: string, extra: Partial<Item> = {}): Item => ({ id: name, name, quantity: 1, equipped: false, requiresAttunement: false, attuned: false, ...extra })

const staff = {
  id: 'st',
  name: 'Staff of Ages',
  equipped: true,
  requiresAttunement: true,
  attuned: true,
  spellAttackBonus: 3,
  charges: { max: 3, used: 0, recharge: 'dawn' },
  powers: [
    { id: 'echo', name: 'Temporal Echo', activation: 'reaction', cost: 'all', description: 'Rewind.' },
    { id: 'ward', name: 'Hourglass Ward', activation: 'bonus', cost: 1, description: 'Absorb Elements.' },
    { id: 'init', name: 'Echo of Ages', activation: 'special', cost: 1, description: 'Initiative.' },
    { id: 'ageless', name: 'Ageless', activation: 'passive', description: 'You do not age.' },
  ],
}
const hero = (items: unknown[], attacks: unknown[] = [], features: unknown[] = []) =>
  normalizeCharacter({ schemaVersion: 3, name: 'Grav', abilities: { cha: 20 }, classes: [{ id: 'sorcerer', level: 9 }], inventory: { items }, attacks, features })

describe('an attack finds its item by name (only when the file has no itemId)', () => {
  const items = [item('Staff of Ages'), item('Staff'), item('Dagger'), item('Dagger', { id: 'd2', equipped: true })]
  it('"Staff of Ages (+3)" -> Staff of Ages: the longest item name the attack name starts with', () => {
    expect(itemForAttackName('Staff of Ages (+3)', items)?.name).toBe('Staff of Ages')
    expect(itemForAttackName('staff  of ages', items)?.name).toBe('Staff of Ages')
    expect(itemForAttackName('Staff strike', items)?.name).toBe('Staff')
  })
  it('whole words only: "Staffordshire" is not the Staff; nothing matches -> undefined', () => {
    expect(itemForAttackName('Staffordshire knot', items)).toBeUndefined()
    expect(itemForAttackName('Fire Bolt', items)).toBeUndefined()
  })
  it('two items of one name: the equipped one', () => {
    expect(itemForAttackName('Dagger (thrown)', items)?.id).toBe('d2')
  })
})

describe('Attack.itemId on read', () => {
  it('links by name with a warning; no match -> null, silently; a second read changes nothing', () => {
    const r = hero([staff], [{ name: 'Staff of Ages (+3)', damage: '1d6' }, { name: 'Fire Bolt', damage: '2d10' }])
    expect(r.character.attacks.map((a) => a.itemId)).toEqual(['st', null])
    expect(r.warnings).toEqual([`attacks[0]: "Staff of Ages (+3)" is now linked to the item "Staff of Ages" (by name); change it in the attack's editor.`])
    const again = importCharacterJson(JSON.stringify(r.character))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(r.character)
  })
  it('null is a choice: an item added later with the same name does not link it', () => {
    const r = hero([staff, item('Fire Bolt')], [{ name: 'Fire Bolt', damage: '2d10', itemId: null }])
    expect(r.character.attacks[0].itemId).toBeNull()
    expect(r.warnings).toEqual([])
  })
  it('an explicit link wins over the name; a link to a missing item becomes null with a warning', () => {
    const r = hero([staff, item('Dagger')], [{ name: 'Dagger', damage: '1d4', itemId: 'st' }, { name: 'Club', damage: '1d4', itemId: 'gone' }])
    expect(r.character.attacks.map((a) => a.itemId)).toEqual(['st', null])
    expect(r.warnings).toEqual([`attacks[1]: "Club" was linked to an item that is not in the inventory; the link was removed.`])
  })
})

describe('the Items section of Play', () => {
  const wand = { id: 'wand', name: 'Wand of Web', requiresAttunement: true, attuned: false, charges: { max: 7, used: 0, recharge: 'none' }, activation: 'action' }
  const pearl = { id: 'pearl', name: 'Pearl of Power', equipped: true, requiresAttunement: true, attuned: true, charges: { max: 1, used: 0, recharge: 'dawn' }, activation: 'action' }
  const rope = { id: 'rope', name: 'Rope' }
  const scroll = { id: 'sc', name: 'Scroll of Shatter', activation: 'action' }
  const potion = { id: 'po', name: 'Potion of Climbing', activation: 'action' }
  const hook = { id: 'hook', name: 'Chain hook', equipped: true }
  const c = hero(
    [staff, wand, pearl, rope, scroll, potion, hook],
    [{ name: 'Staff of Ages (+3)', damage: '1d6' }, { name: 'Chain hook', damage: '1d6' }],
    [{ name: 'Timeless', source: { type: 'item', name: 'Staff of Ages' }, activation: 'passive', description: 'Ageless.' }],
  ).character

  it('a tile per item in play that does something; not the un-attuned wand, the plain rope, scrolls or potions', () => {
    expect(itemTiles(c).map((x) => [x.item.name, x.charges])).toEqual([
      ['Staff of Ages', { left: 3, max: 3 }],
      ['Pearl of Power', { left: 1, max: 1 }],
      ['Chain hook', undefined], // only its linked attack
    ])
  })
  it('Staff of Ages: its 3 active powers and its attack (4 cards); the bonus, the passive power and the feature as chips', () => {
    const p = itemPanel(c, c.inventory.items.find((i) => i.id === 'st')!)
    expect(p.cards.map((x) => x.name)).toEqual(['Temporal Echo', 'Hourglass Ward', 'Echo of Ages'])
    expect(p.attacks.map((a) => a.name)).toEqual(['Staff of Ages (+3)'])
    expect(p.cards.length + p.attacks.length).toBe(4)
    expect(p.chips.map((x) => x.name)).toEqual(['+3 spell attack', 'Ageless', 'Timeless'])
  })
  it('an item without powers is its own card (Pearl of Power); the panel cards are the hand cards (same key)', () => {
    const p = itemPanel(c, c.inventory.items.find((i) => i.id === 'pearl')!)
    expect(p.cards.map((x) => [x.kind, x.name])).toEqual([['item', 'Pearl of Power']])
    const handKeys = playCards(c).map((x) => x.key)
    for (const it of c.inventory.items) for (const card of itemTiles(c).some((x) => x.item.id === it.id) ? itemPanel(c, it).cards : []) expect(handKeys).toContain(card.key)
  })
  it('not equipped: no tile, no cards, no linked attack, no chips; the Gear tab says why', () => {
    const off = (id: string) => ({ ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === id ? { ...i, equipped: false } : i)) } })
    const noHook = off('hook')
    expect(itemTiles(noHook).map((x) => x.item.name)).toEqual(['Staff of Ages', 'Pearl of Power'])
    expect(noHook.attacks.filter((a) => attackInPlay(noHook, a)).map((a) => a.name)).toEqual(['Staff of Ages (+3)'])
    expect(playHiddenReason(noHook, noHook.inventory.items.find((i) => i.id === 'hook')!)).toBe('equip')
    const noStaff = off('st')
    expect(itemTiles(noStaff).map((x) => x.item.name)).toEqual(['Pearl of Power', 'Chain hook'])
    expect(playCards(noStaff).some((x) => x.itemId === 'st')).toBe(false)
    expect(playPassivePowers(noStaff)).toEqual([])
    expect(noStaff.attacks.filter((a) => attackInPlay(noStaff, a)).map((a) => a.name)).toEqual(['Chain hook'])
    // the wand: not equipped and not attuned; the rope does nothing at the table; scrolls and potions need no "equipped"
    const reason = (id: string) => playHiddenReason(c, c.inventory.items.find((i) => i.id === id)!)
    expect([reason('wand'), reason('rope'), reason('sc'), reason('po'), reason('st')]).toEqual(['both', null, null, null, null])
  })
  it('spending from the panel is spending the item: the tile shows the charge gone', () => {
    const ward = itemPanel(c, c.inventory.items.find((i) => i.id === 'st')!).cards.find((x) => x.name === 'Hourglass Ward')!
    const after = spendPower(c, ward.id)
    expect(itemTiles(after)[0].charges).toEqual({ left: 2, max: 3 })
  })
})
