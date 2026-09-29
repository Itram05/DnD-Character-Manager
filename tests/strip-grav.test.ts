// The icon strip on the cards of the owner's character, Grav (Paladin / Sorcerer, level 14, 2014 rules).
// The file lives outside the repo and is read-only here; missing = a failed test, skipped only in CI (ownerFiles.ts).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import srdSpells from '../src/data/srd/spells.json'
import type { SrdSpell } from '../src/data/srd'
import { importCharacterJson } from '../src/model/normalize'
import { playCards } from '../src/model/play'
import { GRAV_DESKTOP, ownerFile } from './ownerFiles'

const GRAV = GRAV_DESKTOP
const srd = (srdSpells as unknown as { data: SrdSpell[] }).data

describe.skipIf(!ownerFile(GRAV))('icon strip on Grav', () => {
  const { character: c } = importCharacterJson(existsSync(GRAV) ? readFileSync(GRAV, 'utf8') : '{}')
  const cards = playCards(c, srd)
  const strip = (name: string) => cards.find((k) => k.name === name)?.strip

  it('every spell, scroll and item power has a strip; other cards do not', () => {
    for (const k of cards) {
      if (k.kind === 'spell' || k.kind === 'scroll' || k.kind === 'power') expect(k.strip, k.name).toBeDefined()
      else expect(k.strip, k.name).toBeUndefined()
    }
  })
  it('the full strips', () => {
    expect(strip('Spirit Guardians')).toEqual({ action: { kind: 'action' }, range: 'Self', area: { shape: 'radius', size: '15 ft' }, damage: { dice: '3d8', type: 'radiant' }, save: 'wis' })
    expect(strip('Synaptic Static')).toEqual({ action: { kind: 'action' }, range: '120 ft', area: { shape: 'sphere', size: '20 ft' }, damage: { dice: '8d6', type: 'psychic' }, save: 'int' })
    expect(strip('Scroll of Shatter')).toEqual({ action: { kind: 'action' }, range: '60 ft', area: { shape: 'sphere', size: '10 ft' }, damage: { dice: '3d8', type: 'thunder' }, save: 'con' })
    expect(strip('Guardian of Faith')).toEqual({ action: { kind: 'action' }, range: '30 ft', damage: { dice: '20', type: 'radiant' }, save: 'dex' })
    expect(strip('Watery Sphere')).toEqual({ action: { kind: 'action' }, range: '90 ft', area: { shape: 'sphere', size: '5 ft' }, save: 'str' })
    expect(strip('Thunderous Smite')).toEqual({ action: { kind: 'bonus' }, range: 'Self', damage: { dice: '2d6', type: 'thunder' }, save: 'str' })
    expect(strip('Spiritual Weapon')).toEqual({ action: { kind: 'bonus' }, range: '60 ft', damage: { dice: '1d8+Cha', type: 'force' } })
    expect(strip('Control Weather')).toEqual({ action: { kind: 'time', label: '10 min' }, range: 'Self', area: { shape: 'radius', size: '5 mi' } })
  })
  it('cantrips at level 14: the dice of the text at 11th level; Fire Bolt is written already worked out', () => {
    expect(strip('Toll the Dead')).toEqual({ action: { kind: 'action' }, range: '60 ft', damage: { dice: '3d8', type: 'necrotic' }, save: 'wis' })
    expect(strip('Booming Blade')).toEqual({ action: { kind: 'action' }, range: '5 ft', damage: { dice: '3d8', type: 'thunder' } })
    expect(strip('Fire Bolt')?.damage).toEqual({ dice: '3d10', type: 'fire' })
  })
  it('Green-Flame Blade: fire, but no dice (its damage is the ability modifier)', () => {
    expect(strip('Green-Flame Blade')).toEqual({ action: { kind: 'action' }, range: '5 ft', damage: { type: 'fire' } })
  })
  it('saves and damage that are not there are not shown', () => {
    expect(strip('Hold Person')).toEqual({ action: { kind: 'action' }, range: '60 ft', save: 'wis' })
    expect(strip('Command')).toEqual({ action: { kind: 'action' }, range: '60 ft', save: 'wis' })
    expect(strip('Bane')).toEqual({ action: { kind: 'action' }, range: '30 ft', save: 'cha' })
    expect(strip("Hunter's Mark")).toEqual({ action: { kind: 'bonus' }, range: '90 ft', damage: { dice: '1d6' } })
    expect(strip('Shield')).toEqual({ action: { kind: 'reaction' }, range: 'Self' })
    expect(strip('Counterspell')).toEqual({ action: { kind: 'reaction' }, range: '60 ft' })
    expect(strip('Cure Wounds')).toEqual({ action: { kind: 'action' }, range: 'Touch', heal: { dice: '1d8+Cha' } })
    expect(strip('Healing Word')).toEqual({ action: { kind: 'bonus' }, range: '60 ft', heal: { dice: '1d4+Cha' } })
    expect(strip('Shape Water')).toEqual({ action: { kind: 'action' }, range: '30 ft', area: { shape: 'cube', size: '5 ft' } })
  })
  it('scrolls take the spell (Grav\'s own, else the SRD)', () => {
    expect(strip('Scroll of Scorching Ray')).toEqual({ action: { kind: 'action' }, range: '120 ft', damage: { dice: '2d6', type: 'fire', times: 3 } })
    expect(strip('Scroll of Dispel Evil and Good')).toEqual({ action: { kind: 'action' }, range: 'Self', save: 'cha' })
    expect(strip('Scroll of Command')).toEqual(strip('Command'))
  })
  it('item powers: activation from the field, range from "within 30 ft"; "no saving throw" is no save', () => {
    expect(strip('Temporal Echo')).toEqual({ action: { kind: 'reaction' }, range: '30 ft' })
    expect(strip('Hourglass Ward')).toEqual({ action: { kind: 'bonus' }, range: '30 ft' })
    expect(strip('Echo of Ages')).toEqual({ action: { kind: 'special' } })
    expect(strip('Detect Thoughts')).toEqual({ action: { kind: 'action' } })
  })
})
