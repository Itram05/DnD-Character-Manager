import type React from 'react'
import type { ReactNode } from 'react'
import { t } from '../i18n'
import type { Frame, PlayCard } from '../model/play'
import { titleRem } from './cardTitle'
import { CategoryBand, CategoryIcons, cardCategories } from './categoryMarks'
import { Highlighted, Pips } from './common'

export const FRAME_GLYPH: Record<Frame | 'attack', string> = {
  class: '◆',
  subclass: '◈',
  species: '❦',
  background: '✧',
  feat: '✪',
  item: '⚱',
  spell: '✦',
  other: '•',
  attack: '⚔',
}
/** Scrolls keep the spell frame (colour) but get their own glyph, so they read as "not from your slots". */
export const SCROLL_GLYPH = '✉'
/** Potions other than healing ones: item frame, their own glyph. */
export const POTION_GLYPH = '⚗'
const glyphOf = (card: CardFace) => (card.kind === 'scroll' ? SCROLL_GLYPH : card.kind === 'potion' ? POTION_GLYPH : FRAME_GLYPH[card.frame])

export interface CardFace extends Omit<PlayCard, 'frame' | 'kind'> {
  frame: Frame | 'attack'
  kind: PlayCard['kind'] | 'attack'
  /** Extra line for attack cards: "+7 · 1d8+4". */
  stat?: ReactNode
}

function CostGem({ card }: { card: CardFace }) {
  if (card.kind === 'spell' || (card.kind === 'scroll' && card.spellLevel !== undefined))
    return (
      <span className={`gem gem-spell ${card.cost === 'C' ? 'gem-cantrip' : ''}`} title={card.cost === 'C' ? t('card.cantrip') : t('card.spellLevel', { n: card.cost })}>
        {card.cost}
      </span>
    )
  if (!card.cost) return null
  return (
    <span className={`gem gem-${card.zone}`} title={t(`zone.${card.zone}`)}>
      {card.cost}
    </span>
  )
}

/** Potions, scrolls: "− ×8 +". Minus uses one, plus puts one back (mis-click, or you found another). */
function QuantityStepper({ card, onUse, onUndo }: { card: CardFace; onUse?: () => void; onUndo?: () => void }) {
  const stop = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn?.()
  }
  return (
    <span className="qty-step" role="group" aria-label={t('card.quantityOf', { name: card.name, n: card.quantity ?? 0 })}>
      <button className="mini-btn" onClick={stop(onUse)} disabled={!onUse || (card.quantity ?? 0) <= 0} aria-label={t('card.useOneOf', { name: card.name })} title={t('card.useOne')}>
        −
      </button>
      <span className="qty">×{card.quantity}</span>
      <button className="mini-btn" onClick={stop(onUndo)} disabled={!onUndo} aria-label={t('card.addOneOf', { name: card.name })} title={t('card.addOne')}>
        +
      </button>
    </span>
  )
}

/** Scrolls and potions: "×2" next to a "Use" button; at 0 it says so and the card stays (tapped) until removed on the Gear tab. */
function ScrollCount({ card }: { card: CardFace }) {
  const n = card.quantity ?? 0
  return n > 0 ? (
    <span className="qty" aria-label={t('card.quantityOf', { name: card.name, n })}>
      ×{n}
    </span>
  ) : (
    <span className="qty qty-none">{t('scroll.noneLeft')}</span>
  )
}

/** Item power: how many of the item's charges one use takes ("1 ch.", "all ch."). */
function ChargeCost({ card }: { card: CardFace }) {
  if (!card.chargeCost) return null
  const all = card.chargeCost === 'all'
  return (
    <span className="tag charge-cost" title={all ? t('power.costAllHint') : t('power.costHint', { n: card.chargeCost })}>
      {all ? t('power.costAllShort') : t('power.costShort', { n: card.chargeCost })}
    </span>
  )
}

