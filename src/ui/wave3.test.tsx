// Wave 3 on screen (server render, no browser): the XP panel on the Level Up tab with the split shown
// before adding, the "new level" signal in the name row, the day timers (top of Story) with the ended
// ones first, and no Days entry in Play's quick navigation any more.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import { addTimer } from '../model/timers'
import type { Character } from '../model/types'
import { correctXp } from '../model/xp'
import { playSections } from './playSections'
import { Sheet, type SheetApi } from './Sheet'
import { TimersPanel } from './TimersPanel'
import { XpPanel } from './XpPanel'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const settings = { theme: 'dark', view: 'cards' } as const
const grav = (xp: number) => normalizeCharacter({ name: 'Grav', xp, classes: [{ id: 'paladin', level: 5 }, { id: 'sorcerer', level: 9 }] }).character
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings, setSettings: () => {}, go: () => {} })
const sheet = (c: Character, tab: 'play' | 'level' | 'story') =>
  renderToString(<Sheet initial={c} tab={tab} onTab={() => {}} onBack={() => {}} settings={settings} setSettings={() => {}} onRules={() => {}} />)

describe('XP panel', () => {
  it('shows the total, level 14 → 15 and what is missing', () => {
    const s = strip(renderToString(<XpPanel api={api(grav(152500))} />))
    expect(s).toContain('152,500 XP')
    expect(s).toContain('Level 14 · 140,000')
    expect(s).toContain('Level 15 · 165,000')
    expect(s).toContain('12,500 XP to level 15.')
    expect(s).toContain('XP from the session (whole group)')
  })
  it('says how many levels are ready', () => {
    expect(strip(renderToString(<XpPanel api={api(grav(195000))} />))).toContain('2 new levels ready')
  })
  it('XP behind the level: says so, offers the level minimum, progress still 14 → 15 (never "level 11/13")', () => {
    const s = strip(renderToString(<XpPanel api={api(grav(91550))} />))
    expect(s).toContain('XP is behind your level 14 (needs 140,000).')
    expect(s).toContain('Set to 140,000')
    expect(s).toContain('Correct total')
    expect(s).toContain('Level 14 · 140,000')
    expect(s).toContain('Level 15 · 165,000')
    expect(s).toContain('73,450 XP to level 15.')
    expect(s).not.toMatch(/Level 1[1-3]/)
  })
  it('once the XP reaches the level, the warning and the button are gone', () => {
    const s = strip(renderToString(<XpPanel api={api(grav(140000))} />))
    expect(s).not.toContain('behind your level')
    expect(s).not.toContain('Set to')
  })
  it('offers Undo of the newest entry with its amount', () => {
    expect(strip(renderToString(<XpPanel api={api(correctXp(grav(91550), 140000))} />))).toContain('Undo +48,450')
  })
  it('sits on the Level Up tab above the class choice', () => {
    const html = sheet(grav(152500), 'level')
    expect(html.indexOf('xp-panel')).toBeGreaterThan(-1)
    expect(html.indexOf('xp-panel')).toBeLessThan(html.indexOf('levelup-pick'))
  })
})

describe('"new level" signal in the name row', () => {
  it('appears only when the XP reaches the next level', () => {
    expect(sheet(grav(152500), 'play')).not.toContain('level-ready')
    const html = sheet(grav(170000), 'play')
    expect(html).toContain('level-ready')
    expect(strip(html)).toContain('New level ready')
    // in the name row, not in the sticky head
    expect(html.indexOf('level-ready')).toBeLessThan(html.indexOf('sheet-head'))
  })
})

describe('day timers on the Story tab', () => {
  let c = grav(140000)
  c = addTimer(c, { name: 'Wedding', days: 12 })
  c = addTimer(c, { name: 'Rent', days: 0 })
  c = addTimer(c, { name: 'Book', days: 2, note: 'chapter 4' })
  it('fewest days first, the ended one marked, with Restart and Delete', () => {
    const html = renderToString(<TimersPanel api={api(c)} id="story-days" />)
    const s = strip(html)
    expect(s.indexOf('Rent')).toBeLessThan(s.indexOf('Book'))
    expect(s.indexOf('Book')).toBeLessThan(s.indexOf('Wedding'))
    expect(s).toContain('Rent Ended Restart Delete')
    expect(s).toContain('chapter 4')
    expect(html).toContain('timer ended')
    expect(s).toContain('Days pass:')
  })
  it('an empty list explains itself', () => {
    expect(strip(renderToString(<TimersPanel api={api(grav(0))} id="story-days" />))).toContain('A Long Rest takes 1 day off each')
  })
  it('sit at the very top of Story, and are gone from Play and its quick navigation', () => {
    const story = sheet(c, 'story')
    expect(story).toContain('id="story-days"')
    expect(story.indexOf('story-days')).toBeLessThan(story.indexOf('story-read'))
    expect(story.indexOf('story-days')).toBeLessThan(story.indexOf('sessions'))
    expect(strip(story)).toContain('Days pass:')
    const play = sheet(c, 'play')
    expect(play).not.toContain('days')
    expect(play).not.toContain('class="panel timers')
    const nav = playSections({ mana: true, passives: 2, hands: [], passivesFirst: true })
    expect(nav.some((x) => /days/.test(x.id) || x.label === 'Days')).toBe(false)
  })
})
