// Crafting in Gear and counters in Play (inventory stage 5), rendered.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import { CountersSection } from './CountersSection'
import { CraftDialog } from './CraftingPanel'
import { InventoryView } from './InventoryView'
import { playSections } from './playSections'
import type { SheetApi } from './Sheet'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const apiFor = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'list' }, setSettings: () => {}, go: () => {} })

const hero = () =>
  normalizeCharacter({
    name: 'H',
    inventory: {
      items: [
        { id: 'h1', name: 'Moonpetal', quantity: 3, category: 'material' },
        { id: 'v', name: 'Empty vial', quantity: 1, category: 'material' },
      ],
    },
    recipes: [{ id: 'r', name: 'Potion of Healing', inputs: [{ name: 'Moonpetal', quantity: 2 }, { name: 'Empty vial', quantity: 1 }], output: { name: 'Potion of Healing', quantity: 1 }, tool: 'Herbalism Kit' }],
    playCounters: [{ name: 'Moonpetal' }, { name: 'Gone thing' }],
  }).character

describe('Gear: crafting', () => {
  it('lists the recipe with what it takes, what you have, how many times', () => {
    const g = text(renderToString(<InventoryView api={apiFor(hero())} />))
    expect(g).toContain('Crafting')
    expect(g).toContain('Potion of Healing can make ×1')
    expect(g).toContain('2 Moonpetal ( 3 )')
    expect(g).toContain('1 Empty vial ( 1 )')
    expect(g).toContain('→ 1 Potion of Healing')
  })
  it('a recipe that cannot be made says what is missing', () => {
    const c = hero()
    const x = { ...c, inventory: { ...c.inventory, items: c.inventory.items.filter((i) => i.id !== 'v') } }
    const g = text(renderToString(<InventoryView api={apiFor(x)} />))
    expect(g).toContain('not enough')
    expect(g).toContain('Missing: 1 Empty vial.')
  })
  it('the counters list in Gear, and the pin on each row', () => {
    const html = renderToString(<InventoryView api={apiFor(hero())} />)
    expect(text(html)).toContain('Moonpetal × 3')
    expect(text(html)).toContain('Gone thing × 0')
    expect(html).toContain('aria-label="Unpin Moonpetal from Play"')
    expect(html).toContain('aria-label="Pin Empty vial as a counter in Play"')
  })
})

describe('Craft dialog', () => {
  it('shows the tool, the table and the target container; Craft is on when there is enough', () => {
    const html = renderToString(<CraftDialog api={apiFor(hero())} recipe={hero().recipes[0]} onClose={() => {}} />)
    const s = text(html)
    expect(s).toContain('Craft: Potion of Healing')
    expect(s).toContain('Herbalism Kit')
    expect(s).toContain('can make ×1')
    expect(s).toContain('Makes 1 Potion of Healing')
    expect(html).toContain('<button class="btn btn-primary">Craft ×1</button>')
  })
  it('short: the missing list, Craft is off', () => {
    const c = hero()
    const x = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'h1' ? { ...i, quantity: 1 } : i)) } }
    const html = renderToString(<CraftDialog api={apiFor(x)} recipe={x.recipes[0]} onClose={() => {}} />)
    expect(text(html)).toContain('Missing: 1 Moonpetal.')
    expect(text(html)).toContain('1 short')
    expect(html).toMatch(/<button class="btn btn-primary" disabled="">Craft ×/)
  })
})

describe('Play: counters', () => {
  it('one row per pinned item with − and +; at 0 the − is off', () => {
    const html = renderToString(<CountersSection api={apiFor(hero())} id="play-counters" />)
    expect(text(html)).toContain('Moonpetal 3')
    expect(html).toContain('class="counter empty"')
    expect(html).toMatch(/<button class="mini-btn" disabled="" aria-label="Use one Gone thing"/)
  })
  it('nothing pinned: no section, no entry in the quick navigation', () => {
    const c = { ...hero(), playCounters: [] }
    expect(renderToString(<CountersSection api={apiFor(c)} id="x" />)).toBe('')
    expect(playSections({ mana: false, passives: 0, counters: 0, hands: [], passivesFirst: true }).map((s) => s.id)).toEqual(['play-conc'])
    expect(playSections({ mana: false, passives: 0, counters: 2, items: 1, hands: [], passivesFirst: true }).map((s) => s.id)).toEqual(['play-conc', 'play-counters', 'play-items'])
  })
})
