// Exhaustion in the head and on Stats: the numbers move and Disadvantage is a visible mark. Server render only.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { importCharacterJson } from '../model/normalize'
import { initiative } from '../model/rules'
import type { Character } from '../model/types'
import { fmtMod } from './common'
import { Sheet } from './Sheet'

import sampleText from '../../examples/sample-character.json?raw'

const { character: sample } = importCharacterJson(sampleText)
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const settings = { theme: 'dark', view: 'cards' } as const
const sheet = (c: Character, tab: 'play' | 'stats') =>
  renderToString(<Sheet initial={c} tab={tab} onTab={() => {}} onBack={() => {}} settings={settings} setSettings={() => {}} onRules={() => {}} />)
const head = (html: string) => html.slice(html.indexOf('class="sheet-head"'), html.indexOf('class="sheet-main"'))
const marks = (html: string) => html.split('class="dis-mark"').length - 1

describe('exhaustion on the sheet', () => {
  it('none: no chip, no mark', () => {
    const html = sheet({ ...sample, exhaustion: 0 }, 'stats')
    expect(html).not.toContain('cond-chip exh')
    expect(marks(html)).toBe(0)
  })
  it('2014, level 2: the chip names the effects, Speed is halved, Initiative and every skill carry DIS', () => {
    const c: Character = { ...sample, exhaustion: 2, exhaustionRules: '2014' }
    const html = sheet(c, 'stats')
    const half = Math.floor(c.combat.speed / 2)
    expect(strip(html)).toContain(`Exhaustion 2 (2014): Disadvantage on ability checks · Speed halved (${half} ft)`)
    expect(head(html)).toContain(`<b>${half}</b>`)
    // Initiative in the head + 18 skills; saves and attacks are not marked before level 3
    expect(marks(head(html))).toBe(1)
    expect(marks(html)).toBe(19)
    expect(head(html)).toContain(`<b>${fmtMod(initiative(c))}</b>`)
  })
  it('2014, level 3: saves and attacks are marked too, also on the attack cards in Play', () => {
    const c: Character = { ...sample, exhaustion: 3, exhaustionRules: '2014' }
    expect(marks(sheet(c, 'stats'))).toBeGreaterThanOrEqual(19 + 6)
    if (c.attacks.length) expect(marks(sheet(c, 'play'))).toBeGreaterThan(1)
  })
  it('2014, level 4: the head shows half the Hit Point maximum', () => {
    const c: Character = { ...sample, exhaustion: 4, exhaustionRules: '2014' }
    const half = Math.floor(c.combat.hp.max / 2)
    expect(head(sheet(c, 'play'))).toContain(`<b>${Math.min(c.combat.hp.current, half)}</b>`)
    expect(strip(head(sheet(c, 'play')))).toContain(`/ ${half}`)
  })
  it('2024, level 2: −4 is in Initiative and Speed is 10 ft lower; no DIS marks', () => {
    const c: Character = { ...sample, exhaustion: 2 }
    const html = sheet(c, 'stats')
    expect(strip(html)).toContain(`Exhaustion 2 (2024): −4 to every d20 roll · Speed −10 ft (${c.combat.speed - 10} ft)`)
    expect(head(html)).toContain(`<b>${fmtMod(initiative(c) - 4)}</b>`)
    expect(head(html)).toContain(`<b>${c.combat.speed - 10}</b>`)
    expect(marks(html)).toBe(0)
  })
})
