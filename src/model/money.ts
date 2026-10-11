// Money: which coins the Gear tab shows, and adding or taking an amount typed by the player.
// The five amounts stay in `inventory.money` whatever is shown: hiding a coin never changes it.
import { COINS, type Character, type Coin } from './types'

/** A character without the preference sees gold only (the owner's table counts in gold). */
export const DEFAULT_COINS: readonly Coin[] = ['gp']

/** The coins the Money panel shows, most valuable first. Never empty. */
export function shownCoins(c: Pick<Character, 'preferences'>): Coin[] {
  const set = c.preferences.money?.coins
  const out = COINS.filter((k) => (set?.length ? set : DEFAULT_COINS).includes(k))
  return out.length ? out : [...DEFAULT_COINS]
}

/** Hidden coins the character has some of: the panel names them in one line, so money is never out of sight unnoticed. */
export function hiddenCoinsWithMoney(c: Pick<Character, 'preferences' | 'inventory'>): { coin: Coin; amount: number }[] {
  const shown = shownCoins(c)
  return COINS.filter((k) => !shown.includes(k) && c.inventory.money[k] > 0).map((coin) => ({ coin, amount: c.inventory.money[coin] }))
}

/** Shows or hides one coin. The last shown coin stays (an empty Money panel helps nobody). The default set is stored as "absent". */
export function setCoinShown(c: Character, coin: Coin, on: boolean): Character {
  const now = shownCoins(c)
  if (now.includes(coin) === on) return c
  const next = COINS.filter((k) => (k === coin ? on : now.includes(k)))
  if (next.length === 0) return c
  const isDefault = next.length === DEFAULT_COINS.length && next.every((k) => DEFAULT_COINS.includes(k))
  const { coins: _old, ...rest } = c.preferences.money ?? {}
  void _old
  const money = isDefault ? rest : { ...rest, coins: next }
  const { money: _m, ...prefs } = c.preferences
  void _m
  return { ...c, preferences: Object.keys(money).length ? { ...prefs, money } : prefs }
}

/** The whole number typed into the amount field: "50" -> 50, " 1 250 " -> 1250, "1,250" -> 1250. Anything else (empty, 0, a minus, letters) -> undefined. */
export function parseAmount(text: string): number | undefined {
  const s = text.replace(/[\s,]/g, '')
  if (!/^\d+$/.test(s)) return undefined
  const n = Number(s)
  return Number.isSafeInteger(n) && n > 0 ? n : undefined
}

export type MoneyChange =
  | { ok: true; character: Character; total: number }
  /** Taking more than there is: refused, nothing changes. `have` is what the character has of that coin. */
  | { ok: false; have: number }

/**
 * Adds `delta` of one coin to the total (negative = takes it away). The total never goes below zero:
 * taking more than there is changes nothing and says how much there is, instead of quietly stopping at 0
 * (a wrong total that looks right is worse than a refusal).
 */
export function changeMoney(c: Character, coin: Coin, delta: number): MoneyChange {
  const have = c.inventory.money[coin]
  const total = have + Math.trunc(delta)
  if (total < 0) return { ok: false, have }
  return { ok: true, total, character: { ...c, inventory: { ...c.inventory, money: { ...c.inventory.money, [coin]: total } } } }
}
