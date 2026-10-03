// Wave 3 against the owner's real hero (Grav, Paladin 5 / Sorcerer 9): his file must import as schema 3
// without losing a field, and XP and the day timers must work on it.
// Until 2026-10-03 the file was a hand-edited v2 one; since then it is his own export from the laptop
// (schema 3, Exhaustion 3, 28 items, a day timer). "GRAV_V2" below is only the old name of the path.
// The numbers he rolls with are pinned BEFORE Exhaustion (on a copy with exhaustion 0), and Exhaustion on top.
// Lives outside src/ so the app type-check does not need Node types. Path from OWNER_GRAV_FILE; skipped without it (ownerFiles.ts).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importCharacterJson } from '../src/model/normalize'
import { longRest } from '../src/model/rest'
import { addTimer } from '../src/model/timers'
import { armorClass, attackStats, effectiveHpMax, effectiveSpeed, exhaustionEffects, exhaustionLines, exhaustionRules, initiative, setAttunement, spellDcView } from '../src/model/rules'
import type { Character } from '../src/model/types'
import { addSessionXp, correctXp, raiseXpToLevel, undoLastXp, xpProgress } from '../src/model/xp'
import { itemPanel, itemTiles, playHiddenReason } from '../src/model/itemPanel'
import { attackInPlay, playCards } from '../src/model/play'
import { GRAV_FILE, gravAfterImport, ownerFile } from './ownerFiles'

const GRAV_V2 = GRAV_FILE.path
const HAVE_GRAV_V2 = ownerFile(GRAV_FILE)
/** The hero with no Exhaustion: what his sheet says before the condition takes anything off. */
const rested = (c: Character): Character => ({ ...c, exhaustion: 0 })

describe.skipIf(!HAVE_GRAV_V2)("Grav (the owner's file), read by schema 3", () => {
  const text = existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}'
  const raw = JSON.parse(text)
  const { character: c, warnings } = importCharacterJson(text)

  it('is a v3 file (his own export) and comes back with every field unchanged, nothing to convert, no warning', () => {
    expect(raw.schemaVersion).toBe(3)
    expect(warnings).toEqual([])
    // the import may only add the defaults of what a later version of the app has; every field written in it survives
    expect(JSON.parse(JSON.stringify(c))).toMatchObject(gravAfterImport(raw))
    expect(gravAfterImport(raw)).toEqual(raw)
    expect(c.xp).toBe(91550)
    expect([c.partySize, c.xpLog]).toEqual([5, []])
    // his own day timer (2026-10-03), untouched by the import
    expect(c.timers).toEqual([{ id: raw.timers[0].id, name: 'Наем за къщата в Севера', days: 10, start: 10 }])
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
    // his own timer (10 days) and the new one (2 days) both lose a day
    expect(r.character.timers.map((tm) => [tm.name, tm.days])).toEqual([
      ['Наем за къщата в Севера', 9],
      ['Rent', 1],
    ])
    expect([c.combat.hp.current, r.character.combat.hp.current, r.character.combat.hp.max]).toEqual([15, 98, 98])
  })
})