/** One card (or one list row). Clicking the body opens the zoomed view. */
export function GameCard(props: { card: CardFace; mode: 'cards' | 'list'; onOpen: () => void; onUse?: () => void; onUndo?: () => void; useLabel?: string }) {
  const { card, mode } = props
  // spells, scrolls and item powers: coloured by what they do (categoryMarks.tsx)
  const cats = cardCategories(card)
  const cls = [
    mode === 'cards' ? 'card' : 'card-row',
    `frame-${card.frame}`,
    cats.length ? `has-cat cat-${cats[0]}` : '',
    card.tapped ? 'tapped' : '',
    card.unaffordable ? 'unaffordable' : '',
  ].join(' ')

  const counter =
    card.uses && card.uses.max > 0 ? (
      <Pips max={card.uses.max} left={card.uses.left} size="sm" onSpend={props.onUse} onRestore={props.onUndo} label={t('common.usesLeft', { left: card.uses.left, max: card.uses.max })} />
    ) : card.kind === 'scroll' || card.kind === 'potion' ? (
      <ScrollCount card={card} />
    ) : card.quantity !== undefined ? (
      <QuantityStepper card={card} onUse={props.onUse} onUndo={props.onUndo} />
    ) : null

  // consumables are used with the stepper's minus button; a separate "Use" would do the same thing.
  // Scrolls and potions have no stepper: "Use" spends one (a scroll can start concentration), the count sits beside it.
  const useBtn = props.onUse && (card.quantity === undefined || card.kind === 'scroll' || card.kind === 'potion') && (
    <button
      className="card-use"
      onClick={(e) => {
        e.stopPropagation()
        props.onUse!()
      }}
      disabled={card.tapped && card.kind !== 'spell'}
      aria-label={`${props.useLabel ?? t('card.use')}: ${card.name}`}
    >
      {props.useLabel ?? t('card.use')}
    </button>
  )

  if (mode === 'list') {
    return (
      <div className={cls} onClick={props.onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && props.onOpen()}>
        <CategoryBand cats={cats} />
        <CostGem card={card} />
        <span className="row-name">
          <span className="glyph" aria-hidden="true">
            {glyphOf(card)}
          </span>
          <CategoryIcons cats={cats} />
          {card.name}
          {card.kind === 'power' && <span className="muted row-source"> · {card.sourceLabel}</span>}
          {card.concentration && <span className="tag">C</span>}
          {card.ritual && <span className="tag">R</span>}
          <ChargeCost card={card} />
        </span>
        {card.stat && <span className="row-stat">{card.stat}</span>}
        {card.meta && <span className="row-stat muted">{card.meta}</span>}
        <span className="row-counter" onClick={(e) => e.stopPropagation()}>
          {counter}
        </span>
        {useBtn}
      </div>
    )
  }

  return (
    <div className="card-slot">
      <div className={cls} onClick={props.onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && props.onOpen()} aria-label={card.tapped ? t('card.tappedLabel', { name: card.name }) : card.name}>
        <CategoryBand cats={cats} />
        <div className="card-head">
          <span className="card-name" style={{ fontSize: `${titleRem(card.name)}rem` }} title={card.name}>
            {card.name}
          </span>
          <CostGem card={card} />
        </div>
        <div className="card-type">
          <span className="glyph" aria-hidden="true">
            {glyphOf(card)}
          </span>
          <CategoryIcons cats={cats} />
          <span className="type-text">{card.sourceLabel}</span>
          {card.concentration && <span className="tag" title={t('spell.concentration')}>C</span>}
          {card.ritual && <span className="tag" title={t('spell.ritual')}>R</span>}
          <ChargeCost card={card} />
        </div>
        {card.stat && <div className="card-stat">{card.stat}</div>}
        {card.meta && <div className="card-meta">{card.meta}</div>}
        <div className="card-text"><Highlighted text={card.text} /></div>
        <div className="card-foot" onClick={(e) => e.stopPropagation()}>
          {counter}
          {useBtn}
        </div>
      </div>
    </div>
  )
}
