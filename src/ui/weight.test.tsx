// One rounding for every weight on the Gear tab (2026-10-11). Before: three (0.125 on the row, 0.13 on the
// container, 0.1 in the total).
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { formatWeight } from '../model/containers'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import { InventoryView } from './InventoryView'
import type { SheetApi } from './Sheet'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })

describe('formatWeight', () => {
  it('two decimals at most, none when whole', () => {
    expect(formatWeight(12)).toBe('12')
    expect(formatWeight(36.5)).toBe('36.5')
    expect(formatWeight(0.25)).toBe('0.25')
    expect(formatWeight(0.125)).toBe('0.13')
    expect(formatWeight(2.999)).toBe('3')
    expect(formatWeight(0)).toBe('0')
  })
})

describe('the Gear tab', () => {
  const c = normalizeCharacter({
    schemaVersion: 3,
    name: 'W',
    classes: [{ id: 'fighter', level: 1 }],
    inventory: { items: [{ name: 'Feather', weight: 0.125, quantity: 1 }] },
  }).character
  const text = strip(renderToString(<InventoryView api={api(c)} />))
  it('shows one weight the same way on the row, on the container and in both totals', () => {
    expect(text.match(/\b0\.13 lb\./g)).toHaveLength(5)
    expect(text).not.toMatch(/0\.125|0\.1 lb/)
  })
})
