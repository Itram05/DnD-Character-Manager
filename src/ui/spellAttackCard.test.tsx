// An attack with "ability": "spell" is a spell attack (2026-10-03): it takes the spellAttackBonus of the
// items that count, so its card shows the same number as the spell attack in the head. Before, the bonus
// reached only the head and the card was 3 short for a hero with a +3 staff.
// Exhaustion (2024) comes off once: attackStats and castingStats are both before it, the screens subtract it.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import { attackStats, castingStats, exhaustionEffects, spellDcView } from '../model/rules'
import type { Character } from '../model/types'
import { Sheet } from './Sheet'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const settings = { theme: 'dark', view: 'cards' } as const
const sheet = (c: Character, tab: 'play' | 'stats') =>
  renderToString(<Sheet initial={c} tab={tab} onTab={() => {}} onBack={() => {}} settings={settings} setSettings={() => {}} onRules={() => {}} />)

const staff = { id: 'st', name: 'Staff of Ages', quantity: 1, equipped: true, requiresAttunement: true, attuned: true, spellAttackBonus: 3 }
const wand = { id: 'wd', name: 'Wand of the War Mage', quantity: 1, equipped: true, spellAttackBonus: 1 }
const fireBolt = { id: 'fb', name: 'Fire Bolt', ability: 'spell', proficient: true, bonus: 0, damage: '2d10', damageType: 'Fire', addAbilityToDamage: false, itemId: null }
const dagger = { id: 'dg', name: 'Dagger', ability: 'finesse', proficient: true, bonus: 0, damage: '1d4', damageType: 'Piercing', itemId: null }

// Sorcerer 5, CHA 18, DEX 14: PB +3, CHA +4 -> spell attack +7 with no items
const hero = (items: unknown[], more: Record<string, unknown> = {}) =>
  normalizeCharacter({
    name: 'Ember',
    abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 18 },
    classes: [{ id: 'sorcerer', level: 5 }],
    attacks: [fireBolt, dagger],
    inventory: { items },
    ...more,
  }).character
const toHit = (c: Character, name: string) => attackStats(c, c.attacks.find((a) => a.name === name)!).toHit

describe('an attack with the spellcasting ability and the items\' spellAttackBonus', () => {
  it('no item: ability + PB, the spell attack of the head', () => {
    const c = hero([])
    expect(toHit(c, 'Fire Bolt')).toBe(7)
    expect(castingStats(c)[0].attack).toBe(7)
  })
  it('an active item adds its bonus: the same number as the spell attack', () => {
    const c = hero([staff])
    expect(toHit(c, 'Fire Bolt')).toBe(10)
    expect(toHit(c, 'Fire Bolt')).toBe(castingStats(c)[0].attack)
  })
  it('two active items add up, as in the head', () => {
    const c = hero([staff, wand])
    expect(toHit(c, 'Fire Bolt')).toBe(11)
    expect(toHit(c, 'Fire Bolt')).toBe(castingStats(c)[0].attack)
  })
  it('an item that does not count gives nothing: not equipped, or needs attunement and is not attuned', () => {
    expect(toHit(hero([{ ...staff, equipped: false }]), 'Fire Bolt')).toBe(7)
    expect(toHit(hero([{ ...staff, attuned: false }]), 'Fire Bolt')).toBe(7)
  })
  it('the attack\'s own bonus and proficiency still count, on top', () => {
    const c = hero([staff])
    expect(attackStats(c, { ...c.attacks[0], bonus: 2 }).toHit).toBe(12)
    expect(attackStats(c, { ...c.attacks[0], proficient: false }).toHit).toBe(7)
  })
  it('a weapon attack takes nothing from it, and the damage is untouched', () => {
    const c = hero([staff])
    expect(attackStats(c, c.attacks[1])).toEqual({ toHit: 5, dmgMod: 2 })
    expect(attackStats(c, c.attacks[0])).toEqual({ toHit: 10, dmgMod: 0 })
  })
})

describe('the card, the Stats row and the breakdown agree, and Exhaustion comes off once', () => {
  it('no Exhaustion: +10 on the card, on Stats and in the head\'s breakdown', () => {
    const c = hero([staff])
    const v = spellDcView(c)[0]
    expect(v.attack).toBe(10)
    expect(v.attackParts.map((p) => [p.kind, p.value])).toEqual([['ability', 4], ['pb', 3], ['item', 3]])
    expect(strip(sheet(c, 'play'))).toContain('Fire Bolt A ⚔ Attack +10 to hit · 2d10 Fire')
    expect(strip(sheet(c, 'stats'))).toMatch(/Fire Bolt \+10 2d10 Fire/)
  })
  it('2024 Exhaustion 2 (−4): +6 everywhere, not +2', () => {
    const c = hero([staff], { exhaustion: 2, exhaustionRules: '2024' })
    expect(exhaustionEffects(c).d20Penalty).toBe(4)
    // the model numbers are before Exhaustion
    expect(toHit(c, 'Fire Bolt')).toBe(10)
    expect(castingStats(c)[0].attack).toBe(10)
    // the head: one Exhaustion line, and the lines add up to the number shown
    const v = spellDcView(c)[0]
    expect(v.attack).toBe(6)
    expect(v.attackParts.filter((p) => p.kind === 'exhaustion')).toEqual([{ kind: 'exhaustion', label: '2', value: -4 }])
    expect(v.attackParts.reduce((s, p) => s + p.value, 0)).toBe(6)
    // the card and the Stats row
    expect(strip(sheet(c, 'play'))).toContain('Fire Bolt A ⚔ Attack +6 to hit · 2d10 Fire')
    expect(strip(sheet(c, 'stats'))).toMatch(/Fire Bolt \+6 2d10 Fire/)
    // the weapon loses the same 4, once
    expect(strip(sheet(c, 'play'))).toContain('Dagger A ⚔ Attack +1 to hit')
  })
})
