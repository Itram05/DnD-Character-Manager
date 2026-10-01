// Wave 3 against the owner's real hero: the v2 file on the desktop (Grav, Paladin 5 / Sorcerer 9) must
// import as schema 3 without losing a field, and XP and the day timers must work on it.
// Lives outside src/ so the app type-check does not need Node types. A missing file fails here and is skipped in CI (ownerFiles.ts).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importCharacterJson } from '../src/model/normalize'
import { longRest } from '../src/model/rest'
import { addTimer } from '../src/model/timers'
import { setAttunement, spellDcView } from '../src/model/rules'
import { addSessionXp, correctXp, raiseXpToLevel, undoLastXp, xpProgress } from '../src/model/xp'
import { itemPanel, itemTiles, playHiddenReason } from '../src/model/itemPanel'
import { attackInPlay, playCards } from '../src/model/play'
import { GRAV_DESKTOP, expectGravImportWarnings, gravAfterImport, ownerFile } from './ownerFiles'

const GRAV_V2 = GRAV_DESKTOP
const HAVE_GRAV_V2 = ownerFile(GRAV_V2)
describe.skipIf(!HAVE_GRAV_V2)('Grav v2 from the desktop, read by schema 3', () => {
  const text = existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}'
  const raw = JSON.parse(text)
  const { character: c, warnings } = importCharacterJson(text)

  it('is a v2 file and comes out as v3 with every field unchanged but the listed spell bonus conversion', () => {
    expect(raw.schemaVersion).toBe(2)
    expectGravImportWarnings(warnings, { witchFocusPower: false })
    // hand-edited file: the import adds ids and defaults it lacks; every field written in it survives
    expect(JSON.parse(JSON.stringify(c))).toMatchObject(gravAfterImport(raw))
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

describe.skipIf(!HAVE_GRAV_V2)('Grav v2: spell save DC in the head and the XP one-tap fix', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}')
  // Witch Focus needs attunement (fixed in the file 2026-09-29) and his 3 slots are taken: its +1 does not count
  it('DC 18 = 8 + CHA 5 + PB 5 (Witch Focus not attuned); spell attack +13 = CHA 5 + PB 5 + Staff of Ages 3', () => {
    const v = spellDcView(c)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ ability: 'cha', saveDc: 18, attack: 13 })
    expect(v[0].dcParts.filter((p) => p.kind === 'item')).toEqual([])
    expect(v[0].attackParts.filter((p) => p.kind === 'item')).toEqual([{ kind: 'item', label: 'Staff of Ages', value: 3 }])
  })
  it('attuning Witch Focus instead of the Pearl brings the DC back to 19', () => {
    const wf = c.inventory.items.find((i) => i.name === 'Witch Focus')!
    expect(wf).toMatchObject({ requiresAttunement: true, attuned: false, spellDcBonus: 1, description: '+1 spell save DC while attuned.' })
    const pearl = c.inventory.items.find((i) => i.name === 'Pearl of Power')!
    const swapped = setAttunement(setAttunement(c, pearl.id, false).character, wf.id, true)
    expect(swapped.ok).toBe(true)
    expect(spellDcView(swapped.character)[0].saveDc).toBe(19)
  })
  it('"Set to 140,000" brings 91 550 up to level 14 and can be undone', () => {
    const up = raiseXpToLevel(c)
    expect(up.xp).toBe(140000)
    expect(undoLastXp(up).xp).toBe(91550)
  })
})

// Stage 4 of the inventory redesign on his file: the Items section of Play
describe.skipIf(!HAVE_GRAV_V2)('Grav v2: items in Play', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}')
  it('five tiles: only equipped items (and attuned, if needed); Silent Amulet does nothing, scrolls and potions get none', () => {
    // the Crown and the Chain hook are equipped since 2026-10-01 (owner: "I carry the crown and the hook")
    expect(itemTiles(c).map((x) => [x.item.name, x.charges?.max ?? 0])).toEqual([
      ['Staff of Ages', 3],
      ['Pearl of Power', 1],
      ['"Not for a Crown" (+2 longsword)', 1],
      ['Chain hook', 0],
      ['Helm of the Constellation', 1],
    ])
  })
  it('his two unequipped items leave Play (Trident, Spectacles), and the Gear tab says why; Crown and hook stay', () => {
    // until 2026-10-01 the Crown and the Chain hook were unequipped too
    const gone = ['Everfrost Trident', "Nicklaus' Spectacles"]
    const hidden = c.inventory.items.filter((i) => playHiddenReason(c, i) === 'equip').map((i) => i.name)
    expect(hidden).toEqual(gone)
    const names = playCards(c).map((x) => x.name)
    for (const n of ['Everfrost Trident', "Nicklaus' Spectacles"]) expect(names).not.toContain(n)
    expect(names).toContain('"Not for a Crown" (+2 longsword)')
    expect(c.attacks.filter((a) => attackInPlay(c, a)).map((a) => a.name)).toEqual([
      'Staff of Ages (+3)',
      '"Not for a Crown" (+2 longsword)',
      'Chain hook',
      'Fire Bolt',
    ])
    // scrolls and potions stay
    expect(playCards(c).filter((x) => x.kind === 'scroll')).toHaveLength(6)
  })
  it('Staff of Ages gives 4 cards: Temporal Echo, Hourglass Ward, Echo of Ages and its attack; +3 spell attack as a chip', () => {
    const staff = c.inventory.items.find((i) => i.name === 'Staff of Ages')!
    const p = itemPanel(c, staff)
    expect([...p.cards.map((x) => x.name), ...p.attacks.map((a) => a.name)]).toEqual(['Temporal Echo', 'Hourglass Ward', 'Echo of Ages', 'Staff of Ages (+3)'])
    expect(p.chips.map((x) => x.name)).toEqual(['+3 spell attack'])
  })
})
