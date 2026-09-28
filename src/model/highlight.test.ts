import { describe, expect, it } from 'vitest'
import srdSpells from '../data/srd/spells.json'
import { damageClass, tokenize, type Token } from './highlight'

const marked = (s: string) => tokenize(s).filter((t) => t.kind !== 'text')
const pick = (s: string, kind: Token['kind']) => marked(s).filter((t) => t.kind === kind).map((t) => t.text)
const joined = (s: string) => tokenize(s).map((t) => t.text).join('')

describe('highlight: dice and damage', () => {
  it('dice with a type become one damage token, with the type recorded', () => {
    const t = marked('each creature takes 8d6 Fire damage on a failed save')
    expect(t).toEqual([{ kind: 'damage', text: '8d6 Fire damage', damageType: 'fire' }])
  })
  it('a modifier stays with the dice', () => {
    expect(pick('A dart deals 1d4 + 1 Force damage to its target.', 'damage')).toEqual(['1d4 + 1 Force damage'])
  })
  it('dice + type without the word "damage" still counts (hand-written notes)', () => {
    expect(marked('8d6 psychic')).toEqual([{ kind: 'damage', text: '8d6 psychic', damageType: 'psychic' }])
    expect(pick('6d10 Force', 'damage')).toEqual(['6d10 Force'])
  })
  it('type + "damage" without dice counts', () => {
    expect(pick('half the amount of Necrotic damage dealt', 'damage')).toEqual(['Necrotic damage'])
    expect(pick('resistance to fire damage', 'damage')).toEqual(['fire damage'])
  })
  it('bare dice are bold dice, not damage', () => {
    expect(pick('The damage increases by 1d6 for each spell slot level above 3.', 'dice')).toEqual(['1d6'])
    expect(pick('takes 3d8 damage of the chosen type', 'dice')).toEqual(['3d8'])
    expect(pick('roll a d20', 'dice')).toEqual(['d20'])
  })
  it('no false damage inside names or plain lists', () => {
    expect(marked('You cast Fireball and Fire Bolt.')).toEqual([])
    expect(marked('Choose Acid, Cold, Fire, Lightning, Poison, or Thunder for the type of orb')).toEqual([])
    expect(marked('the fiery explosion')).toEqual([])
    expect(pick('two or more of the d8s', 'dice')).toEqual([])
  })
  it('physical types share one colour class', () => {
    expect(damageClass('slashing')).toBe('dmg-physical')
    expect(damageClass('bludgeoning')).toBe('dmg-physical')
    expect(damageClass('fire')).toBe('dmg-fire')
  })
})

describe('highlight: saves, healing, conditions, advantage', () => {
  it('saves and DCs', () => {
    expect(pick('makes a Dexterity saving throw', 'save')).toEqual(['Dexterity saving throw'])
    expect(pick('an Intelligence save', 'save')).toEqual(['Intelligence save'])
    expect(pick('a Dex saving throw against DC 15', 'save')).toEqual(['Dex saving throw', 'DC 15'])
    expect(pick('against your spell save DC', 'save')).toEqual(['spell save DC'])
  })
  it('healing, with dice inside kept bold', () => {
    expect(pick('A creature you touch regains a number of Hit Points equal to 2d8', 'heal')).toEqual(['regains a number of Hit Points'])
    const h = marked('The target regains 4d8 + 15 Hit Points.')[0]
    expect(h.kind).toBe('heal')
    if (h.kind === 'heal') expect(h.parts.filter((p) => p.kind === 'dice').map((p) => p.text)).toEqual(['4d8 + 15'])
    expect(pick('gains 5 Temporary Hit Points', 'heal')).toEqual(['Temporary Hit Points'])
    expect(pick('The healing increases by 2d8', 'heal')).toEqual(['healing'])
  })
  it('healing does not reach across a sentence', () => {
    expect(pick('You regain one use. It has 10 Hit Points.', 'heal')).toEqual([])
  })
  it('conditions and advantage', () => {
    expect(pick('have the Paralyzed condition', 'condition')).toEqual(['Paralyzed'])
    expect(pick('knocked prone and Frightened', 'condition')).toEqual(['prone', 'Frightened'])
    expect(pick('has Advantage; you have disadvantage', 'advantage')).toEqual(['Advantage', 'disadvantage'])
    expect(pick('advantageous', 'advantage')).toEqual([])
  })
})

describe('highlight over the whole SRD spell list', () => {
  const spells = (srdSpells as { data: { name: string; text: string }[] }).data
  it('never loses or reorders text', () => {
    for (const s of spells) expect(joined(s.text)).toBe(s.text)
  })
  it('finds typed damage in the classic damage spells', () => {
    const text = (n: string) => spells.find((s) => s.name === n)!.text
    expect(pick(text('Fireball'), 'damage')).toContain('8d6 Fire damage')
    expect(pick(text('Fireball'), 'save')).toContain('Dexterity saving throw')
    expect(pick(text('Hold Person'), 'condition')).toContain('Paralyzed')
    expect(pick(text('Cure Wounds'), 'heal').length).toBeGreaterThan(0)
  })
  it('is fast enough for the full list', () => {
    const t0 = performance.now()
    for (const s of spells) tokenize(s.text)
    expect(performance.now() - t0).toBeLessThan(500)
  })
})
