// Exhaustion applies itself, by the edition chosen for the hero (`exhaustionRules`, absent = 2024).
import { describe, expect, it } from 'vitest'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { longRest, spendHitDie } from './rest'
import { applyDamage, applyHealing, effectiveHpCurrent, effectiveHpMax, effectiveSpeed, exhaustionD20Penalty, exhaustionEffects, exhaustionLines, exhaustionRules } from './rules'

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
