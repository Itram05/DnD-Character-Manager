// Stage 4 on screen (server render, no browser): the Items section of Play (folded on a phone, open on a
// computer), an item's panel with its cards and chips, the item picker in the attack editor.
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { itemPanel } from '../model/itemPanel'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import { AttackEditor } from './editors'
import { ItemPanel, ItemsSection } from './ItemsSection'
import { PlayView } from './PlayView'
import { playSections } from './playSections'
import type { SheetApi } from './Sheet'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })
const onComputer = (render: () => string) => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }), localStorage: { getItem: () => null, setItem() {} } })
  try {
    return render()
  } finally {
    vi.unstubAllGlobals()
  }
}

const c = normalizeCharacter({
  schemaVersion: 3,
  name: 'Grav',
  abilities: { cha: 20 },
  classes: [{ id: 'sorcerer', level: 9 }],
  attacks: [{ name: 'Staff of Ages (+3)', damage: '1d6', ability: 'spell' }],
  inventory: {
    items: [
      {
        id: 'st',
        name: 'Staff of Ages',
        equipped: true,
        requiresAttunement: true,
        attuned: true,
        spellAttackBonus: 3,
        charges: { max: 3, used: 1, recharge: 'dawn' },
        powers: [
          { id: 'echo', name: 'Temporal Echo', activation: 'reaction', cost: 'all', description: 'Rewind.' },
          { id: 'ward', name: 'Hourglass Ward', activation: 'bonus', cost: 1, description: 'Absorb Elements.' },
          { id: 'init', name: 'Echo of Ages', activation: 'special', cost: 1, description: 'Initiative.' },
        ],
      },
      { id: 'wand', name: 'Wand of Web', requiresAttunement: true, attuned: false, charges: { max: 7, used: 0, recharge: 'none' }, activation: 'action' },
    ],
  },
}).character
const staff = c.inventory.items[0]

describe('the Items section', () => {
  it('phone: folded to one line "Items (1)" above the hands; no tiles until opened', () => {
    const html = renderToString(<PlayView api={api(c)} />)
    expect(strip(html)).toContain('Items ( 1 )')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('class="item-tile"')
    // before the Action hand in the page
    expect(html.indexOf('id="play-items"')).toBeLessThan(html.indexOf('id="play-action"'))
  })
  it('phone, opened: the tiles, with the charges as dots; the un-attuned wand has none', () => {
    const tiles = [{ item: staff, charges: { left: 2, max: 3 } }]
    const html = renderToString(<ItemsSection id="x" tiles={tiles} collapsible onOpen={() => {}} initiallyOpen />)
    expect(strip(html)).toContain('Staff of Ages')
    expect(html).toContain('aria-label="2 of 3 charges left"')
    expect(html.match(/class="dot full"/g)).toHaveLength(2)
    expect(html.match(/class="dot empty"/g)).toHaveLength(1)
  })
  it('computer: always open, no fold button; Wand of Web (not attuned) gets no tile', () => {
    const html = onComputer(() => renderToString(<PlayView api={api(c)} />))
    const section = html.slice(html.indexOf('id="play-items"'), html.indexOf('</section>', html.indexOf('id="play-items"')))
    expect(section).toContain('class="item-tile"')
    expect(section).not.toContain('items-toggle')
    expect(strip(section)).toContain('Staff of Ages')
    expect(section).not.toContain('Wand of Web')
  })
  it('the quick navigation lists Items right before the hands', () => {
    const nav = playSections({ mana: true, passives: 2, items: 3, hands: [{ zone: 'action', cards: [{ key: 'k' } as never] }], passivesFirst: true })
    expect(nav.map((s) => s.label)).toEqual(['Spell slots', 'Concentration', 'Always on', 'Items', 'Action'])
    expect(playSections({ mana: true, passives: 0, items: 0, hands: [], passivesFirst: true }).map((s) => s.label)).not.toContain('Items')
  })
})

describe("an item's panel", () => {
  it('Staff of Ages: 4 cards (3 powers + the attack) and the +3 spell attack chip', () => {
    const view = itemPanel(c, staff)
    const cards = [...view.cards.map((x) => <div key={x.key}>{x.name}</div>), ...view.attacks.map((a) => <div key={a.id}>{a.name}</div>)]
    const s = strip(renderToString(<ItemPanel view={view} cards={cards} mode="cards" onChip={() => {}} onClose={() => {}} />))
    expect(s).toContain('Cards ( 4 )')
    for (const n of ['Temporal Echo', 'Hourglass Ward', 'Echo of Ages', 'Staff of Ages (+3)', '+3 spell attack', '2 of 3 charges left']) expect(s).toContain(n)
  })
})

describe('the attack editor', () => {
  it('has "Made with the item" with the linked item chosen, and "(no item)"', () => {
    const html = renderToString(<AttackEditor api={api(c)} initial={c.attacks[0]} onClose={() => {}} />)
    expect(strip(html)).toContain('Made with the item')
    expect(html).toContain('<option value="">(no item)</option>')
    expect(html).toMatch(/<option value="st" selected="">Staff of Ages<\/option>/)
  })
})