describe.skipIf(!HAVE_GRAV_V2)('Grav: spell save DC in the head and the XP one-tap fix', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}')
  // Witch Focus needs attunement (fixed in the file 2026-09-29) and his 3 slots are taken: its +1 does not count
  it('DC 18 = 8 + CHA 5 + PB 5 (Witch Focus not attuned); spell attack +13 = CHA 5 + PB 5 + Staff of Ages 3 (before Exhaustion)', () => {
    const v = spellDcView(rested(c))
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
describe.skipIf(!HAVE_GRAV_V2)('Grav: items in Play', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}')
  it('six tiles: only equipped items (and attuned, if needed); Silent Amulet does nothing, scrolls and potions get none', () => {
    // the Crown and the Chain hook are equipped since 2026-10-01 (owner: "I carry the crown and the hook"),
    // Nicklaus' Spectacles since 2026-10-03 (equipped in the app on his laptop)
    expect(itemTiles(c).map((x) => [x.item.name, x.charges?.max ?? 0])).toEqual([
      ['Staff of Ages', 3],
      ['Pearl of Power', 1],
      ['"Not for a Crown" (+2 longsword)', 1],
      ['Chain hook', 0],
      ["Nicklaus' Spectacles", 3],
      ['Helm of the Constellation', 1],
    ])
  })
  it('nothing of his is out of Play for being unequipped any more; the Trident is gone, item and attack', () => {
    // until 2026-10-03 the unequipped Everfrost Trident and Nicklaus' Spectacles were hidden ('equip'); now the
    // Trident is deleted from the file and the Spectacles are equipped. What is still not equipped (Mukluks,
    // Dragon Scale Mail and the like) is out for another reason or does nothing in Play.
    const hidden = c.inventory.items.filter((i) => playHiddenReason(c, i) === 'equip').map((i) => i.name)
    expect(hidden).toEqual([])
    expect(c.inventory.items.some((i) => i.name === 'Everfrost Trident' || i.name === 'Wand of Web')).toBe(false)
    const names = playCards(c).map((x) => x.name)
    expect(names).toContain("Nicklaus' Spectacles")
    expect(names).toContain('"Not for a Crown" (+2 longsword)')
    // the attack "Everfrost Trident" outlived its item for a day (itemId null, still in Play); he sold the Trident,
    // so the attack is out of the file too (2026-10-03): four attacks, all in Play
    expect(c.attacks.some((a) => a.name === 'Everfrost Trident')).toBe(false)
    expect(c.attacks.map((a) => [a.name, a.itemId === null ? null : c.inventory.items.find((i) => i.id === a.itemId)?.name])).toEqual([
      ['Staff of Ages (+3)', 'Staff of Ages'],
      ['"Not for a Crown" (+2 longsword)', '"Not for a Crown" (+2 longsword)'],
      ['Chain hook', 'Chain hook'],
      ['Fire Bolt', null],
    ])
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

// 2026-10-03: two new items in his file, neither in use yet, so nothing he rolls with moves
describe.skipIf(!HAVE_GRAV_V2)('Grav: Mukluks of Nimbleness and Dragon Scale Mail (added 2026-10-03)', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}')
  const item = (name: string) => c.inventory.items.find((i) => i.name === name)!
  it('the Mukluks need attunement and are not attuned (his 3 slots are taken); once a day, a Bonus Action', () => {
    expect(item('Mukluks of Nimbleness')).toMatchObject({
      equipped: false,
      requiresAttunement: true,
      attuned: false,
      activation: 'bonus',
      charges: { max: 1, used: 0, recharge: 'dawn' },
    })
    expect(c.inventory.items.filter((i) => i.attuned)).toHaveLength(3)
  })
  it('Dragon Scale Mail is scale mail +1 (15 + Dex up to 2), no attunement, not worn', () => {
    expect(item('Dragon Scale Mail')).toMatchObject({ equipped: false, requiresAttunement: false, armor: { base: 15, dexCap: 2 } })
  })
  it('he still wears Half Plate: AC 21 with no warnings, DC 18, spell attack +13 (before Exhaustion)', () => {
    const ac = armorClass(c)
    expect(ac.total).toBe(21)
    expect(ac.warnings).toEqual([])
    expect(ac.parts[0]).toEqual({ label: 'Half Plate', value: 15 })
    expect(spellDcView(rested(c))[0]).toMatchObject({ saveDc: 18, attack: 13 })
  })
})

// The to-hit and damage of his four attacks, as the sheet counts them with no Exhaustion (DEX +3, CHA +5, PB +5).
// Fire Bolt is the one that matters: until 2026-10-03 its +3 from the Staff of Ages was written into the attack's
// own bonus by hand, and once the app started adding the item's spellAttackBonus itself it showed +16. In his
// file the bonus is 0 now, and +13 must come out of CHA 5 + PB 5 + Staff 3, the same number as the head.
describe.skipIf(!HAVE_GRAV_V2)('Grav: the numbers of his attacks', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}')
  const stats = (x: Character) => x.attacks.map((a) => [a.name, attackStats(x, a).toHit, attackStats(x, a).dmgMod])
  const BEFORE = [
    ['Staff of Ages (+3)', 11, 8],
    ['"Not for a Crown" (+2 longsword)', 10, 7],
    ['Chain hook', 8, 3],
    ['Fire Bolt', 13, 0],
  ]
  it('before Exhaustion: Staff +11, Crown +10, Chain hook +8, Fire Bolt +13', () => {
    expect(stats(rested(c))).toEqual(BEFORE)
    // attackStats does not know about Exhaustion (the screens take the minus off), so the file as it is gives the same
    expect(stats(c)).toEqual(BEFORE)
  })
  it('Fire Bolt: bonus 0 in the file, +13 = the spell attack in the head, and the Staff counted once', () => {
    const fb = c.attacks.find((a) => a.name === 'Fire Bolt')!
    expect(fb).toMatchObject({ ability: 'spell', proficient: true, bonus: 0, itemId: null })
    expect(fb.notes).not.toMatch(/includes \+3/)
    expect(attackStats(rested(c), fb).toHit).toBe(13)
    expect(attackStats(rested(c), fb).toHit).toBe(spellDcView(rested(c))[0].attack)
    // the +3 is the Staff's: equipped and attuned in his file; put the Staff down and Fire Bolt is +10
    const staff = c.inventory.items.find((i) => i.name === 'Staff of Ages')!
    expect(staff).toMatchObject({ equipped: true, attuned: true, spellAttackBonus: 3 })
    const down: Character = { ...rested(c), inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === staff.id ? { ...i, equipped: false } : i)) } }
    expect(attackStats(down, fb).toHit).toBe(10)
  })
  it('the rest of the head before Exhaustion: AC 21, DC 18, spell attack +13, Initiative +3, Speed 30', () => {
    const r = rested(c)
    expect([armorClass(r).total, spellDcView(r)[0].saveDc, spellDcView(r)[0].attack, initiative(r), effectiveSpeed(r)]).toEqual([21, 18, 13, 3, 30])
  })
})

