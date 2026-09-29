// The phone's "§" list hangs from the tools row's right edge, not from the "§" button: the button sits
// mid-row, and a list right-aligned to it ran off the left edge of a 390px screen. Reads the stylesheet.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const block = (sel: string) => css.match(new RegExp(`\n${sel.replace(/[.]/g, '\.')} \{([^}]*)\}`))?.[1] ?? ''

describe('section menu on a phone', () => {
  it('the "§" wrapper is not the containing block; the tools row is', () => {
    expect(block('.section-anchor')).toContain('position: static;')
    expect(css).toMatch(/\n\.head-tools \{\n  position: relative;\n\}/)
  })
  it('the list stays right-aligned and no wider than the screen', () => {
    const menu = block('.section-nav.menu')
    expect(menu).toContain('right: 0;')
    expect(menu).toContain('width: min(260px, calc(100vw - 1.2rem));')
  })
})
