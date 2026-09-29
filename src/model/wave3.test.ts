// Wave 3 (first part): XP from the session split between the players, level thresholds, the XP log
// with undo; day timers, the Long Rest taking a day off, Undo; schema version 3 and the migration from 2.
import { describe, expect, it } from 'vitest'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { longRest, shortRest } from './rest'
import { addTimer, editTimer, nudgeTimer, passDays, removeTimer, restartTimer, sortedTimers } from './timers'
import { CURRENT_SCHEMA_VERSION, type Character } from './types'
import { XP_TABLE, addSessionXp, correctXp, levelForXp, setPartySize, splitXp, undoLastXp, xpForLevel, xpProgress } from './xp'

const make = (raw: Record<string, unknown> = {}) => normalizeCharacter(raw).character

// Grav: Paladin 5 / Sorcerer 9 = character level 14
const grav = (xp: number) => make({ name: 'Grav', xp, classes: [{ id: 'paladin', level: 5 }, { id: 'sorcerer', level: 9 }] })

describe('XP table', () => {
  it('is the 5e table: 300 for level 2, 140 000 for 14, 355 000 for 20', () => {
    expect(XP_TABLE).toHaveLength(20)
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(300)
    expect(xpForLevel(5)).toBe(6500)
    expect(xpForLevel(14)).toBe(140000)
    expect(xpForLevel(15)).toBe(165000)
    expect(xpForLevel(20)).toBe(355000)
  })
  it('levelForXp: the threshold itself counts, one below does not', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(299)).toBe(1)
    expect(levelForXp(300)).toBe(2)
    expect(levelForXp(164999)).toBe(14)
    expect(levelForXp(165000)).toBe(15)
    expect(levelForXp(9999999)).toBe(20)
  })
})

describe('splitting the session XP', () => {
  it('divides between the players and rounds down', () => {
    expect(splitXp(5000, 5)).toEqual({ share: 1000, rest: 0 })
    expect(splitXp(1234, 5)).toEqual({ share: 246, rest: 4 })
    expect(splitXp(4, 5)).toEqual({ share: 0, rest: 4 })
  })
  it('never divides by 0 or by a fraction', () => {
    expect(splitXp(100, 0)).toEqual({ share: 100, rest: 0 })
    expect(splitXp(100, 2.7)).toEqual({ share: 50, rest: 0 })
    expect(splitXp(-50, 5)).toEqual({ share: 0, rest: 0 })
  })
  it('the party size defaults to 5 and is kept per hero', () => {
    expect(make().partySize).toBe(5)
    const c = setPartySize(make(), 4)
    expect(c.partySize).toBe(4)
    expect(setPartySize(c, 0).partySize).toBe(1)
    expect(setPartySize(c, 99).partySize).toBe(20)
  })
  it('adds the share, not the group total, and logs it', () => {
    const c = addSessionXp(grav(140000), 12345, 5, '2026-09-29')
    expect(c.xp).toBe(140000 + 2469)
    expect(c.xpLog).toEqual([expect.objectContaining({ date: '2026-09-29', kind: 'session', amount: 2469, groupXp: 12345, players: 5 })])
  })
  it('uses the hero\'s party size when none is given', () => {
    const c = addSessionXp({ ...grav(140000), partySize: 4 }, 1000)
    expect(c.xp).toBe(140250)
  })
  it('a share of 0 changes nothing (same object, nothing logged)', () => {
    const c = grav(140000)
    expect(addSessionXp(c, 3, 5)).toBe(c)
  })
})

