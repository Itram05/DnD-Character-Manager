// The rest of Exhaustion on the sheet: passive scores, the spell attack (Spells, Stats, the head),
// the level 6 sign, and the rules reference. Server render only.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CHANGES } from '../content/rulesHelp.en'
import { importCharacterJson } from '../model/normalize'
import { castingStats, passiveScoreView } from '../model/rules'
import type { Character } from '../model/types'
import { fmtMod } from './common'
import { Sheet } from './Sheet'

import sampleText from '../../examples/sample-character.json?raw'

const { character: sample } = importCharacterJson(sampleText)
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const settings = { theme: 'dark', view: 'cards' } as const
const sheet = (c: Character, tab: 'play' | 'stats' | 'spells') =>
  renderToString(<Sheet initial={c} tab={tab} onTab={() => {}} onBack={() => {}} settings={settings} setSettings={() => {}} onRules={() => {}} />)
const marks = (html: string) => html.split('class="dis-mark"').length - 1
const section = (html: string, cls: string) => {
  const from = html.indexOf(cls)
  return html.slice(from, html.indexOf('</section>', from))
}
const y2014 = (n: number): Character => ({ ...sample, exhaustion: n, exhaustionRules: '2014' })
const y2024 = (n: number): Character => ({ ...sample, exhaustion: n })

describe('exhaustion: level 6', () => {
  it('a loud death chip and a banner on Stats, by either rules', () => {
    for (const c of [y2014(6), y2024(6)]) {
      const html = sheet(c, 'stats')
      expect(html).toContain('cond-chip exh dead')
      expect(strip(html)).toContain(`☠ Exhaustion 6 (${c.exhaustionRules ?? '2024'}): death`)
      expect(html).toContain('dead-banner')
      expect(sheet(c, 'play')).toContain('cond-chip exh dead')
    }
  })
  it('level 5 has neither', () => {
    for (const c of [y2014(5), y2024(5)]) {
      const html = sheet(c, 'stats')
      expect(html).not.toContain('cond-chip exh dead')
      expect(html).not.toContain('dead-banner')
    }
  })
  it('nothing is locked: the same controls are disabled at level 6 as at level 0', () => {
    const disabled = (html: string) => html.split(' disabled=""').length - 1
    for (const tab of ['play', 'stats', 'spells'] as const) {
      expect(disabled(sheet(y2014(6), tab))).toBe(disabled(sheet(y2014(0), tab)))
      expect(disabled(sheet(y2024(6), tab))).toBe(disabled(sheet(y2024(0), tab)))
    }
  })
})

describe('exhaustion: passive scores on Stats', () => {
  const passives = (c: Character) => strip('<' + section(sheet(c, 'stats'), 'panel passives'))
  const base = (s: 'perception' | 'insight' | 'investigation') => passiveScoreView({ ...sample, exhaustion: 0 }, s).base
  it('none: the plain scores, no note', () => {
    expect(passives(y2024(0))).toContain(`Perception ${base('perception')} Insight ${base('insight')} Investigation ${base('investigation')}`)
    expect(passives(y2024(0))).not.toContain('Exhaustion')
  })
  it('2014, level 1: each is 5 lower, with the reason next to it', () => {
    expect(passives(y2014(1))).toContain(`Perception −5 Exhaustion ${base('perception') - 5} Insight −5 Exhaustion ${base('insight') - 5}`)
  })
  it('2014, level 5: still 5 lower (Disadvantage does not stack)', () => {
    expect(passives(y2014(5))).toContain(`Investigation −5 Exhaustion ${base('investigation') - 5}`)
  })
  it('2024, level 2: each is 4 lower', () => {
    expect(passives(y2024(2))).toContain(`Insight −4 Exhaustion ${base('insight') - 4}`)
  })
  it('the banner no longer tells you to subtract it from the passive scores yourself', () => {
    const html = strip(sheet(y2024(2), 'stats'))
    expect(html).toContain('passive scores, attacks and spell attacks')
    expect(html).not.toContain('Passive scores and other d20 rolls: subtract it yourself')
  })
})

describe('exhaustion: the spell attack', () => {
  const raw = castingStats(sample)[0]
  const limits = (c: Character) => section(sheet(c, 'spells'), 'prepared-summary')
  const chipTitle = (c: Character) => /class="stat-chip dc[^"]*" title="([^"]*)"/.exec(sheet(c, 'play'))?.[1] ?? 'no chip'

  it('the sample hero is a caster (the tests below need one)', () => {
    expect(raw).toBeDefined()
  })
  it('Spells, 2024 level 2: the attack is 4 lower, the DC the same, no DIS', () => {
    const html = limits(y2024(2))
    expect(strip(html)).toContain(`Save DC ${raw.saveDc} · Attack ${fmtMod(raw.attack - 4)}`)
    expect(marks(html)).toBe(0)
  })
  it('Spells, 2014 level 2: the plain attack, no DIS yet', () => {
    const html = limits(y2014(2))
    expect(strip(html)).toContain(`Save DC ${raw.saveDc} · Attack ${fmtMod(raw.attack)}`)
    expect(marks(html)).toBe(0)
  })
  it('Spells, 2014 level 3: DIS next to the attack of every casting class; the number is not changed', () => {
    const html = limits(y2014(3))
    expect(strip(html)).toContain(`Attack ${fmtMod(raw.attack)} DIS`)
    expect(marks(html)).toBe(castingStats(sample).length)
  })
  it('Stats and Spells agree', () => {
    const stats = strip('<' + section(sheet(y2024(3), 'stats'), 'panel casting'))
    expect(stats).toContain(`${raw.saveDc} ${fmtMod(raw.attack - 6)}`)
    expect(strip(limits(y2024(3)))).toContain(`Attack ${fmtMod(raw.attack - 6)}`)
  })
  it('the DC chip in the head tells the attack as rolled now', () => {
    expect(chipTitle(y2024(0))).toContain(fmtMod(raw.attack))
    expect(chipTitle(y2024(2))).toContain(fmtMod(raw.attack - 4))
    expect(chipTitle(y2024(2))).not.toContain('Disadvantage')
    expect(chipTitle(y2014(2))).not.toContain('Disadvantage')
    expect(chipTitle(y2014(3))).toContain(`${fmtMod(raw.attack)} (Disadvantage)`)
  })
  it('the DC in the head never moves', () => {
    const dc = (c: Character) => /class="stat-chip dc[\s\S]*?<b>([^<]*)<\/b>/.exec(sheet(c, 'play'))?.[1]
    expect(dc(y2024(5))).toBe(dc(y2024(0)))
    expect(dc(y2014(5))).toBe(dc(y2024(0)))
  })
})

describe('the rules reference tells both Exhaustion rules', () => {
  it('2014 level by level, 2024 per level, and where the switch is', () => {
    const row = CHANGES.find((x) => x.topic === 'Exhaustion')!
    for (const s of ['Disadvantage on ability checks', 'passive scores are 5 lower', 'Speed halved', 'attack rolls and saving throws', 'Hit Point maximum halved', 'Speed 0', '6 death'])
      expect(row.before).toContain(s)
    for (const s of ['-2 to every D20 Test', '-5 ft Speed', 'Conditions panel', 'DIS']) expect(row.now).toContain(s)
  })
})
