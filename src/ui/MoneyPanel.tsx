import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { changeMoney, hiddenCoinsWithMoney, parseAmount, setCoinShown, shownCoins } from '../model/money'
import { COINS, type Coin } from '../model/types'
import { Check } from './common'
import type { SheetApi } from './Sheet'

const fmt = (n: number) => n.toLocaleString('en-US')

/**
 * One coin: its total (typed over to correct it), then an amount and − / +, which take the amount from
 * the total or add it. Every change goes through `update`, so the sheet's Undo takes it back.
 */
function CoinRow({ api, coin }: { api: SheetApi; coin: Coin }) {
  const { c, update, toast } = api
  const total = c.inventory.money[coin]
  const [text, setText] = useState(String(total))
  const [amount, setAmount] = useState('')
  useEffect(() => setText(String(total)), [total])
  const n = parseAmount(amount)
  const name = coin.toUpperCase()

  const apply = (sign: 1 | -1) => {
    if (n === undefined) return
    const r = changeMoney(c, coin, sign * n)
    if (!r.ok) {
      toast({ title: t('money.notEnough', { coin: name }), lines: [t('money.notEnoughLine', { have: fmt(r.have), n: fmt(n), coin: name })], tone: 'bad' })
      return
    }
    update(() => r.character)
    setAmount('')
    toast({ title: `${sign > 0 ? '+' : '−'}${fmt(n)} ${name}`, lines: [t('money.now', { n: fmt(r.total), coin: name })] })
  }

  return (
    <div className={`coin-row coin-${coin}`} role="group" aria-label={t(`money.coin.${coin}`)}>
      <span className="coin-name" title={t(`money.coin.${coin}`)}>
        {name}
      </span>
      <input
        className="coin-total"
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={t('money.total', { coin: name })}
        title={t('money.totalHint')}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(v)) update((x) => ({ ...x, inventory: { ...x.inventory, money: { ...x.inventory.money, [coin]: Math.max(0, Math.floor(v)) } } }))
        }}
        onBlur={() => setText(String(total))}
      />
      <span className="coin-step">
        <input
          className="coin-amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('money.amount')}
          aria-label={t('money.amountOf', { coin: name })}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="btn coin-btn coin-minus" disabled={n === undefined} onClick={() => apply(-1)} aria-label={t('money.take', { coin: name })} title={t('money.take', { coin: name })}>
          −
        </button>
        <button className="btn coin-btn coin-plus" disabled={n === undefined} onClick={() => apply(1)} aria-label={t('money.add', { coin: name })} title={t('money.add', { coin: name })}>
          +
        </button>
      </span>
    </div>
  )
}

/** Money in the Gear tab: the coins the player chose to see (gold only until they choose), each with − / + by a typed amount. */
export function MoneyPanel({ api }: { api: SheetApi }) {
  const { c, update } = api
  const [choosing, setChoosing] = useState(false)
  const shown = shownCoins(c)
  const hidden = hiddenCoinsWithMoney(c)
  return (
    <section className="panel money" id="money">
      <h3>
        {t('inv.money')}
        <button className="btn btn-small" onClick={() => setChoosing((o) => !o)} aria-expanded={choosing}>
          {t('money.coins')}
        </button>
      </h3>
      <div className="coin-rows">
        {shown.map((k) => (
          <CoinRow key={k} api={api} coin={k} />
        ))}
      </div>
      {hidden.length > 0 && (
        <p className="muted coins-hidden">
          {t('money.hidden', { list: hidden.map((h) => `${fmt(h.amount)} ${h.coin.toUpperCase()}`).join(', ') })}{' '}
          <button className="link-btn" onClick={() => setChoosing(true)}>
            {t('money.showCoins')}
          </button>
        </p>
      )}
      {choosing && (
        <div className="coin-choice">
          <p className="hint">{t('money.coinsHint')}</p>
          <div className="checks">
            {COINS.map((k) => (
              <Check key={k} label={`${k.toUpperCase()} · ${t(`money.coin.${k}`)}`} checked={shown.includes(k)} onChange={(on) => update((x) => setCoinShown(x, k, on))} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