describe('progress to the next level uses the TOTAL level (multiclass)', () => {
  it('Paladin 5 / Sorcerer 9 is measured against level 14 → 15', () => {
    const p = xpProgress(grav(152500))
    expect(p.level).toBe(14)
    expect(p.from).toBe(140000)
    expect(p.next).toBe(165000)
    expect(p.fraction).toBeCloseTo(0.5)
    expect(p.missing).toBe(12500)
    expect(p.levelsReady).toBe(0)
    expect(p.belowLevel).toBe(false)
  })
  it('exactly on the threshold = one level ready', () => {
    const p = xpProgress(grav(165000))
    expect(p.levelsReady).toBe(1)
    expect(p.missing).toBe(0)
    expect(p.fraction).toBe(1)
  })
  it('XP for two levels says 2', () => {
    expect(xpProgress(grav(195000)).levelsReady).toBe(2)
  })
  it('XP is never applied by itself: the classes stay as they are', () => {
    const c = addSessionXp(grav(160000), 50000, 5)
    expect(xpProgress(c).levelsReady).toBe(1)
    expect(c.classes.map((k) => k.level)).toEqual([5, 9])
  })
  it('a hero whose XP is below the current level is flagged, nothing is ready', () => {
    const p = xpProgress(grav(91550))
    expect(p.belowLevel).toBe(true)
    expect(p.levelsReady).toBe(0)
    expect(p.fraction).toBe(0)
  })
  it('level 20 has no next level', () => {
    const p = xpProgress(make({ xp: 400000, classes: [{ id: 'wizard', level: 20 }] }))
    expect(p.next).toBeNull()
    expect(p.levelsReady).toBe(0)
    expect(p.missing).toBe(0)
  })
})

describe('XP log: correction and undo of the last entry', () => {
  it('a correction sets the total and is logged with the difference', () => {
    const c = correctXp(grav(91550), 140000, '2026-09-29')
    expect(c.xp).toBe(140000)
    expect(c.xpLog[0]).toMatchObject({ kind: 'correction', amount: 48450 })
    expect(correctXp(c, 140000)).toBe(c)
  })
  it('undo takes back the newest entry only, one step at a time', () => {
    let c = correctXp(grav(0), 140000)
    c = addSessionXp(c, 5000, 5)
    c = addSessionXp(c, 2500, 5)
    expect(c.xp).toBe(141500)
    c = undoLastXp(c)
    expect(c.xp).toBe(141000)
    expect(c.xpLog).toHaveLength(2)
    c = undoLastXp(c)
    expect(c.xp).toBe(140000)
    c = undoLastXp(c)
    expect(c.xp).toBe(0)
    expect(c.xpLog).toEqual([])
    expect(undoLastXp(c)).toBe(c)
  })
  it('undoing a correction downwards gives the XP back', () => {
    const c = correctXp(grav(150000), 140000)
    expect(undoLastXp(c).xp).toBe(150000)
  })
})

const withTimers = () => {
  let c = make({ name: 'T' })
  c = addTimer(c, { name: "King's wedding", days: 3 })
  c = addTimer(c, { name: 'Rent', days: 1, note: '10 gp' })
  c = addTimer(c, { name: 'Old war', days: 0 })
  return c
}

describe('day timers', () => {
  it('add, edit and delete', () => {
    let c = withTimers()
    expect(c.timers.map((x) => [x.name, x.days, x.start])).toEqual([["King's wedding", 3, 3], ['Rent', 1, 1], ['Old war', 0, 0]])
    expect(c.timers[1].note).toBe('10 gp')
    const id = c.timers[0].id
    c = editTimer(c, id, { name: 'Wedding', days: 10, note: 'bring a gift' })
    expect(c.timers[0]).toMatchObject({ name: 'Wedding', days: 10, start: 10, note: 'bring a gift' })
    c = removeTimer(c, id)
    expect(c.timers.map((x) => x.name)).toEqual(['Rent', 'Old war'])
  })
  it('sorted by days left, ended ones first', () => {
    const c = withTimers()
    expect(sortedTimers(c.timers).map((x) => x.name)).toEqual(['Old war', 'Rent', "King's wedding"])
  })
  it('manual + and −, never below 0', () => {
    let c = withTimers()
    const rent = c.timers[1].id
    c = nudgeTimer(c, rent, 1)
    expect(c.timers[1].days).toBe(2)
    c = nudgeTimer(nudgeTimer(nudgeTimer(c, rent, -1), rent, -1), rent, -1)
    expect(c.timers[1].days).toBe(0)
    expect(nudgeTimer(c, rent, -1)).toBe(c)
  })
  it('restart puts an ended timer back to the days it was set to', () => {
    let c = withTimers()
    const w = c.timers[0].id
    c = passDays(c, 5).character
    expect(c.timers[0].days).toBe(0)
    c = restartTimer(c, w)
    expect(c.timers[0].days).toBe(3)
  })
  it('"days pass" takes N off every running timer and reports what ended', () => {
    const r = passDays(withTimers(), 2)
    expect(r.character.timers.map((x) => x.days)).toEqual([1, 0, 0])
    expect(r.changes).toEqual([
      expect.objectContaining({ name: "King's wedding", from: 3, to: 1, ended: false }),
      expect.objectContaining({ name: 'Rent', from: 1, to: 0, ended: true }),
    ])
  })
  it('nothing running = nothing changes (same object)', () => {
    const c = make({ timers: [{ name: 'Done', days: 0 }] })
    expect(passDays(c, 3).character).toBe(c)
    expect(passDays(withTimers(), 0).changes).toEqual([])
  })
})

