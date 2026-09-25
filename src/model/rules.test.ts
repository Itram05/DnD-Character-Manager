import { describe, expect, it } from 'vitest'
import { evaluate } from './expr'
import { normalizeCharacter } from './normalize'
import {
  abilityMod,
  applyDamage,
  applyHealing,
  applyTempHp,
  armorClass,
  castingStats,
  effectiveSpeed,
  initiative,
  passiveScore,
  proficiencyBonus,
  savingThrow,
  skillMod,
  usesMax,
} from './rules'

const make = (raw: object) => normalizeCharacter(raw).character

describe('ability modifiers', () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [20, 5],
    [30, 10],
  ])('score %i -> %i', (score, mod) => expect(abilityMod(score)).toBe(mod))
})

describe('proficiency bonus', () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])('level %i -> +%i', (lvl, pb) => expect(proficiencyBonus(lvl)).toBe(pb))

  it('uses total character level for multiclass', () => {
    // SRD example: level 3 Fighter / level 2 Rogue has the PB of a level 5 character (+3)
    const c = make({ classes: [{ id: 'fighter', level: 3 }, { id: 'rogue', level: 2 }], abilities: { wis: 10 } })
    expect(savingThrow(c, 'str').mod).toBe(0 + 3) // fighter saves: str, con
  })
})

describe('skills and passives', () => {
  const base = { classes: [{ id: 'bard', level: 5 }], abilities: { wis: 14, int: 12, dex: 16 } } // PB +3
  it('proficient and expertise', () => {
    const c = make({ ...base, proficiencies: { skills: { perception: 'proficient', stealth: 'expertise' } } })
    expect(skillMod(c, 'perception')).toBe(2 + 3)
    expect(skillMod(c, 'stealth')).toBe(3 + 6)
    expect(passiveScore(c, 'perception')).toBe(15)
    expect(passiveScore(c, 'insight')).toBe(12)
    expect(passiveScore(c, 'investigation')).toBe(11)
  })
  it('Jack of All Trades adds half PB (round down) only to unproficient skills, not initiative', () => {
    const c = make({ ...base, proficiencies: { skills: { perception: 'proficient' }, jackOfAllTrades: true } })
    expect(skillMod(c, 'insight')).toBe(2 + 1)
    expect(skillMod(c, 'perception')).toBe(2 + 3)
    expect(initiative(c)).toBe(3)
  })
  it('accepts a plain list of skills', () => {
    const c = make({ ...base, proficiencies: { skills: ['Perception', 'sleight of hand'] } })
    expect(c.proficiencies.skills.perception).toBe('proficient')
    expect(c.proficiencies.skills.sleightOfHand).toBe('proficient')
  })
})

describe('spellcasting stats', () => {
  it('save DC = 8 + mod + PB, attack = mod + PB', () => {
    const c = make({ classes: [{ id: 'wizard', level: 5 }], abilities: { int: 18 } })
    expect(castingStats(c)).toEqual([{ classId: 'wizard', className: 'Wizard', ability: 'int', saveDc: 15, attack: 7 }])
  })
  it('one entry per casting class with its own ability', () => {
    const c = make({ classes: [{ id: 'cleric', level: 2 }, { id: 'sorcerer', level: 2 }], abilities: { wis: 16, cha: 12 } })
    const s = castingStats(c)
    expect(s.map((x) => [x.classId, x.saveDc])).toEqual([
      ['cleric', 13],
      ['sorcerer', 11],
    ])
  })
  it('non-casters have none', () => {
    expect(castingStats(make({ classes: [{ id: 'barbarian', level: 3 }] }))).toEqual([])
  })
})

describe('formulas', () => {
  const c = make({ classes: [{ id: 'barbarian', level: 5 }, { id: 'bard', level: 2 }], abilities: { cha: 14, wis: 8 } })
  it('evaluates arithmetic and functions', () => {
    expect(evaluate('2 + 3 * (4 - 1)', () => undefined).value).toBe(11)
    expect(evaluate('max(1, -3)', () => undefined).value).toBe(1)
    expect(evaluate('floor(7 / 2)', () => undefined).value).toBe(3)
  })
  it('resolves ability mods, pb, class levels and class table columns', () => {
    expect(usesMax(c, 'cha')).toBe(2)
    expect(usesMax(c, 'max(1, wis)')).toBe(1)
    expect(usesMax(c, 'pb')).toBe(3)
    expect(usesMax(c, 'barbarian')).toBe(5)
    expect(usesMax(c, 'barbarian.rages')).toBe(3)
    expect(usesMax(c, 'barbarian.rages-1')).toBe(2)
    expect(usesMax(c, 'level')).toBe(7)
    expect(usesMax(c, 'paladin * 5')).toBe(0) // SRD class the hero doesn't have
  })
  it('bad formulas give 0 without throwing', () => {
    expect(usesMax(c, 'max(1,')).toBe(0)
    expect(usesMax(c, 'alert("x")')).toBe(0)
    expect(evaluate('foo + 1', () => undefined).unknown).toEqual(['foo'])
  })
})

describe('armor class', () => {
  it('unarmored formula', () => {
    const c = make({ classes: [{ id: 'barbarian', level: 1 }], abilities: { dex: 14, con: 16 }, combat: { unarmoredAc: '10 + dex + con' } })
    expect(armorClass(c).total).toBe(15)
  })
  it('armor with dex cap, shield and attuned ring', () => {
    const c = make({
      abilities: { dex: 18 },
      inventory: {
        items: [
          { name: 'Breastplate', equipped: true, armor: { base: 14, dexCap: 2 } },
          { name: 'Shield', equipped: true, acBonus: 2 },
          { name: 'Ring of Protection', equipped: true, requiresAttunement: true, attuned: false, acBonus: 1 },
        ],
      },
    })
    expect(armorClass(c).total).toBe(18) // ring not attuned
    const c2 = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => ({ ...i, attuned: true })) } }
    expect(armorClass(c2).total).toBe(19)
  })
})

describe('HP', () => {
  const c = make({ combat: { hp: { max: 20, current: 12, temp: 5 } } })
  it('damage eats temp HP first', () => {
    const r = applyDamage(c, 7)
    expect(r.character.combat.hp).toEqual({ max: 20, current: 10, temp: 0 })
  })
  it('dropping to 0 and massive damage', () => {
    expect(applyDamage(c, 17).events).toContain('droppedToZero')
    expect(applyDamage(c, 17 + 20).events).toContain('massiveDamageDeath')
  })
  it('damage at 0 HP = death save failures (2 on a critical)', () => {
    const down = make({ combat: { hp: { max: 20, current: 0 } } })
    expect(applyDamage(down, 3).character.combat.deathSaves.failures).toBe(1)
    expect(applyDamage(down, 3, true).character.combat.deathSaves.failures).toBe(2)
  })
  it('healing caps at max, resets death saves, never restores temp', () => {
    const down = make({ combat: { hp: { max: 20, current: 0, temp: 0 }, deathSaves: { failures: 2 } } })
    const h = applyHealing(down, 50)
    expect(h.combat.hp.current).toBe(20)
    expect(h.combat.hp.temp).toBe(0)
    expect(h.combat.deathSaves.failures).toBe(0)
  })
  it('temp HP do not stack', () => {
    expect(applyTempHp(c, 3).combat.hp.temp).toBe(5)
    expect(applyTempHp(c, 8).combat.hp.temp).toBe(8)
  })
})

describe('exhaustion (2024)', () => {
  it('speed -5 per level', () => {
    const c = make({ exhaustion: 2, combat: { speed: 30 } })
    expect(effectiveSpeed(c)).toBe(20)
  })
})
