// Exhaustion applies itself, by the edition chosen for the hero (`exhaustionRules`, absent = 2024).
import { describe, expect, it } from 'vitest'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { longRest, spendHitDie } from './rest'
import {
  PASSIVE_DISADVANTAGE,
  applyDamage,
  applyHealing,
  castingStats,
  effectiveHpCurrent,
  effectiveHpMax,
  effectiveSpeed,
  exhaustionD20Penalty,
  exhaustionEffects,
  exhaustionLines,
  exhaustionRules,
  passiveScore,
  passiveScoreView,
  spellAttackNow,
  spellDcView,
} from './rules'

const base = { name: 'T', classes: [{ id: 'fighter', name: 'Fighter', level: 5 }], combat: { speed: 30, hp: { max: 45, current: 45, temp: 0 } } }
const make = (exhaustion: number, rules?: string) => normalizeCharacter({ ...base, exhaustion, ...(rules ? { exhaustionRules: rules } : {}) }).character

describe('exhaustion, 2024 rules (the default)', () => {
  it('no setting means 2024; "2024" in a file is the same and is not written back', () => {
    expect(exhaustionRules(make(0))).toBe('2024')
    expect(exhaustionRules(make(0, '2024'))).toBe('2024')
    expect('exhaustionRules' in make(0)).toBe(false)
    expect('exhaustionRules' in make(0, '2024')).toBe(false)
  })
  it('each level: −2 to every d20 roll and −5 ft Speed; HP maximum untouched; no Disadvantage', () => {
    for (let n = 0; n <= 6; n++) {
      const e = exhaustionEffects(make(n))
      expect(e).toMatchObject({ level: n, rules: '2024', d20Penalty: 2 * n, speed: 30 - 5 * n, hpMax: 45, checksDisadvantage: false, attacksSavesDisadvantage: false, dead: n === 6 })
    }
    expect(exhaustionD20Penalty(make(3))).toBe(6)
    expect(effectiveSpeed(make(2))).toBe(20)
  })
  it('Speed never goes below 0', () => {
    const slow = normalizeCharacter({ ...base, combat: { ...base.combat, speed: 20 }, exhaustion: 5 }).character
    expect(effectiveSpeed(slow)).toBe(0)
  })
  it('the lines shown in the head', () => {
    expect(exhaustionLines(make(0))).toEqual([])
    expect(exhaustionLines(make(2))).toEqual(['−4 to every d20 roll', 'Speed −10 ft (20 ft)'])
    expect(exhaustionLines(make(6)).at(-1)).toBe('Death')
  })
})