describe('Long Rest takes 1 day off every timer', () => {
  it('−1 on the running ones, ended ones stay at 0, and says which just ended', () => {
    const r = longRest(withTimers())
    expect(r.character.timers.map((x) => x.days)).toEqual([2, 0, 0])
    expect(r.timers).toEqual([
      expect.objectContaining({ name: "King's wedding", from: 3, to: 2, ended: false }),
      expect.objectContaining({ name: 'Rent', from: 1, to: 0, ended: true }),
    ])
  })
  it('a Short Rest does not touch them', () => {
    const r = shortRest(withTimers())
    expect(r.character.timers.map((x) => x.days)).toEqual([3, 1, 0])
    expect(r.timers).toEqual([])
  })
  it('Undo: the rest leaves the character before it untouched, so going back to it (↶) restores every timer', () => {
    const before = withTimers()
    const snapshot = structuredClone(before)
    const after = longRest(before).character
    expect(after).not.toBe(before)
    expect(before).toEqual(snapshot)
    // the sheet's ↶ puts the previous object back: the timers are what they were
    const undone: Character = before
    expect(undone.timers.map((x) => x.days)).toEqual([3, 1, 0])
  })
})

describe('schema version 3 and the migration from 2', () => {
  const v2 = {
    schemaVersion: 2,
    name: 'Grav',
    xp: 91550,
    classes: [{ id: 'paladin', level: 5, subclass: 'Oath of Vengeance' }, { id: 'sorcerer', level: 9 }],
    spells: [{ name: 'Aid', level: 2, tags: ['buff'] }],
    inventory: { items: [{ name: 'Staff of Ages', charges: { max: 3, used: 1, recharge: 'dawn' }, powers: [{ name: 'Temporal Echo', cost: 1 }] }] },
    homebrew: { kept: true },
  }
  it('the app writes version 3', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3)
    expect(make().schemaVersion).toBe(3)
  })
  it('a v2 file gets the defaults and loses nothing', () => {
    const { character, warnings } = normalizeCharacter(structuredClone(v2))
    expect(character.schemaVersion).toBe(3)
    expect(character.xp).toBe(91550)
    expect(character.partySize).toBe(5)
    expect(character.xpLog).toEqual([])
    expect(character.timers).toEqual([])
    expect(JSON.parse(JSON.stringify(character))).toMatchObject({ ...v2, schemaVersion: 3 })
    // only the unknown field is mentioned
    expect(warnings).toEqual([expect.stringMatching(/^homebrew: not a field/)])
  })
  it('a v3 file with XP log and timers survives export and import unchanged', () => {
    let c = normalizeCharacter(structuredClone(v2)).character
    c = correctXp(c, 140000, '2026-09-29')
    c = addSessionXp(c, 10000, 5, '2026-09-30')
    c = setPartySize(c, 4)
    c = addTimer(c, { name: 'Rent', days: 7, note: 'Inn' })
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([expect.stringMatching(/^homebrew: not a field/)])
    expect(again.character).toEqual(c)
  })
  it('hand-written timers and log are forgiven', () => {
    const { character, warnings } = normalizeCharacter({ timers: ['Book', { name: 'War', days: '12' }, { name: 'Bad', days: -3 }], xpLog: [{ amount: '250', date: '2026-09-01' }], partySize: 0 })
    expect(character.timers.map((x) => [x.name, x.days, x.start])).toEqual([['Book', 0, 0], ['War', 12, 12], ['Bad', 0, 0]])
    expect(character.xpLog[0]).toMatchObject({ kind: 'session', amount: 250 })
    expect(character.partySize).toBe(1)
    expect(warnings.some((w) => w.startsWith('timers[2].days'))).toBe(true)
    expect(warnings.some((w) => w.startsWith('partySize'))).toBe(true)
  })
})
