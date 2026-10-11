// A spell with a casting ability of its own (2026-10-11): a species' or a feat's spell shows its own save DC
// and attack bonus on the card, whatever the hero's class casts with (or with no casting class at all).
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from './normalize'
import { playCards } from './play'
import { castingStats, spellOwnCasting } from './rules'
import { characterToJson } from './storage'

type Obj = Record<string, unknown>
const hero = (spell: Obj, extra: Obj = {}) =>
  normalizeCharacter({ schemaVersion: 3, name: 'Own', classes: [{ id: 'druid', level: 5 }], abilities: { wis: 18, cha: 14, int: 8 }, spells: [{ name: 'Hellish Rebuke', level: 1, castingTime: 'Reaction', ...spell }], ...extra })
const stat = (c: ReturnType<typeof hero>['character']) => playCards(c).find((x) => x.kind === 'spell')!.stat

describe('Spell.castingAbility', () => {
  it('a class spell shows nothing on the card', () => {
    expect(stat(hero({ source: 'druid' }).character)).toBeUndefined()
  })
  it("a species' spell cast with Charisma: its own DC and attack, not the Druid's", () => {
    const c = hero({ source: 'species', castingAbility: 'cha' }).character
    expect(castingStats(c)[0].saveDc).toBe(15)
    expect(spellOwnCasting(c, 'cha')).toEqual({ saveDc: 13, attack: 5 })
    expect(stat(c)).toBe('DC 13 · +5 to hit')
  })
  it('works for a hero with no spellcasting class', () => {
    const c = hero({ source: 'feat', castingAbility: 'int' }, { classes: [{ id: 'fighter', level: 5 }] }).character
    expect(castingStats(c)).toEqual([])
    expect(stat(c)).toBe('DC 10 · +2 to hit')
  })
  it('item bonuses count, and so does an item that raises the ability', () => {
    const items = [
      { name: 'Focus', equipped: true, spellDcBonus: 1, spellAttackBonus: 2 },
      { name: 'Circlet', equipped: true, abilityScores: [{ ability: 'cha', mode: 'set', value: 18 }] },
    ]
    expect(stat(hero({ castingAbility: 'cha' }, { inventory: { items } }).character)).toBe('DC 16 · +9 to hit')
  })
  it('Exhaustion comes off the attack only', () => {
    expect(stat(hero({ castingAbility: 'cha' }, { exhaustion: 1 }).character)).toBe('DC 13 · +3 to hit')
  })
  it('in a file: long names accepted, round trip silent, an unknown ability dropped with a warning', () => {
    const r = hero({ castingAbility: 'Charisma' })
    expect(r.warnings).toEqual([])
    expect(r.character.spells[0].castingAbility).toBe('cha')
    expect(normalizeCharacter(JSON.parse(characterToJson(r.character))).warnings).toEqual([])
    const bad = hero({ castingAbility: 'luck' })
    expect(bad.character.spells[0].castingAbility).toBeUndefined()
    expect(bad.warnings).toEqual(['spells[0].castingAbility: unknown ability "luck", ignored.'])
  })
})
