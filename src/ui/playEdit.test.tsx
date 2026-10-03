// Edit from the Play screen (feedback of 2026-10-03): the window of an "Always on" chip has an Edit button
// that opens the editor of what the chip comes from, and Edit on an attack card opens the attack editor.
// Server render, no browser.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import { passiveSource, playPassivePowers, playPassives } from '../model/play'
import type { Character } from '../model/types'
import type { CardFace } from './GameCard'
import { CardZoom, PassiveZoom, type PassiveChip } from './PlayView'
import type { SheetApi } from './Sheet'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })
const chip = (key: string, name: string): PassiveChip => ({ key, name, glyph: '•', frame: 'item', source: 'x', description: 'Text.' })

const c = normalizeCharacter({
  schemaVersion: 3,
  name: 'Test',
  classes: [{ id: 'sorcerer', level: 9 }],
  features: [{ id: 'dv', name: 'Darkvision', source: { type: 'species', name: 'Elf' }, activation: 'passive', description: 'You see in the dark.' }],
  inventory: {
    items: [
      {
        id: 'st',
        name: 'Staff of Ages',
        equipped: true,
        spellAttackBonus: 3,
        powers: [{ id: 'calm', name: 'Timeless', activation: 'passive', description: 'You do not age.' }],
      },
    ],
  },
}).character

describe('where an "Always on" chip is edited', () => {
  it('a passive feature: the feature itself', () => {
    expect(passiveSource(c, 'dv')).toEqual({ feature: c.features[0] })
  })
  it('a passive power of an item: the item', () => {
    expect(passiveSource(c, 'calm')).toEqual({ item: c.inventory.items[0] })
  })
  it('a bonus chip ("+3 spell attack", made from the item\'s field): the item', () => {
    expect(passiveSource(c, 'st:spellAttackBonus')).toEqual({ item: c.inventory.items[0] })
  })
  it('every chip on the Play screen has a source', () => {
    const keys = [...playPassives(c).map((f) => f.id), ...playPassivePowers(c).map((x) => x.power.id)]
    expect(keys).toHaveLength(3)
    for (const k of keys) expect(passiveSource(c, k)).toBeDefined()
  })
  it('something that is gone: nothing', () => {
    expect(passiveSource(c, 'nope')).toBeUndefined()
  })
})

describe('Edit on an attack card', () => {
  const hero = normalizeCharacter({
    schemaVersion: 3,
    name: 'Test',
    classes: [{ id: 'fighter', level: 3 }],
    attacks: [{ id: 'ls', name: 'Longsword', ability: 'str', damage: '1d8', damageType: 'slashing', notes: 'Versatile (1d10).' }],
  }).character
  const face: CardFace = { key: 'attack:ls', kind: 'attack', id: 'ls', name: 'Longsword', frame: 'attack', sourceLabel: 'Attack', zone: 'action', cost: 'A', text: '', tapped: false }
  it('the zoomed card has one Edit button', () => {
    const html = renderToString(<CardZoom api={api(hero)} face={face} onClose={() => {}} onUse={() => {}} />)
    expect(html.match(/>Edit<\/button>/g)).toHaveLength(1)
  })
  it('it opens the attack editor in place (it used to only switch to the Stats tab)', () => {
    let went = ''
    const html = renderToString(<CardZoom api={{ ...api(hero), go: (tab) => (went = tab) }} face={face} onClose={() => {}} onUse={() => {}} initiallyEditing />)
    expect(strip(html)).toContain('Edit attack')
    expect(html).toContain('value="Longsword"')
    expect(html).toContain('value="1d8"')
    expect(went).toBe('')
  })
})

describe('the window of a chip', () => {
  it('a feature chip has an Edit button, which opens the feature editor', () => {
    const html = renderToString(<PassiveZoom api={api(c)} chip={chip('dv', 'Darkvision')} onClose={() => {}} />)
    expect(html).toMatch(/<button class="btn"[^>]*>Edit<\/button>/)
    const editor = renderToString(<PassiveZoom api={api(c)} chip={chip('dv', 'Darkvision')} onClose={() => {}} initiallyEditing />)
    expect(strip(editor)).toContain('Edit feature')
    expect(editor).toContain('value="Darkvision"')
  })
  it('an item chip says "Edit item" and opens the item editor, where the power and the bonus field live', () => {
    for (const key of ['calm', 'st:spellAttackBonus']) {
      const html = renderToString(<PassiveZoom api={api(c)} chip={chip(key, 'x')} onClose={() => {}} />)
      expect(html).toMatch(/<button class="btn"[^>]*>Edit item<\/button>/)
      const editor = renderToString(<PassiveZoom api={api(c)} chip={chip(key, 'x')} onClose={() => {}} initiallyEditing />)
      expect(editor).toContain('value="Staff of Ages"')
    }
  })
  it('a chip whose source is gone has no Edit button', () => {
    const html = renderToString(<PassiveZoom api={api(c)} chip={chip('nope', 'Old')} onClose={() => {}} />)
    expect(html).not.toContain('Edit')
  })
})
