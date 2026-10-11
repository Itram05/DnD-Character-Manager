// The small Edit button on each section of Play, and the window behind it (2026-10-11). Server render, no browser.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import { setPlayPref } from '../model/prefs'
import type { Character } from '../model/types'
import { PlayView } from './PlayView'
import { SectionEditor, moveAttack, type SectionSpec } from './SectionEdit'
import type { SheetApi } from './Sheet'
import { StatsView } from './StatsView'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })

const c = normalizeCharacter({
  schemaVersion: 3,
  name: 'Sections',
  classes: [{ id: 'cleric', level: 5 }],
  features: [
    { id: 'dv', name: 'Darkvision', source: { type: 'species', name: 'Dwarf' }, activation: 'passive', description: 'See in the dark.' },
    { id: 'cd', name: 'Channel Divinity', source: { type: 'class', name: 'Cleric 2' }, activation: 'action', uses: { max: 2, used: 0, recharge: 'short' }, description: 'Turn.' },
  ],
  attacks: [
    { id: 'm', name: 'Mace', ability: 'str', damage: '1d6', itemId: null },
    { id: 'x', name: 'Crossbow', ability: 'dex', damage: '1d8', itemId: null },
  ],
  spells: [{ id: 'bl', name: 'Bless', level: 1, castingTime: 'Action', prepared: true }],
  inventory: { items: [{ id: 'rod', name: 'Rod', equipped: true, charges: { max: 3, used: 0, recharge: 'dawn' }, activation: 'action' }, { id: 'ar', name: 'Arrows', quantity: 20 }] },
  playCounters: [{ name: 'Arrows' }],
}).character

const labels = (html: string) => [...html.matchAll(/class="section-edit" aria-label="([^"]+)"/g)].map((m) => m[1])

describe('the Edit button of each Play section', () => {
  const html = renderToString(<PlayView api={api(c)} />)
  it('is on every section that holds something', () => {
    // (server render = phone width: Spell slots and Healing potions are inside the folded Resources block)
    expect(labels(html).sort()).toEqual(['Edit: Action: Attacks', 'Edit: Action: Features', 'Edit: Action: Items', 'Edit: Action: Spells', 'Edit: Always on', 'Edit: Counters', 'Edit: Items'])
  })
  it('is gone when the preference says so', () => {
    expect(labels(renderToString(<PlayView api={api(setPlayPref(c, 'editButtons', false))} />))).toEqual([])
  })
  it('Stats: Abilities, Spellcasting and Proficiencies lead to the Edit tab', () => {
    expect(labels(renderToString(<StatsView api={api(c)} />))).toEqual(['Edit: Abilities', 'Edit: Spellcasting', 'Edit: Proficiencies'])
  })
})

describe('the window behind it', () => {
  const attacks: SectionSpec = { title: 'Action · Attacks', entries: [{ kind: 'attack', id: 'm' }], add: 'attack', tab: 'stats', anchor: 'stats-attacks', reorder: true }
  it('attacks: every attack of the file in its order, arrows, Add, and the way to the tab', () => {
    const text = strip(renderToString(<SectionEditor api={api(c)} spec={attacks} onClose={() => {}} />))
    expect(text).toContain('Edit: Action · Attacks')
    expect(text.indexOf('Mace')).toBeLessThan(text.indexOf('Crossbow'))
    expect(text).toContain('+ Add attack')
    expect(text).toContain('Open the Stats tab')
    expect(text).toContain('The arrows change the order of the attack cards.')
  })
  it('attacks sorted A to Z: no arrows, and it says where to change that', () => {
    const html = renderToString(<SectionEditor api={api(setPlayPref(c, 'attackOrder', 'name'))} spec={attacks} onClose={() => {}} />)
    expect(html).not.toContain('se-move')
    expect(strip(html)).toContain('sorted A to Z')
  })
  it('a name opens the editor of that thing', () => {
    expect(strip(renderToString(<SectionEditor api={api(c)} spec={attacks} onClose={() => {}} initiallyEditing={0} />))).toContain('Edit attack')
    const items: SectionSpec = { title: 'Items', entries: [{ kind: 'item', id: 'rod' }], add: 'item', tab: 'gear' }
    expect(strip(renderToString(<SectionEditor api={api(c)} spec={items} onClose={() => {}} initiallyEditing={0} />))).toContain('Edit item')
  })
  it('counters: each with Unpin', () => {
    const text = strip(renderToString(<SectionEditor api={api(c)} spec={{ title: 'Counters', entries: [{ kind: 'counter', name: 'Arrows' }], tab: 'gear' }} onClose={() => {}} />))
    expect(text).toMatch(/Arrows × ?20 Unpin/)
  })
  it('spell slots: the class table, and "my own" off', () => {
    const html = renderToString(<SectionEditor api={api(c)} spec={{ title: 'Spell slots', entries: [], slots: true, tab: 'edit' }} onClose={() => {}} />)
    expect([...html.matchAll(/aria-label="Level \d[^"]*"[^>]*value="(\d)"|value="(\d)"[^>]*aria-label="Level \d/g)].map((m) => m[1] ?? m[2]).join('')).toBe('432000000')
    expect(html).toMatch(/<input type="checkbox"(?! checked)/)
  })
  it('something that is gone is simply not listed', () => {
    const html = renderToString(<SectionEditor api={api(c)} spec={{ title: 'X', entries: [{ kind: 'feature', id: 'nope' }], tab: 'features' }} onClose={() => {}} />)
    expect(html).not.toContain('se-rows')
  })
})

describe('moveAttack', () => {
  it('swaps with the neighbour; the ends stay', () => {
    expect(moveAttack(c, 'm', 1).attacks.map((a) => a.id)).toEqual(['x', 'm'])
    expect(moveAttack(c, 'm', -1)).toBe(c)
    expect(moveAttack(c, 'x', 1)).toBe(c)
    expect(moveAttack(c, 'nope', 1)).toBe(c)
  })
})
