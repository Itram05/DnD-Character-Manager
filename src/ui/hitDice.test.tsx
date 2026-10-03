// Hit Point Dice in the HP window: the pips can be tapped and each die has its own row for spending it to heal.
// Server render only: what the taps do to the hero is tested in model/rest.test.ts.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import type { SheetApi } from './Sheet'
import { HitDiceBlock } from './vitals'

const hero = (used: Record<string, number>) =>
  normalizeCharacter({
    classes: [
      { id: 'fighter', level: 5 },
      { id: 'sorcerer', level: 2 },
    ],
    abilities: { con: 14 },
    combat: { hp: { max: 50, current: 20 }, hitDiceUsed: used },
  }).character

const block = (c: Character) => renderToString(<HitDiceBlock api={{ c, update: () => {}, toast: () => {} } as unknown as SheetApi} />)
const rows = (html: string) => html.split('class="hd-spend hd-with-pips"').slice(1)
const count = (html: string, what: string) => html.split(what).length - 1

describe('Hit Point Dice in the HP window', () => {
  it('one row per die, each with its pips, the roll field, Spend and Roll for me', () => {
    const r = rows(block(hero({ d10: 2 })))
    expect(r).toHaveLength(2)
    expect(r[0]).toContain('>d10<')
    expect(r[1]).toContain('>d6<')
    for (const row of r) {
      expect(row).toContain('type="number"')
      expect(row).toContain('>Spend<')
      expect(row).toContain('>Roll for me<')
    }
    expect(count(r[0], 'class="pip ')).toBe(5)
    expect(count(r[1], 'class="pip ')).toBe(2)
  })
  it('every pip can be tapped: a full one spends, an empty one gives back', () => {
    const [d10, d6] = rows(block(hero({ d10: 2 })))
    expect(count(d10, 'pip-full')).toBe(3)
    expect(count(d10, 'pip-empty')).toBe(2)
    expect(count(d10, 'aria-label="Spend one"')).toBe(3)
    expect(count(d10, 'aria-label="Restore one"')).toBe(2)
    for (const row of [d10, d6]) expect(/class="pip [^"]*"[^>]*disabled/.test(row)).toBe(false)
  })
  it('a die with none left: the pips still give back, healing with it is off', () => {
    const [d10, d6] = rows(block(hero({ d6: 2 })))
    expect(/class="pip [^"]*"[^>]*disabled/.test(d6)).toBe(false)
    expect(count(d6, 'pip-empty')).toBe(2)
    expect(count(d6, 'disabled=""')).toBe(3) // the field, Spend, Roll for me
    expect(count(d10, 'disabled=""')).toBe(1) // only Spend, until a roll is entered
  })
})
