// The Money panel of the Gear tab (2026-10-11). Server render, no browser.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import { MoneyPanel } from './MoneyPanel'
import type { SheetApi } from './Sheet'

const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })
const hero = (preferences?: unknown, money = { cp: 3, sp: 14, ep: 0, gp: 43, pp: 0 }) =>
  normalizeCharacter({ schemaVersion: 3, name: 'Coin', classes: [{ id: 'fighter', level: 1 }], inventory: { money }, ...(preferences ? { preferences } : {}) }).character
const rows = (html: string) => [...html.matchAll(/class="coin-row coin-(\w\w)"/g)].map((m) => m[1])

describe('the Money panel', () => {
  it('shows gold only by default: its total, an amount field, − and +', () => {
    const html = renderToString(<MoneyPanel api={api(hero())} />)
    expect(rows(html)).toEqual(['gp'])
    expect(html).toMatch(/class="coin-total"[^>]*value="43"/)
    expect(html).toContain('aria-label="Amount of GP to add or take"')
    expect(html).toContain('aria-label="Take the amount from GP"')
    expect(html).toContain('aria-label="Add the amount to GP"')
  })
  it('− and + wait for an amount', () => {
    const html = renderToString(<MoneyPanel api={api(hero())} />)
    expect(html.match(/<button[^>]*class="btn coin-btn[^>]*>/g)!.every((b) => b.includes('disabled'))).toBe(true)
  })
  it('names the hidden coins that hold money, with the way to show them', () => {
    const html = renderToString(<MoneyPanel api={api(hero())} />)
    expect(html).toContain('Not shown: 14 SP, 3 CP.')
    expect(html).toContain('Choose coins')
  })
  it('says nothing about hidden coins when they are all at 0', () => {
    const html = renderToString(<MoneyPanel api={api(hero(undefined, { cp: 0, sp: 0, ep: 0, gp: 43, pp: 0 }))} />)
    expect(html).not.toContain('Not shown')
  })
  it('shows the coins the player chose, most valuable first', () => {
    const html = renderToString(<MoneyPanel api={api(hero({ money: { coins: ['cp', 'sp', 'gp', 'pp'] } }))} />)
    expect(rows(html)).toEqual(['pp', 'gp', 'sp', 'cp'])
    expect(html).not.toContain('Not shown')
  })
})
