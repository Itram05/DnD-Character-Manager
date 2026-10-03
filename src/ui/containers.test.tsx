// The Gear tab with containers (inventory stage 2): groups, the bag-in-bag warning, the preferences.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import { InventoryView } from './InventoryView'
import type { SheetApi } from './Sheet'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const gear = (c: Character) => {
  const api: SheetApi = { c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'list' }, setSettings: () => {}, go: () => {} }
  return text(renderToString(<InventoryView api={api} />))
}

const hero = (prefs?: object) =>
  normalizeCharacter({
    name: 'H',
    preferences: prefs,
    inventory: {
      items: [
        { id: 'boh', name: 'Bag of Holding', weight: 15, containerId: 'pack' },
        { id: 'boh2', name: 'Second bag', weight: 15, containerId: 'b1' },
        { id: 'rope', name: 'Rope', quantity: 2, weight: 10, containerId: 'b1' },
        { id: 'gem', name: 'Ruby', category: 'valuable', containerId: 'pack' },
      ],
      containers: [
        { id: 'pack', name: 'Backpack', icon: '🎒' },
        { id: 'b1', name: 'Bag of Holding', itemId: 'boh', weightless: true, extradimensional: true, capacity: 500 },
        { id: 'b2', name: 'Second bag', itemId: 'boh2', weightless: true, extradimensional: true },
      ],
    },
  }).character

describe('Gear tab with containers', () => {
  it('groups by container, marks the bag item, warns about the bag in the bag, counts carried weight', () => {
    const g = gear(hero())
    expect(g).toContain('🎒 Backpack')
    expect(g).toContain('Bag of Holding, items: 2')
    expect(g).toContain('Second bag is inside Bag of Holding')
    expect(g).toContain('35 / 500 lb.')
    expect(g).toContain('Carried weight: 15 lb.')
  })
  it('group by category, and a hidden detail stays hidden', () => {
    const g = gear(hero({ gear: { groupBy: 'category', show: { weight: false } } }))
    expect(g).toContain('◇ Valuables')
    expect(g).not.toContain('20 lb. ')
  })
})
