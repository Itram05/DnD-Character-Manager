// Card titles (Cards view): the size rule for long names, and the full name kept as a tooltip.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TITLE_MIN_REM, TITLE_REM, titleRem } from './cardTitle'
import { GameCard, type CardFace } from './GameCard'

const face = (name: string): CardFace => ({ key: 'k', kind: 'feature', id: 'x', name, frame: 'class', sourceLabel: 'Fighter', zone: 'action', cost: 'A', text: '', tapped: false })

describe('card title size', () => {
  it('a short name keeps the normal size', () => {
    expect(titleRem('Fireball')).toBe(TITLE_REM)
    expect(titleRem('Tasha’s Hideous Laughter'.slice(0, 22))).toBe(TITLE_REM)
  })
  it('a longer name gets smaller, step by step, never below the floor', () => {
    const names = ['Bigby’s Hand of Doomxx', 'Melf’s Minute Meteorsxx', 'Tasha’s Hideous Laughter', 'Leomund’s Tiny Hut of Wonder', 'Mordenkainen’s Magnificent Mansion', 'Staff of the Magi: Retributive Strike, All Charges']
    const sizes = names.map(titleRem)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1])
    expect(sizes[2]).toBeLessThan(TITLE_REM)
    expect(sizes[2]).toBeGreaterThan(TITLE_MIN_REM)
    expect(titleRem('x'.repeat(200))).toBe(TITLE_MIN_REM)
  })
  it('spaces around the name do not count', () => {
    expect(titleRem(`  ${'a'.repeat(22)}  `)).toBe(TITLE_REM)
  })
})

describe('card title on the card', () => {
  it('Cards view: the size is set on the title and the full name is the tooltip', () => {
    const long = 'Mordenkainen’s Magnificent Mansion'
    const html = renderToString(<GameCard card={face(long)} mode="cards" onOpen={() => {}} />)
    expect(html).toContain(`class="card-name" style="font-size:${titleRem(long)}rem" title="${long}"`)
  })
  it('List view is left as it was', () => {
    const html = renderToString(<GameCard card={face('Mordenkainen’s Magnificent Mansion')} mode="list" onOpen={() => {}} />)
    expect(html).not.toContain('font-size')
    expect(html).not.toContain('card-name')
  })
})
