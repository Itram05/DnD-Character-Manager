import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { filterOptions, type Filterable } from '../model/filter'
import { ActiveFilters, FilterButton } from './filter'
import { TagInput, tagLabel } from './tags'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const cards: Filterable[] = [
  { zone: 'action', kind: 'spell', tags: ['damage', 'fire', 'concentration'] },
  { zone: 'action', kind: 'spell', tags: ['damage', 'psychic', 'control'] },
  { zone: 'bonus', kind: 'spell', tags: ['healing'] },
  { zone: 'bonus', kind: 'power', tags: ['buff', 'staff'] },
]
const noop = () => {}

describe('tag chips', () => {
  it('built-in tags get a label, own tags stay as written', () => {
    expect(tagLabel('mobility')).toBe('Mobility')
    expect(tagLabel('fire')).toBe('Fire')
    expect(tagLabel('revive')).toBe('revive')
    // the old vocabulary is no longer built in: shown as written
    expect(tagLabel('aoe')).toBe('aoe')
  })
  it('the editor shows automatic tags apart from own ones and offers the hand-added categories', () => {
    const text = strip(renderToString(<TagInput value={['buff']} onChange={noop} auto={['fire']} />))
    expect(text).toContain('Fire')
    expect(text).toContain('Buff ×')
    for (const s of ['+ Defense', '+ Mobility', '+ Summon']) expect(text).toContain(s)
    expect(text).not.toContain('+ Buff')
    expect(text).not.toContain('+ Area')
  })
})

describe('the funnel filter', () => {
  it('closed: only the funnel, no number when nothing is on', () => {
    const html = renderToString(<FilterButton groups={filterOptions(cards, [])} selected={[]} onChange={noop} />)
    expect(html).toContain('filter-btn')
    expect(html).not.toContain('filter-badge')
    expect(html).not.toContain('filter-panel')
    expect(html).toMatch(/aria-expanded="false"/)
  })
  it('the funnel carries the number of active filters', () => {
    const html = renderToString(<FilterButton groups={filterOptions(cards, ['zone:action', 'dmg:fire'])} selected={['zone:action', 'dmg:fire']} onChange={noop} />)
    expect(strip(html)).toBe('2')
    expect(html).toMatch(/aria-label="Filters: 2 on"/)
  })
  it('open: the groups in order, Damage with its own arrow, types folded, Clear all', () => {
    const html = renderToString(<FilterButton groups={filterOptions(cards, [])} selected={[]} onChange={noop} initiallyOpen />)
    const text = strip(html)
    expect(text).toContain('Action Action 2 Bonus 2 Kind Spells 3 Items 1 Category Damage 2 ▾ Healing 1 Control 1 Buff 1 Properties Concentration 1 Other tags staff 1')
    // the arrow is a separate button, closed
    expect(html).toMatch(/<button class="chip-arrow "[^>]*aria-expanded="false"/)
    expect(text).not.toContain('Fire')
    expect(text).toContain('Clear all')
  })
  it('the arrow shows the damage types; a chosen type opens them by itself and lights up Damage', () => {
    const open = strip(renderToString(<FilterButton groups={filterOptions(cards, [])} selected={[]} onChange={noop} initiallyOpen initiallyOpenDamage />))
    expect(open).toContain('Damage 2 ▴ Healing 1 Control 1 Buff 1 Fire 1 Psychic 1')
    const sel = ['dmg:psychic']
    const html = renderToString(<FilterButton groups={filterOptions(cards, sel)} selected={sel} onChange={noop} initiallyOpen />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Damage/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Psychic/)
  })
  it('the active row: only what is on, each with ✕, in group order; nothing when empty', () => {
    expect(renderToString(<ActiveFilters selected={[]} onChange={noop} />)).toBe('')
    const text = strip(renderToString(<ActiveFilters selected={['other:staff', 'dmg:fire', 'zone:bonus']} onChange={noop} />))
    expect(text).toBe('Bonus ✕ Damage: Fire ✕ staff ✕ Clear all')
  })
})
