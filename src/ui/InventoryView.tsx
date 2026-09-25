import { useState } from 'react'
import { t } from '../i18n'
import { MAX_ATTUNED, attunedCount, usesMax } from '../model/rules'
import type { Item, Money } from '../model/types'
import { NumberField, Pips } from './common'
import { ItemEditor, blankItem } from './editors'
import type { SheetApi } from './Sheet'

const COINS: (keyof Money)[] = ['pp', 'gp', 'ep', 'sp', 'cp']

export function InventoryView({ api }: { api: SheetApi }) {
  const { c, update, toast } = api
  const [edit, setEdit] = useState<Item | null>(null)
  const attuned = attunedCount(c)
  const weight = c.inventory.items.reduce((s, i) => s + (i.weight ?? 0) * i.quantity, 0)

  const setItem = (id: string, patch: Partial<Item>) =>
    update((x) => ({ ...x, inventory: { ...x.inventory, items: x.inventory.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } }))

  const toggleAttune = (i: Item) => {
    if (!i.attuned && attuned >= MAX_ATTUNED) {
      toast({ title: t('item.attuneLimit'), tone: 'bad' })
      return
    }
    setItem(i.id, { attuned: !i.attuned })
  }

  const bumpCharges = (i: Item, d: number) => {
    if (!i.charges) return
    const max = usesMax(c, i.charges.max)
    setItem(i.id, { charges: { ...i.charges, used: Math.max(0, Math.min(max, i.charges.used + d)) } })
  }

  return (
    <div className="inventory">
      <section className="panel money">
        <h3>{t('inv.money')}</h3>
        <div className="coins">
          {COINS.map((k) => (
            <NumberField
              key={k}
              className={`coin coin-${k}`}
              label={k.toUpperCase()}
              value={c.inventory.money[k]}
              min={0}
              onChange={(n) => update((x) => ({ ...x, inventory: { ...x.inventory, money: { ...x.inventory.money, [k]: Math.max(0, Math.floor(n)) } } }))}
            />
          ))}
        </div>
      </section>

      <section className="panel items">
        <h3>
          {t('inv.items')}
          <span className={`attune-count ${attuned >= MAX_ATTUNED ? 'full' : ''}`}>{t('inv.attuned', { n: attuned, max: MAX_ATTUNED })}</span>
          <button className="btn btn-small" onClick={() => setEdit(blankItem())}>
            + {t('common.add')}
          </button>
        </h3>
        {c.inventory.items.length === 0 && <p className="muted">{t('inv.empty')}</p>}
        <ul className="item-rows">
          {c.inventory.items.map((i) => {
            const max = i.charges ? usesMax(c, i.charges.max) : 0
            return (
              <li key={i.id} className={i.equipped ? 'equipped' : ''}>
                <div className="item-main">
                  <button className="link-btn item-name" onClick={() => setEdit(i)}>
                    {i.name}
                  </button>
                  {i.quantity !== 1 && <span className="qty">×{i.quantity}</span>}
                  {i.armor && <span className="tag">{t('inv.armorTag', { n: i.armor.base })}</span>}
                  {i.acBonus ? <span className="tag">AC {i.acBonus > 0 ? '+' : ''}{i.acBonus}</span> : null}
                </div>
                <div className="item-controls">
                  <button className={`toggle ${i.equipped ? 'on' : ''}`} onClick={() => setItem(i.id, { equipped: !i.equipped })} aria-pressed={i.equipped}>
                    {t('item.equipped')}
                  </button>
                  {i.requiresAttunement && (
                    <button className={`toggle attune ${i.attuned ? 'on' : ''}`} onClick={() => toggleAttune(i)} aria-pressed={i.attuned}>
                      {t('item.attuned')}
                    </button>
                  )}
                  <span className="qty-ctl">
                    <button className="mini-btn" onClick={() => setItem(i.id, { quantity: Math.max(0, i.quantity - 1) })} aria-label={t('inv.less')}>
                      −
                    </button>
                    <button className="mini-btn" onClick={() => setItem(i.id, { quantity: i.quantity + 1 })} aria-label={t('inv.more')}>
                      +
                    </button>
                  </span>
                </div>
                {i.charges && (
                  <div className="item-charges">
                    <span className="muted">{t('item.charges')}</span>
                    <Pips max={max} left={max - Math.min(max, i.charges.used)} size="sm" onSpend={() => bumpCharges(i, 1)} onRestore={() => bumpCharges(i, -1)} />
                    <span className="muted">
                      {t(`recharge.${i.charges.recharge}`)}
                      {i.charges.regain ? ` (${i.charges.regain})` : ''}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="muted">{t('inv.weight', { n: Math.round(weight * 10) / 10 })}</p>
      </section>
      {edit && <ItemEditor api={api} initial={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
