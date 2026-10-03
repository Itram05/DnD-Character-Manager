// The room for a card's title (Cards view), read from index.css as text: the head keeps two lines of room so the
// cards in a row match, and the title has no height of its own. With a height, a title in a smaller font (a long
// name) left room for the top of a third line to show under the "…".
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
/** The body of the first rule that starts a line with exactly this selector. */
const rule = (sel: string) => {
  const from = css.indexOf(`\n${sel} {`)
  return from < 0 ? '' : css.slice(from, css.indexOf('}', from))
}

describe('card title room', () => {
  it('the head keeps the two-line room, the title only clamps', () => {
    expect(rule('.card-head')).toContain('min-height: calc(2 * 1.2 * 0.98rem)')
    expect(rule('.card-name')).not.toMatch(/(^|\s)height:/)
    expect(rule('.card-name')).toContain('line-clamp: 2')
  })
})
