// The "Items" section of the Play screen (model: itemPanel.ts): one tile per magic item in play, with
// its name and its charges as dots; a tap opens the item's panel with all its cards (active powers, the
// attack made with it), its passive powers as chips, and the features it gives.
//
// Phone: the section is folded by default into one header line, so the first card of the hand moves down
// by that line only; the choice is remembered, like the Resources block. Computer: always open, one row
// of tiles between the top panels and the hands.
import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
import type { ItemPanelView, ItemTile } from '../model/itemPanel'
import { shortText } from '../model/play'
import { loadItemsOpen, saveItemsOpen } from '../model/storage'
import { Modal } from './common'
import { FRAME_GLYPH } from './GameCard'

function ChargeDots({ left, max }: { left: number; max: number }) {
  const label = t('items.charges', { left, max })
  // a long pool (a wand with 20 charges) is a number, like the pips elsewhere
  if (max > 10)
    return (
      <span className="tile-charges count" aria-label={label} title={label}>
        <b>{left}</b>/{max}
      </span>
    )
  return (
    <span className="tile-charges" aria-label={label} title={label}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`dot ${i < left ? 'full' : 'empty'}`} aria-hidden="true" />
      ))}
    </span>
  )
}

export function ItemsSection(props: {
  id: string
  tiles: ItemTile[]
  /** Phone: a header that folds the tiles away. */
  collapsible: boolean
  onOpen: (itemId: string) => void
  /** For tests; otherwise from storage. */
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(() => props.initiallyOpen ?? loadItemsOpen())
  const toggle = () => {
    setOpen(!open)
    saveItemsOpen(!open)
  }
  const shown = !props.collapsible || open
  const count = <span className="muted">({props.tiles.length})</span>
  return (
    <section id={props.id} className={`play-items panel nav-target ${props.collapsible ? 'collapsible' : ''} ${shown ? 'open' : ''}`}>
      {props.collapsible ? (
        <button className="items-toggle" onClick={toggle} aria-expanded={open} title={open ? t('items.hide') : t('items.show')}>
          <span className="items-title">
            {t('items.title')} {count}
          </span>
          <svg className="items-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d={open ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <h3>
          {t('items.title')} {count}
        </h3>
      )}
      {shown && (
        <div className="item-tiles">
          {props.tiles.map(({ item, charges }) => (
            <button key={item.id} className="item-tile" onClick={() => props.onOpen(item.id)} aria-label={t('items.open', { name: item.name })} title={item.name}>
              <span className="tile-name">
                <span className="glyph" aria-hidden="true">
                  {FRAME_GLYPH.item}
                </span>
                {item.name}
              </span>
              {charges && charges.max > 0 && <ChargeDots {...charges} />}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** The panel of one item: its cards (rendered by the Play screen, so Use and Undo work as in the hands) and its chips. */
export function ItemPanel(props: { view: ItemPanelView; cards: ReactNode[]; mode: 'cards' | 'list'; onChip: (chip: ItemPanelView['chips'][number]) => void; onClose: () => void }) {
  const { view } = props
  return (
    <Modal title={<span className="zoom-title frame-text-item">{view.item.name}</span>} onClose={props.onClose} className="item-panel frame-item" wide>
      <p className="hint">{t('items.hint')}</p>
      {view.item.description?.trim() && <p className="item-panel-desc">{shortText(view.item.description, 220)}</p>}
      {view.charges && view.charges.max > 0 && (
        <p className="item-panel-charges">
          <span className="muted">{t('power.pool', { item: view.item.name })}</span> <ChargeDots {...view.charges} /> <span className="muted">{t('items.charges', view.charges)}</span>
        </p>
      )}
      {props.cards.length > 0 ? (
        <>
          <h4 className="kind-title">
            {t('items.cards')} <span className="muted">({props.cards.length})</span>
          </h4>
          <div className={props.mode === 'cards' ? 'card-grid' : 'card-list'}>{props.cards}</div>
        </>
      ) : (
        <p className="muted">{t('items.nothing')}</p>
      )}
      {view.chips.length > 0 && (
        <>
          <h4 className="kind-title">{t('items.passive')}</h4>
          <div className="passive-chips">
            {view.chips.map((chip) => (
              <button key={chip.key} className={`passive-chip frame-${chip.frame}`} onClick={() => props.onChip(chip)} title={shortText(chip.description, 200)}>
                <span className="glyph" aria-hidden="true">
                  {FRAME_GLYPH[chip.frame as keyof typeof FRAME_GLYPH] ?? FRAME_GLYPH.item}
                </span>
                {chip.name}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