// Exhaustion on his file. Until the morning of 2026-10-03 the file said level 2 with exhaustionRules "2014" (his
// table's rules). His export from the laptop the same evening says level 3 and has NO exhaustionRules field, which
// the app reads as its own rules, 2024. The app never drops the field by itself (import, storage, the -/+ stepper,
// a Long Rest and export all keep it: see "the 2014 setting survives" below and exhaustion.test.ts); the only thing
// that removes it is the Rules switch in the Conditions panel set to 2024. Whether he meant that is his to say, so
// the level is pinned here and the numbers are pinned for BOTH rules; the file may carry either.
describe.skipIf(!HAVE_GRAV_V2)('Grav: Exhaustion 3', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV_V2) ? readFileSync(GRAV_V2, 'utf8') : '{}')
  const with2014: Character = { ...c, exhaustionRules: '2014' }
  const { exhaustionRules: _drop, ...without } = c
  const with2024: Character = without
  /** What the screens show for an attack: attackStats minus the d20 penalty of Exhaustion. */
  const shown = (x: Character) => x.attacks.map((a) => attackStats(x, a).toHit - exhaustionEffects(x).d20Penalty)

  it('the file says level 3, and one of the two rules', () => {
    expect(c.exhaustion).toBe(3)
    expect(['2014', '2024']).toContain(exhaustionRules(c))
    expect(exhaustionEffects(c)).toEqual(exhaustionEffects(exhaustionRules(c) === '2014' ? with2014 : with2024))
  })
  it('by the 2024 rules (no field in the file): -6 on every d20 roll, Speed 15; HP maximum, AC and DC as they were', () => {
    expect(exhaustionEffects(with2024)).toEqual({ level: 3, rules: '2024', d20Penalty: 6, speed: 15, hpMax: 98, checksDisadvantage: false, attacksSavesDisadvantage: false, dead: false })
    expect(exhaustionLines(with2024)).toEqual(['−6 to every d20 roll', 'Speed −15 ft (15 ft)'])
    expect([with2024.combat.speed, effectiveSpeed(with2024), effectiveHpMax(with2024)]).toEqual([30, 15, 98])
    expect([armorClass(with2024).total, spellDcView(with2024)[0].saveDc]).toEqual([21, 18])
    // spell attack +7, Initiative -3; Staff +5, Crown +4, Chain hook +2, Fire Bolt +7
    expect(spellDcView(with2024)[0]).toMatchObject({ attack: 7, attackDisadvantage: false })
    expect(initiative(with2024) - exhaustionEffects(with2024).d20Penalty).toBe(-3)
    expect(shown(with2024)).toEqual([5, 4, 2, 7])
  })
  it('by the 2014 rules: Disadvantage on checks, attacks and saves, Speed halved (15); nothing off the numbers', () => {
    expect(exhaustionEffects(with2014)).toEqual({ level: 3, rules: '2014', d20Penalty: 0, speed: 15, hpMax: 98, checksDisadvantage: true, attacksSavesDisadvantage: true, dead: false })
    expect(exhaustionLines(with2014)).toEqual(['Disadvantage on ability checks', 'Speed halved (15 ft)', 'Disadvantage on attack rolls and saving throws'])
    expect([with2014.combat.speed, effectiveSpeed(with2014), effectiveHpMax(with2014)]).toEqual([30, 15, 98])
    expect([armorClass(with2014).total, spellDcView(with2014)[0].saveDc]).toEqual([21, 18])
    // spell attack +13 with Disadvantage, Initiative +3; Staff +11, Crown +10, Chain hook +8, Fire Bolt +13
    expect(spellDcView(with2014)[0]).toMatchObject({ attack: 13, attackDisadvantage: true })
    expect(initiative(with2014) - exhaustionEffects(with2014).d20Penalty).toBe(3)
    expect(shown(with2014)).toEqual([11, 10, 8, 13])
  })
  it('a Long Rest takes it to 2 by either rule: Speed 20 and -4 on d20 (2024), or still 15 and no more Disadvantage on attacks (2014)', () => {
    expect(exhaustionEffects(longRest(with2024).character)).toMatchObject({ level: 2, rules: '2024', d20Penalty: 4, speed: 20 })
    expect(exhaustionEffects(longRest(with2014).character)).toMatchObject({ level: 2, rules: '2014', speed: 15, checksDisadvantage: true, attacksSavesDisadvantage: false })
  })
  it('the 2014 setting survives everything the app does with his file: import, storage, the + stepper, a Long Rest, export', () => {
    // the path of 2026-10-03: a file with exhaustionRules "2014" imported, saved, Exhaustion raised, exported
    const imported = importCharacterJson(JSON.stringify({ ...JSON.parse(JSON.stringify(c)), exhaustion: 2, exhaustionRules: '2014' }))
    expect(imported.warnings).toEqual([])
    const stored = importCharacterJson(JSON.stringify(imported.character)).character
    const raised: Character = { ...stored, exhaustion: Math.min(6, stored.exhaustion + 1) }
    const exported = JSON.parse(JSON.stringify(raised, null, 2))
    expect([exported.exhaustion, exported.exhaustionRules]).toEqual([3, '2014'])
    expect(longRest(raised).character.exhaustionRules).toBe('2014')
    expect(importCharacterJson(JSON.stringify(exported)).character.exhaustionRules).toBe('2014')
  })
})
