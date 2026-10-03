// "Cantrips n/max" and "Prepared n/max" on the Spells tab (2026-10-03): an always-prepared cantrip is outside
// the class's number of cantrips, exactly as an always-prepared spell is outside the prepared limit. Before,
// a Moon Druid's Starry Wisp (given by the subclass, not one of the Druid's own cantrips) made it "Cantrips 3/3".
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import { classColumnValue, classSpellCounts } from '../model/rules'
import type { SheetApi } from './Sheet'
import { SpellsView } from './SpellsView'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const spell = (name: string, level: number, more: Record<string, unknown> = {}) => ({ name, level, source: 'druid', prepared: true, alwaysPrepared: false, castingTime: 'Action', ...more })

// Druid 4, Circle of the Moon: 3 cantrips and 7 prepared spells from the class table
const druid = normalizeCharacter({
  name: 'Moon Druid',
  abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 },
  classes: [{ id: 'druid', level: 4, subclass: 'Circle of the Moon' }],
  spells: [
    spell('Druidcraft', 0),
    spell('Guidance', 0),
    spell('Starry Wisp', 0, { alwaysPrepared: true }),
    spell('Light', 0, { source: 'species' }),
    spell('Cure Wounds', 1),
    spell('Entangle', 1),
    spell('Goodberry', 1, { prepared: false }),
    spell('Moonbeam', 2, { alwaysPrepared: true }),
    spell('Speak with Animals', 1, { source: 'feat' }),
  ],
}).character

describe('what counts against a class\'s spell limits', () => {
  it('the class table gives a Druid 4 three cantrips and seven prepared spells', () => {
    expect([classColumnValue('druid', 'cantrips', 4), classColumnValue('druid', 'prepared-spells', 4)]).toEqual([3, 7])
  })
  it('an always-prepared cantrip is not counted, like an always-prepared spell', () => {
    // cantrips: Druidcraft, Guidance (not Starry Wisp, not the species\' Light)
    // prepared: Cure Wounds, Entangle (not the unprepared Goodberry, not Moonbeam, not the feat\'s spell)
    expect(classSpellCounts(druid, 'druid')).toEqual({ cantrips: 2, prepared: 2 })
  })
  it('without the flag the same cantrip counts', () => {
    const plain = { ...druid, spells: druid.spells.map((s) => ({ ...s, alwaysPrepared: false })) }
    expect(classSpellCounts(plain, 'druid')).toEqual({ cantrips: 3, prepared: 3 })
  })
  it('a spell of another source counts for nobody', () => {
    expect(classSpellCounts(druid, 'species')).toEqual({ cantrips: 1, prepared: 0 })
    expect(classSpellCounts(druid, 'wizard')).toEqual({ cantrips: 0, prepared: 0 })
  })
  it('the Spells tab shows "Cantrips 2/3", and the cantrip is still listed with its ★', () => {
    const api: SheetApi = { c: druid, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} }
    const text = strip(renderToString(<SpellsView api={api} />))
    expect(text).toContain('Cantrips 2/3')
    expect(text).toContain('Prepared 2/7')
    expect(text).toContain('Starry Wisp')
    expect(text).toContain('★')
  })
})
