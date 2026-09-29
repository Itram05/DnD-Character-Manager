// The sheet's sticky head: vitals, the tabs (computer), and the screen's own tools (Cards/List,
// the funnel) and active filters. Server render only (no browser here): it runs at phone width and
// without the head's slots, so the tools render in place; the portal itself is checked by hand.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { filterOptions, matchesFilter, spellFilterable } from '../model/filter'
import { importCharacterJson } from '../model/normalize'
import { InHead } from './common'
import { t } from '../i18n'
import { Sheet, type SheetApi } from './Sheet'
import { SpellsView } from './SpellsView'

import sampleText from '../../examples/sample-character.json?raw'

const { character: c } = importCharacterJson(sampleText)
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const settings = { theme: 'dark', view: 'cards' } as const
const sheet = (tab: 'play' | 'spells' | 'stats') =>
  renderToString(<Sheet initial={c} tab={tab} onTab={() => {}} onBack={() => {}} settings={settings} setSettings={() => {}} onRules={() => {}} />)

describe('the sticky head', () => {
  it('holds the vitals and the row for the tabs, tools and active filters', () => {
    const html = sheet('stats')
    const head = html.slice(html.indexOf('class="sheet-head"'), html.indexOf('class="sheet-main"'))
    expect(head).toMatch(/class="vitals( has-dc)?"/)
    expect(head).toContain('class="head-row"')
    expect(head).toContain('class="head-chips"')
    expect(head).toContain('class="head-tools"')
    // a phone keeps its tab bar at the bottom; no Cards/List or funnel on Stats
    expect(html).toContain('tabs-bottom')
    expect(html).not.toContain('filter-btn')
    expect(html).not.toContain('view-toggle')
  })
  it('Play brings Cards/List, the funnel and the phone\'s "Action ✕"; Spells only the funnel', () => {
    const play = sheet('play')
    expect(play).toContain('view-toggle')
    expect(play).toContain('filter-btn')
    expect(strip(play)).toContain('Action ✕')
    const spells = sheet('spells')
    expect(spells).toContain('filter-btn')
    expect(spells).not.toContain('view-toggle')
  })
  it('InHead renders in place without a slot (tests, first render)', () => {
    expect(renderToString(<InHead at={null}>x</InHead>)).toBe('x')
    expect(renderToString(<InHead at={undefined}>y</InHead>)).toBe('y')
  })
})

describe('Spells tab: the Action group in the funnel', () => {
  const items = c.spells.map(spellFilterable)
  it('reads the casting time like the Play hands', () => {
    const zone = (name: string) => spellFilterable(c.spells.find((s) => s.name === name)!).zone
    const byZone = { action: 0, bonus: 0, reaction: 0, other: 0 }
    for (const x of items) byZone[x.zone!]++
    expect(byZone).toEqual({ action: 18, bonus: 5, reaction: 2, other: c.spells.length - 25 })
    expect(c.spells.filter((s) => (s.castingTime ?? '').startsWith('Reaction')).every((s) => zone(s.name) === 'reaction')).toBe(true)
  })
  it('the panel lists it first, with counts, and it narrows the list', () => {
    const groups = filterOptions(items, [])
    expect(groups[0].group).toBe('zone')
    expect(groups[0].options.map((o) => [o.value, o.n])).toEqual([
      ['action', 18],
      ['bonus', 5],
      ['reaction', 2],
      ...(c.spells.length > 25 ? [['other', c.spells.length - 25]] : []),
    ])
    expect(items.filter((x) => matchesFilter(x, ['zone:bonus']))).toHaveLength(5)
    // Action AND Healing: the two groups combine
    const bonusHeal = items.filter((x) => matchesFilter(x, ['zone:bonus', 'cat:healing']))
    expect(bonusHeal.length).toBeLessThanOrEqual(5)
  })
  it('the Spells tab renders its funnel (in place, without the head)', () => {
    const api: SheetApi = { c, update: () => {}, toast: () => {}, settings, setSettings: () => {}, go: () => {} }
    const html = renderToString(<SpellsView api={api} />)
    expect(html).toContain('filter-btn')
    expect(strip(html)).toContain(t('spells.mine'))
  })
})
