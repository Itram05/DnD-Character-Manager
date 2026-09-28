// Colour by category on spells, scrolls and item powers: which categories colour a card and in what
// order, and which cards get it at all. (The colours in both themes: tests/categoryColours.test.ts.)
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_PRIORITY, colourCategories } from '../model/tags'
import { cardCategories } from './categoryMarks'
import { GameCard, type CardFace } from './GameCard'

const face = (over: Partial<CardFace>): CardFace => ({
  key: 'k',
  kind: 'spell',
  id: 'x',
  name: 'Hold Person',
  frame: 'spell',
  sourceLabel: 'Wizard',
  zone: 'action',
  cost: '2',
  spellLevel: 2,
  text: 'A humanoid makes a Wisdom saving throw or has the Paralyzed condition.',
  tapped: false,
  ...over,
})

describe('category colour: which categories', () => {
  it('the priority order: Damage, Healing, Control, Defense, Buff, Mobility, Summon, Utility', () => {
    expect(CATEGORY_PRIORITY).toEqual(['damage', 'healing', 'control', 'defense', 'buff', 'mobility', 'summon', 'utility'])
    expect([...CATEGORY_PRIORITY].sort()).toEqual([...CATEGORIES].sort())
  })
  it('only categories count, by priority, at most two', () => {
    expect(colourCategories(['fire', 'control', 'damage', 'concentration', 'staff'])).toEqual(['damage', 'control'])
    expect(colourCategories(['buff', 'defense', 'mobility'])).toEqual(['defense', 'buff'])
    expect(colourCategories(['utility'])).toEqual(['utility'])
    expect(colourCategories(['fire', 'ritual'])).toEqual([])
    expect(colourCategories(undefined)).toEqual([])
  })
  it('spells, scrolls and item powers are coloured; features, items, potions and attacks are not', () => {
    const tags = ['damage']
    for (const kind of ['spell', 'scroll', 'power'] as const) expect(cardCategories({ kind, tags })).toEqual(['damage'])
    for (const kind of ['feature', 'item', 'potion', 'attack'] as const) expect(cardCategories({ kind, tags })).toEqual([])
  })
})

describe('category colour: on the card', () => {
  it('two categories: a band in two halves, first by priority, and an icon for each', () => {
    const html = renderToString(<GameCard card={face({ tags: ['control', 'damage', 'fire'] })} mode="cards" onOpen={() => {}} />)
    expect(html).toContain('has-cat cat-damage')
    expect([...html.matchAll(/cat-seg cat-(\w+)/g)].map((m) => m[1])).toEqual(['damage', 'control'])
    expect(html).toContain('aria-label="Damage"')
    expect(html).toContain('aria-label="Control"')
  })
  it('the level stands in the corner; a cantrip shows "C"', () => {
    expect(renderToString(<GameCard card={face({ tags: ['control'] })} mode="cards" onOpen={() => {}} />)).toMatch(/gem gem-spell [^"]*"[^>]*>2</)
    expect(renderToString(<GameCard card={face({ cost: 'C', spellLevel: 0, tags: ['damage'] })} mode="cards" onOpen={() => {}} />)).toMatch(/gem-cantrip[^>]*>C</)
  })
  it('the list row gets the band and the icons too', () => {
    const html = renderToString(<GameCard card={face({ tags: ['healing'] })} mode="list" onOpen={() => {}} />)
    expect(html).toContain('card-row frame-spell has-cat cat-healing')
    expect(html).toContain('cat-seg cat-healing')
    expect(html).toContain('aria-label="Healing"')
  })
  it('a feature keeps its frame, with no band', () => {
    const html = renderToString(<GameCard card={face({ kind: 'feature', frame: 'class', tags: ['damage'] })} mode="cards" onOpen={() => {}} />)
    expect(html).not.toContain('has-cat')
    expect(html).not.toContain('cat-band')
  })
})
