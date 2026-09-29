// Cards in a row are as tall as the tallest one, with the foot (Cast/Use, charges) at the bottom, so the
// buttons of a row sit on one line. The text is not clamped any harder for it. Reads the stylesheet;
// the look itself is checked in a browser.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const block = (sel: string) => css.match(new RegExp(`\n${sel.replace(/[.()>:]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`))?.[1] ?? ''

describe('cards in a row', () => {
  it('the grid stretches its slots and the slot stretches the card', () => {
    expect(block('.card-grid')).not.toMatch(/align-items:\s*start/)
    expect(block('.card-slot')).toContain('place-items: stretch center;')
  })
  it('the card is a column with the foot pushed to the bottom', () => {
    expect(block('.card')).toContain('flex-direction: column;')
    expect(block('.card-foot')).toContain('margin-top: auto;')
  })
  it('the text keeps its five lines, as before', () => {
    expect(block('.card-text')).toContain('-webkit-line-clamp: 5;')
  })
  it('a tapped (sideways) card keeps its own height, in the middle of the slot', () => {
    expect(block('.card-slot:has(> .card.tapped)')).toContain('place-items: center;')
  })
})
