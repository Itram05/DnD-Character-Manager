// Wave 3 against the owner's real hero: the v2 file on the desktop (Grav, Paladin 5 / Sorcerer 9) must
// import as schema 3 without losing a field, and XP and the day timers must work on it.
// Lives outside src/ so the app type-check does not need Node types; skipped where the file is missing (CI).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importCharacterJson } from '../src/model/normalize'
import { longRest } from '../src/model/rest'
import { addTimer } from '../src/model/timers'
import { addSessionXp, correctXp, xpProgress } from '../src/model/xp'

const GRAV_V2 = 'C:/Users/User/Desktop/grav-srashtite-lv14.json'
describe.skipIf(!existsSync(GRAV_V2))('Grav v2 from the desktop, read by schema 3', () => {
  const text = existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}'
  const raw = JSON.parse(text)
  const { character: c, warnings } = importCharacterJson(text)

  it('is a v2 file and comes out as v3 with every field unchanged', () => {
    expect(raw.schemaVersion).toBe(2)
    expect(warnings).toEqual([])
    // hand-edited file: the import adds ids and defaults it lacks; every field written in it survives
    expect(JSON.parse(JSON.stringify(c))).toMatchObject({ ...raw, schemaVersion: 3 })
    expect(c.xp).toBe(91550)
    expect([c.partySize, c.xpLog, c.timers]).toEqual([5, [], []])
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('is level 14 in total; its XP (91 550, from an old sheet) is flagged as below the level', () => {
    const p = xpProgress(c)
    expect(p.level).toBe(14)
    expect(p.belowLevel).toBe(true)
    expect(p.levelsReady).toBe(0)
  })
  it('after a correction to 140 000 and a session of 30 000 for 5 players: 146 000, level 15 at 165 000', () => {
    const x = addSessionXp(correctXp(c, 140000), 30000, 5)
    expect(x.xp).toBe(146000)
    expect(xpProgress(x)).toMatchObject({ next: 165000, missing: 19000, levelsReady: 0 })
    expect(xpProgress(addSessionXp(x, 100000, 5)).levelsReady).toBe(1)
  })
  it('a Long Rest moves its timers and still does everything else', () => {
    const x = addTimer(c, { name: 'Rent', days: 2 })
    const r = longRest(x)
    expect(r.character.timers[0].days).toBe(1)
    expect(r.character.combat.hp.current).toBe(r.character.combat.hp.max)
  })
})
