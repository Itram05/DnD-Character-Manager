// Quick navigation on the Play screen: which sections are listed (after the filter), in which order,
// and that every listed section exists on the page with the class that keeps it clear of the sticky head.
// Server render only (phone width, no scrolling here); the scrolling itself is checked by hand.
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchesFilter, selectedKinds, selectedZones } from '../model/filter'
import { importCharacterJson } from '../model/normalize'
import { playCards, playPassivePowers, playPassives } from '../model/play'
import type { CardFace } from './GameCard'
import { PlayView } from './PlayView'
import { playHands, playSections } from './playSections'
import { SIDE_NAV_SIDE, SectionNavMenu, SectionNavSide } from './SectionNav'
import { loadSideNavCollapsed, saveSideNavCollapsed } from '../model/storage'
import type { SheetApi } from './Sheet'

import sampleText from '../../examples/sample-character.json?raw'

const { character: c } = importCharacterJson(sampleText)
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const api: SheetApi = { c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} }
const cards = playCards(c) as CardFace[]
const passives = playPassives(c).length + playPassivePowers(c).length

const sectionsFor = (filter: string[], passivesFirst = true) => {
  const shown = cards.filter((x) => matchesFilter(x, filter))
  const hands = playHands(selectedZones(filter), shown, selectedKinds(filter).length !== 1)
  return playSections({ mana: true, passives, hands, passivesFirst })
}

describe('quick navigation: the list', () => {
  it('computer order: slots, concentration, always on, then each hand with its kinds indented', () => {
    const s = sectionsFor([])
    expect(s.slice(0, 3).map((x) => x.id)).toEqual(['play-mana', 'play-conc', 'play-field'])
    const action = s.findIndex((x) => x.id === 'play-action')
    expect(action).toBeGreaterThan(2)
    expect(s[action].sub).toBeFalsy()
    expect(s[action + 1].sub).toBe(true)
    // the counts add up to the hand's count
    const kids = []
    for (let i = action + 1; i < s.length && s[i].sub; i++) kids.push(s[i])
    expect(kids.reduce((n, k) => n + (k.n ?? 0), 0)).toBe(s[action].n)
  })
  it('phone order: "Always on" comes after the hands, like on the screen', () => {
    const s = sectionsFor([], false)
    expect(s[s.length - 1].id).toBe('play-field')
  })
  it('follows the filter: an emptied hand is not listed, a single kind is not split', () => {
    const onlySpells = sectionsFor(['kind:spell'])
    expect(onlySpells.some((x) => x.sub)).toBe(false)
    for (const x of onlySpells.filter((x) => x.n !== undefined && x.id !== 'play-field')) expect(x.n).toBeGreaterThan(0)
    const actionOnly = sectionsFor(['zone:action'])
    expect(actionOnly.some((x) => x.id === 'play-bonus' || x.id === 'play-reaction')).toBe(false)
    expect(actionOnly.some((x) => x.id === 'play-action')).toBe(true)
  })
})

describe('quick navigation: on the page', () => {
  const html = renderToString(<PlayView api={api} />)
  it('every listed section is on the page and keeps clear of the sticky head (nav-target)', () => {
    // the phone starts on the Action hand
    for (const x of sectionsFor(['zone:action'], false)) expect(html).toMatch(new RegExp(`id="${x.id}" class="[^"]*nav-target`))
  })
  it('a phone gets the "§" button (closed), not the side column', () => {
    expect(html).toContain('section-btn')
    expect(html).not.toContain('section-nav side')
    expect(html).not.toContain('section-list')
  })
  it('the open list shows the sections with their counts', () => {
    const list = strip(renderToString(<SectionNavMenu sections={sectionsFor(['zone:action'], false)} initiallyOpen />))
    expect(list).toContain('Spell slots')
    expect(list).toContain('Concentration')
    expect(list).toMatch(/Action \d+/)
    expect(list).toMatch(/Always on \d+$/)
  })
})

describe('quick navigation: folding the side column', () => {
  const sections = sectionsFor([])
  it('unfolded: the heading, the list and an arrow toward the edge that hides it', () => {
    const html = renderToString(<SectionNavSide sections={sections} initiallyCollapsed={false} />)
    expect(html).toContain('section-list')
    expect(html).toContain('aria-label="Hide the section list"')
    expect(html).toContain('aria-expanded="true"')
    expect(strip(html)).toContain(SIDE_NAV_SIDE === 'right' ? '»' : '«')
  })
  it('folded: only the arrow, turned back, that shows it again', () => {
    const html = renderToString(<SectionNavSide sections={sections} initiallyCollapsed />)
    expect(html).toContain('section-nav side collapsed')
    expect(html).not.toContain('section-list')
    expect(html).not.toContain('<h4')
    expect(html).toContain('aria-label="Show the section list"')
    expect(html).toContain('aria-expanded="false"')
    expect(strip(html)).toBe(SIDE_NAV_SIDE === 'right' ? '«' : '»')
  })
})

describe('quick navigation: the folded state is remembered', () => {
  afterEach(() => vi.unstubAllGlobals())
  const fakeStorage = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
  }
  it('saved and read back', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() })
    expect(loadSideNavCollapsed()).toBe(false)
    saveSideNavCollapsed(true)
    expect(loadSideNavCollapsed()).toBe(true)
    saveSideNavCollapsed(false)
    expect(loadSideNavCollapsed()).toBe(false)
  })
  it('storage that throws: unfolded, and saving does not crash', () => {
    const boom = () => {
      throw new Error('denied')
    }
    vi.stubGlobal('window', { localStorage: { getItem: boom, setItem: boom, removeItem: boom } })
    expect(loadSideNavCollapsed()).toBe(false)
    expect(saveSideNavCollapsed(true).ok).toBe(false)
  })
  it('no storage at all (server render): unfolded', () => {
    expect(loadSideNavCollapsed()).toBe(false)
    expect(renderToString(<SectionNavSide sections={sectionsFor([])} />)).not.toContain('collapsed')
  })
})
