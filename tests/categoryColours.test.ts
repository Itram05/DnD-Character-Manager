// Every card category has its colour (--cat-*) in the dark and in the light theme, and a class that
// uses it. Reads the stylesheet from disk: lives outside src/ so the app type-check needs no Node types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../src/model/tags'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('category colours', () => {
  it('each category: a colour in both themes and a .cat-* class', () => {
    for (const c of CATEGORIES) {
      expect(css.match(new RegExp(`--cat-${c}: #`, 'g'))?.length, c).toBe(2)
      expect(css).toContain(`.cat-${c} {\n  --cc: var(--cat-${c});`)
    }
  })
})
