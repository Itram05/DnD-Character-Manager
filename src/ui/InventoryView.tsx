import { useState } from 'react'
import { t } from '../i18n'
import { itemCategory } from '../model/categories'
import { carriedWeight, itemWeight, itemsIn } from '../model/containers'
import { isPinned, togglePin } from '../model/crafting'
import { playHiddenReason } from '../model/itemPanel'
import { MAX_ATTUNED, attunedCount, setAttunement, usesMax } from '../model/rules'
import type { Item } from '../model/types'
import { Pips } from './common'
import { ContainersPanel, StackDialog, bagOf, groupItems } from './ContainersPanel'
import { CraftingPanel } from './CraftingPanel'
import { ItemEditor, blankItem } from './editors'
import { MoneyPanel } from './MoneyPanel'
import type { SheetApi } from './Sheet'

export function InventoryView({ api }: { api: SheetApi }) {
  const { c, update, toast } = api
  const [edit, setEdit] = useState<Item | null>(null)
  const [stack, setStack] = useState<Item | null>(null)
  /** Set when a 4th attunement was refused: the item that was tapped. Cleared by the next attunement change. */
  const [blocked, setBlocked] = useState<string | null>(null)
  const attuned = attunedCount(c)
  const attunable = c.inventory.items.filter((i) => i.requiresAttunement)
  const show = c.preferences.gear.show
  const groups = groupItems(c, (i) => itemCategory(c, i))
  const byContainer = c.preferences.gear.groupBy === 'container'

  const setItem = (id: string, patch: Partial<Item>) =>
    update((x) => ({ ...x, inventory: { ...x.inventory, items: x.inventory.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } }))

  const toggleAttune = (i: Item) => {
    const r = setAttunement(c, i.id, !i.attuned)
    if (!r.ok) {
      setBlocked(i.name)
      toast({ title: t('item.attuneLimit'), lines: [t('attune.freeOne', { names: r.attuned.join(', ') })], tone: 'bad' })
      return
    }
    setBlocked(null)
    update(() => r.character)
  }

  const bumpCharges = (i: Item, d: number) => {
    if (!i.charges) return
    const max = usesMax(c, i.charges.max)
    setItem(i.id, { charges: { ...i.charges, used: Math.max(0, Math.min(max, i.charges.used + d)) } })
  }

  const row = (i: Item) => {
    const max = i.charges ? usesMax(c, i.charges.max) : 0
    const hidden = playHiddenReason(c, i)
    const cat = itemCategory(c, i)
    const bag = bagOf(c, i)
    return (
      <li key={i.id} className={i.equipped ? 'equipped' : ''}>
        <div className="item-main">
          {show.category && (
            <span className="cat-mark" title={cat.name} style={cat.color ? { color: cat.color } : undefined}>
              {cat.icon ?? '•'}
            </span>
          )}
          <button className="link-btn item-name" onClick={() => setEdit(i)}>
            {i.name}
          </button>
          {show.quantity && i.quantity !== 1 && <span className="qty">×{i.quantity}</span>}
          {show.weight && i.weight ? <span className="muted item-weight">{t('box.lb', { n: itemWeight(i) })}</span> : null}
          {bag && <span className="tag">{t('box.isBag', { name: bag.name, n: itemsIn(c, bag.id).length })}</span>}
          {show.tags && (
            <>
              {i.armor && <span className="tag">{t('inv.armorTag', { n: i.armor.base })}</span>}
              {i.acBonus ? <span className="tag">AC {i.acBonus > 0 ? '+' : ''}{i.acBonus}</span> : null}
              {i.spellDcBonus ? <span className="tag">DC {i.spellDcBonus > 0 ? '+' : ''}{i.spellDcBonus}</span> : null}
              {i.spellAttackBonus ? <span className="tag">{t('inv.spellAttackTag')} {i.spellAttackBonus > 0 ? '+' : ''}{i.spellAttackBonus}</span> : null}
              {i.powers?.length ? <span className="tag">{t('power.count', { n: i.powers.length })}</span> : null}
            </>
          )}
          {hidden && <span className={`tag muted not-in-play ${hidden}`}>{t(`notInPlay.${hidden}`)}</span>}
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
          <button className="mini-btn" onClick={() => setStack(i)} aria-label={t('stack.open')} title={t('stack.open')}>
            ⇄
          </button>
          {!bag && (
            <button
              className={`mini-btn pin-btn ${isPinned(c, i.name) ? 'on' : ''}`}
              onClick={() => update((x) => togglePin(x, i.name))}
              aria-pressed={isPinned(c, i.name)}
              aria-label={isPinned(c, i.name) ? t('counter.unpin', { name: i.name }) : t('counter.pinItem', { name: i.name })}
              title={isPinned(c, i.name) ? t('counter.unpin', { name: i.name }) : t('counter.pinItem', { name: i.name })}
            >
              📌
            </button>
          )}
        </div>
        {show.charges && i.charges && (
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
  }

  return (
    <div className="inventory">
      <MoneyPanel api={api} />

      {attunable.length > 0 && (
        <section className="panel attunement">
          <h3>
            {t('attune.title')}
            <span className={`attune-count ${attuned >= MAX_ATTUNED ? 'full' : ''}`}>{t('inv.attuned', { n: attuned, max: MAX_ATTUNED })}</span>
          </h3>
          <p className="hint">{t('attune.hint')}</p>
          {blocked && (
            <p className="attune-blocked" role="alert">
              {t('attune.blocked', { name: blocked, max: MAX_ATTUNED })}
            </p>
          )}
          <div className="attune-list">
            {attunable.map((i) => (
              <button
                key={i.id}
                className={`toggle attune ${i.attuned ? 'on' : ''} ${blocked && i.attuned ? 'free-me' : ''} ${!i.attuned && attuned >= MAX_ATTUNED ? 'at-limit' : ''}`}
                onClick={() => toggleAttune(i)}
                aria-pressed={i.attuned}
              >
                {i.attuned ? '✓ ' : ''}
                {i.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <ContainersPanel api={api} />

      <section className="panel items">
        <h3>
          {t('inv.items')}
          <button className="btn btn-small" onClick={() => setEdit(blankItem())}>
            + {t('common.add')}
          </button>
        </h3>
        {c.inventory.items.length === 0 && <p className="muted">{t('inv.empty')}</p>}
        {groups.map((g) => (
          <div key={g.id} className="item-group">
            {g.label && (
              <h4 className="item-group-head">
                {g.label}
                {byContainer && (
                  <button className="mini-btn" onClick={() => setEdit(blankItem(g.id))} aria-label={t('box.addHere', { name: g.label })} title={t('box.addHere', { name: g.label })}>
                    +
                  </button>
                )}
              </h4>
            )}
            <ul className="item-rows">{g.items.map(row)}</ul>
          </div>
        ))}
        <p className="muted">{t('inv.weight', { n: Math.round(carriedWeight(c) * 10) / 10 })}</p>
      </section>
      <CraftingPanel api={api} />
      {edit && <ItemEditor api={api} initial={edit} onClose={() => setEdit(null)} />}
      {stack && <StackDialog api={api} item={stack} onClose={() => setStack(null)} />}
    </div>
  )
}

