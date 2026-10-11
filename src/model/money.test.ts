// Money (2026-10-11): the owner wants to see gold only, type a number and press − or + next to it.
// Which coins are shown is a preference; a hidden coin keeps its amount and is never dropped from the file.
import { describe, expect, it } from 'vitest'
import { changeMoney, hiddenCoinsWithMoney, parseAmount, setCoinShown, shownCoins } from './money'
import { normalizeCharacter } from './normalize'
import { characterToJson } from './storage'

const read = (extra: Record<string, unknown> = {}) => normalizeCharacter({ schemaVersion: 3, name: 'Coin', classes: [{ id: 'fighter', level: 1 }], inventory: { money: { cp: 3, sp: 14, ep: 0, gp: 43, pp: 0 } }, ...extra })

describe('which coins are shown', () => {
  it('gold only when the character has no preference, and the file gets no preference written into it', () => {
    const { character: c, warnings } = read()
    expect(warnings).toEqual([])
    expect(shownCoins(c)).toEqual(['gp'])
    expect(c.preferences.money).toBeUndefined()
    expect(JSON.parse(characterToJson(c)).preferences.money).toBeUndefined()
  })
  it('names the hidden coins that hold money, and only those', () => {
    expect(hiddenCoinsWithMoney(read().character)).toEqual([
      { coin: 'sp', amount: 14 },
      { coin: 'cp', amount: 3 },
    ])
  })
  it('showing a coin stores the choice, most valuable first; hiding it again goes back to "absent"', () => {
    const c = read().character
    const withSilver = setCoinShown(c, 'sp', true)
    expect(withSilver.preferences.money).toEqual({ coins: ['gp', 'sp'] })
    expect(shownCoins(setCoinShown(withSilver, 'pp', true))).toEqual(['pp', 'gp', 'sp'])
    expect(setCoinShown(withSilver, 'sp', false).preferences.money).toBeUndefined()
  })
  it('the last shown coin cannot be hidden', () => {
    const c = read().character
    expect(setCoinShown(c, 'gp', false)).toBe(c)
  })
  it('hiding a coin never changes its amount', () => {
    const all = read({ preferences: { money: { coins: ['pp', 'gp', 'ep', 'sp', 'cp'] } } }).character
    const hidden = setCoinShown(all, 'sp', false)
    expect(hidden.inventory.money).toEqual(all.inventory.money)
    expect(hiddenCoinsWithMoney(hidden)).toEqual([{ coin: 'sp', amount: 14 }])
  })
})

describe('preferences.money in a file', () => {
  it('survives a round trip unchanged, with no warning', () => {
    const r = read({ preferences: { money: { coins: ['gp', 'sp'] } } })
    expect(r.warnings).toEqual([])
    const again = normalizeCharacter(JSON.parse(characterToJson(r.character)))
    expect(again.warnings).toEqual([])
    expect(again.character.preferences.money).toEqual({ coins: ['gp', 'sp'] })
  })
  it('puts the coins in the fixed order and drops unknown names, saying so', () => {
    const r = read({ preferences: { money: { coins: ['cp', 'GP', 'gems'] } } })
    expect(r.character.preferences.money).toEqual({ coins: ['gp', 'cp'] })
    expect(r.warnings).toEqual(['preferences.money.coins: "gems" not one of pp, gp, ep, sp, cp; ignored.'])
  })
  it('an empty list means the default', () => {
    const r = read({ preferences: { money: { coins: [] } } })
    expect(shownCoins(r.character)).toEqual(['gp'])
    expect(r.warnings).toEqual(['preferences.money.coins: no coin to show; using the default (gp).'])
  })
  it('keeps a field it does not know', () => {
    const r = read({ preferences: { money: { coins: ['gp'], rate: 10 } } })
    expect(r.character.preferences.money).toEqual({ coins: ['gp'], rate: 10 })
    expect(r.warnings).toEqual(['preferences.money.rate: not a field this app uses; kept unchanged.'])
  })
})

describe('the amount typed next to − and +', () => {
  it('reads whole numbers, with spaces or commas as thousands', () => {
    expect(parseAmount('50')).toBe(50)
    expect(parseAmount(' 1 250 ')).toBe(1250)
    expect(parseAmount('1,250')).toBe(1250)
  })
  it('refuses everything else', () => {
    for (const s of ['', ' ', '0', '-5', '2.5', 'ten', '1e3']) expect(parseAmount(s)).toBeUndefined()
  })
})

describe('adding and taking', () => {
  const c = read().character
  it('+ adds the amount to that coin only', () => {
    const r = changeMoney(c, 'gp', 50)
    expect(r.ok && r.total).toBe(93)
    expect(r.ok && r.character.inventory.money).toEqual({ cp: 3, sp: 14, ep: 0, gp: 93, pp: 0 })
  })
  it('− takes it, down to exactly zero', () => {
    const r = changeMoney(c, 'gp', -43)
    expect(r.ok && r.character.inventory.money.gp).toBe(0)
  })
  it('taking more than there is changes nothing and says how much there is', () => {
    expect(changeMoney(c, 'gp', -44)).toEqual({ ok: false, have: 43 })
  })
  it('does not touch the character it was given', () => {
    changeMoney(c, 'gp', 7)
    expect(c.inventory.money.gp).toBe(43)
  })
})
