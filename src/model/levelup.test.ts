import { describe, expect, it } from 'vitest'
import { SRD_CLASSES, srdSubclass } from '../data/srd'
import { SRD_PRESETS } from '../data/srdPresets'
import { applyLevelUp, hpForLevel, planLevelUp } from './levelup'
import { normalizeCharacter } from './normalize'
import { usesMax } from './rules'

const make = (raw: object) => normalizeCharacter(raw).character

describe('presets point at real SRD features', () => {
  for (const key of Object.keys(SRD_PRESETS)) {
    it(key, () => {
      const [path, name] = key.split(':')
      const [classId, subId] = path.split('/')
      const cls = SRD_CLASSES.find((c) => c.id === classId)!
      const list = subId ? srdSubclass(cls, subId)!.features : cls.features
      expect(list.some((f) => f.name === name)).toBe(true)
    })
  }
})

describe('level up plan', () => {
  it('Barbarian 2 -> 3 asks for a subclass and shows Rage count change', () => {
    const c = make({ classes: [{ id: 'barbarian', level: 2 }], abilities: { con: 14 } })
    const p = planLevelUp(c, 'barbarian')
    expect(p.toLevel).toBe(3)
    expect(p.needsSubclass).toBe(true)
    expect(p.decisions.join(' ')).toMatch(/subclass/)
    expect(p.columnChanges).toContainEqual({ label: 'Rages', before: '2', after: '3' })
    expect(p.features.map((f) => f.name)).toContain('Primal Knowledge')
    expect(p.fixedHp).toBe(7)
  })
  it('picking an SRD subclass adds its features for that level', () => {
    const c = make({ classes: [{ id: 'barbarian', level: 2 }] })
    const p = planLevelUp(c, 'barbarian', 'Path of the Berserker')
    expect(p.subclassHasData).toBe(true)
    expect(p.features.find((f) => f.name === 'Frenzy')?.origin).toBe('subclass')
  })
  it('a non-SRD subclass is flagged for manual entry', () => {
    const c = make({ classes: [{ id: 'fighter', level: 2 }] })
    const p = planLevelUp(c, 'fighter', 'Eldritch Knight')
    expect(p.subclassHasData).toBe(false)
    expect(p.decisions.join(' ')).toMatch(/Eldritch Knight is not in the SRD/)
  })
  it('ASI levels become a decision, not a feature', () => {
    const c = make({ classes: [{ id: 'fighter', level: 3, subclass: 'Champion' }] })
    const p = planLevelUp(c, 'fighter')
    expect(p.features.map((f) => f.name)).not.toContain('Ability Score Improvement')
    expect(p.decisions.join(' ')).toMatch(/Ability Score Improvement/)
  })
  it('PB and spell slots before/after', () => {
    const c = make({ classes: [{ id: 'wizard', level: 4, subclass: 'Evoker' }] })
    const p = planLevelUp(c, 'wizard')
    expect([p.pbBefore, p.pbAfter]).toEqual([2, 3])
    expect(p.slotsBefore.slice(0, 3)).toEqual([4, 3, 0])
    expect(p.slotsAfter.slice(0, 3)).toEqual([4, 3, 2])
  })
  it('multiclass prerequisites (13 in primary abilities of old and new class)', () => {
    const c = make({ classes: [{ id: 'fighter', level: 3 }], abilities: { str: 15, dex: 10, wis: 12 } })
    const p = planLevelUp(c, 'monk') // Monk needs Dex AND Wis 13
    expect(p.isNewClass).toBe(true)
    expect(p.multiclass?.prerequisitesMet).toBe(false)
    const ok = planLevelUp(make({ classes: [{ id: 'fighter', level: 3 }], abilities: { str: 15, cha: 13 } }), 'warlock')
    expect(ok.multiclass?.prerequisitesMet).toBe(true)
  })
  it('HP per level: roll or fixed + Con, minimum 1', () => {
    expect(hpForLevel(7, 2)).toBe(9)
    expect(hpForLevel(1, -3)).toBe(1)
  })
})

describe('apply level up', () => {
  it('raises the class level, HP, adds features with their counters, and patches existing ones', () => {
    const c = make({
      classes: [{ id: 'bard', level: 4, subclass: 'College of Lore' }],
      abilities: { cha: 16 },
      combat: { hp: { max: 27, current: 20 } },
      features: [{ name: 'Bardic Inspiration', activation: 'bonus', uses: { max: 'max(1, cha)', used: 2, recharge: 'long' } }],
    })
    const p = planLevelUp(c, 'bard')
    expect(p.features.map((f) => f.name)).toContain('Font of Inspiration')
    const next = applyLevelUp(c, p, { hpGain: 6, selected: p.features.map((f) => f.key), extraFeatures: [] })
    expect(next.classes[0].level).toBe(5)
    expect(next.combat.hp).toMatchObject({ max: 33, current: 26 })
    expect(next.features.find((f) => f.name === 'Font of Inspiration')).toBeDefined()
    expect(next.features.find((f) => f.name === 'Bardic Inspiration')!.uses!.recharge).toBe('short')
  })
  it('new multiclass class starts at level 1 and Rage gets a formula counter', () => {
    const c = make({ classes: [{ id: 'fighter', level: 2 }], abilities: { str: 14 } })
    const p = planLevelUp(c, 'barbarian')
    const next = applyLevelUp(c, p, { hpGain: 9, selected: p.features.map((f) => f.key), extraFeatures: [] })
    expect(next.classes.map((k) => [k.id, k.level])).toEqual([
      ['fighter', 2],
      ['barbarian', 1],
    ])
    const rage = next.features.find((f) => f.name === 'Rage')!
    expect(rage.activation).toBe('bonus')
    expect(usesMax(next, rage.uses!.max)).toBe(2)
  })
})