describe('exhaustion, 2014 rules', () => {
  it('the setting survives import and a second import', () => {
    const c = make(2, '2014')
    expect(c.exhaustionRules).toBe('2014')
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('the table, level by level', () => {
    const rows = [
      // level, speed, hpMax, checks, attacks and saves, dead
      [0, 30, 45, false, false, false],
      [1, 30, 45, true, false, false],
      [2, 15, 45, true, false, false],
      [3, 15, 45, true, true, false],
      [4, 15, 22, true, true, false],
      [5, 0, 22, true, true, false],
      [6, 0, 22, true, true, true],
    ] as const
    for (const [level, speed, hpMax, checks, attacksSaves, dead] of rows) {
      expect(exhaustionEffects(make(level, '2014'))).toEqual({ level, rules: '2014', d20Penalty: 0, speed, hpMax, checksDisadvantage: checks, attacksSavesDisadvantage: attacksSaves, dead })
    }
  })
  it('no number is taken off the d20: it is Disadvantage, not a minus', () => {
    expect(exhaustionD20Penalty(make(5, '2014'))).toBe(0)
  })
  it('the lines shown in the head', () => {
    expect(exhaustionLines(make(1, '2014'))).toEqual(['Disadvantage on ability checks'])
    expect(exhaustionLines(make(2, '2014'))).toEqual(['Disadvantage on ability checks', 'Speed halved (15 ft)'])
    expect(exhaustionLines(make(4, '2014'))).toEqual([
      'Disadvantage on ability checks',
      'Speed halved (15 ft)',
      'Disadvantage on attack rolls and saving throws',
      'Hit Point maximum halved (22)',
    ])
    expect(exhaustionLines(make(5, '2014'))).toContain('Speed 0')
    expect(exhaustionLines(make(5, '2014'))).not.toContain('Speed halved (15 ft)')
  })
  it('level 4: HP count up to half the maximum; the stored maximum is not touched', () => {
    const c = make(4, '2014')
    expect(c.combat.hp.max).toBe(45)
    expect([effectiveHpMax(c), effectiveHpCurrent(c)]).toEqual([22, 22])
    // damage comes off the 22, healing stops at 22
    const hurt = applyDamage(c, 10).character
    expect(hurt.combat.hp).toMatchObject({ current: 12, max: 45 })
    expect(applyHealing(hurt, 100).combat.hp.current).toBe(22)
    expect(spendHitDie(hurt, 'd10', 10)!.character.combat.hp.current).toBe(22)
  })
  it('a Long Rest at level 4 brings it to 3 and all 45 HP back; at level 5 to 4 and only 22', () => {
    const r = longRest(make(4, '2014')).character
    expect([r.exhaustion, r.combat.hp.current, effectiveHpMax(r)]).toEqual([3, 45, 45])
    const r5 = longRest(make(5, '2014')).character
    expect([r5.exhaustion, r5.combat.hp.current]).toEqual([4, 22])
  })
})

// A caster for the passive scores and the spell attack: Wizard 5, INT 16 (+3), WIS 14 (+2), PB +3, Perception proficient.
const wiz = (exhaustion: number, rules?: string) =>
  normalizeCharacter({
    name: 'W',
    classes: [{ id: 'wizard', name: 'Wizard', level: 5 }],
    abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 14, cha: 10 },
    proficiencies: { skills: { perception: 'proficient' } },
    exhaustion,
    ...(rules ? { exhaustionRules: rules } : {}),
  }).character

describe('exhaustion and the passive scores', () => {
  it('none: 10 + the modifiers, nothing taken off', () => {
    expect(passiveScoreView(wiz(0), 'perception')).toEqual({ value: 15, base: 15, penalty: 0 })
    expect(passiveScore(wiz(0), 'investigation')).toBe(13)
  })
  it('2024: the d20 minus comes off, 2 per level', () => {
    expect(passiveScoreView(wiz(1), 'perception')).toEqual({ value: 13, base: 15, penalty: 2 })
    expect(passiveScoreView(wiz(3), 'perception')).toEqual({ value: 9, base: 15, penalty: 6 })
    expect(passiveScore(wiz(3), 'insight')).toBe(12 - 6)
  })
  it('2014: Disadvantage on ability checks from level 1 is −5, and it does not grow with the level', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(passiveScoreView(wiz(n, '2014'), 'perception')).toEqual({ value: 10, base: 15, penalty: PASSIVE_DISADVANTAGE })
    expect(passiveScore(wiz(0, '2014'), 'perception')).toBe(15)
  })
})

describe('exhaustion and the spell attack', () => {
  it('none: the attack as it is, no Exhaustion line in the breakdown', () => {
    const v = spellDcView(wiz(0))[0]
    expect([v.saveDc, v.attack, v.attackDisadvantage]).toEqual([14, 6, false])
    expect(v.attackParts.map((p) => p.kind)).toEqual(['ability', 'pb'])
  })
  it('2024: the minus is off the attack and is the last line of its breakdown; the DC stays', () => {
    const v = spellDcView(wiz(2))[0]
    expect([v.saveDc, v.attack, v.attackDisadvantage]).toEqual([14, 2, false])
    expect(v.attackParts.at(-1)).toEqual({ kind: 'exhaustion', label: '2', value: -4 })
    expect(v.attackParts.reduce((s, p) => s + p.value, 0)).toBe(v.attack)
    expect(v.dcParts.some((p) => p.kind === 'exhaustion')).toBe(false)
    // castingStats itself is before Exhaustion; the screens go through spellAttackNow
    expect(castingStats(wiz(2))[0].attack).toBe(6)
    expect(spellAttackNow(wiz(2), 6)).toEqual({ attack: 2, disadvantage: false })
  })
  it('2014: no minus at any level; Disadvantage from level 3', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const v = spellDcView(wiz(n, '2014'))[0]
      expect([v.saveDc, v.attack, v.attackDisadvantage]).toEqual([14, 6, n >= 3])
      expect(v.attackParts.some((p) => p.kind === 'exhaustion')).toBe(false)
    }
  })
})
