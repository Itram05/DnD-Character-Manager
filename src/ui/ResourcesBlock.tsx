// Phone only: spell slots, Sorcery Points, concentration and the healing potions folded into one short
// block, so the cards start near the top of the screen instead of a screen and a half down.
//
// Folded (the default), the block is a summary of what is left, readable without opening it:
//   - a chip per slot level with the slots left ("3" over a small "L2"), pact slots as "P", then SP;
//   - the spell you concentrate on, with an "end" button, or "No concentration";
//   - a chip per healing potion you have, whose "−" drinks one straight away (the usual mid-fight tap).
// Tapping the header (or any slot chip) unfolds it into the full panels (the pips to spend and restore,
// Convert, the "+" of the potions). The choice is remembered, like the computer's side column.
// A computer (900px and up) never sees this block; it keeps the panels as they were.
import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
import type { HealingRow, ManaRow } from '../model/play'
import type { Item } from '../model/types'
import { loadResourcesOpen, saveResourcesOpen } from '../model/storage'

/** "Greater Healing" -> "Greater", "Healing" stays: the chip has room for one word. */
const potionShort = (name: string) => {
  const n = name.replace(/^potion of\s+/i, '').trim()
  const w = n.split(/\s+/)
  return w.length > 1 && /^healing$/i.test(w[w.length - 1]) ? w.slice(0, -1).join(' ') : n
}

export function ResourcesBlock(props: {
  id: string
  mana: ManaRow[]
  sp?: { left: number; max: number }
  conc: string
  onEndConcentration: () => void
  potions: HealingRow[]
  onDrink: (i: Item) => void
  /** The full panels, shown unfolded. */
  children: ReactNode
  /** For tests; otherwise from storage. */
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(() => props.initiallyOpen ?? loadResourcesOpen())
  const toggle = (next = !open) => {
    setOpen(next)
    saveResourcesOpen(next)
  }
  const { mana, sp, conc, potions } = props
  const have = potions.filter((p) => p.item && p.quantity > 0)

  return (
    <section id={props.id} className={`res panel nav-target ${open ? 'open' : ''} ${conc ? 'conc-on' : ''}`}>
      <button className="res-toggle" onClick={() => toggle()} aria-expanded={open} title={open ? t('res.hide') : t('res.show')}>
        <span className="res-title">{t('res.title')}</span>
        <svg className="res-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d={open ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="res-full">{props.children}</div>
      ) : (
        <div className="res-summary">
          {(mana.length > 0 || sp) && (
            <div className="res-line res-slots">
              {mana.map((r) => {
                const left = r.max - r.used
                return (
                  <button
                    key={`${r.kind}-${r.level}`}
                    className={`res-chip res-${r.kind} ${left <= 0 ? 'none' : ''}`}
                    onClick={() => toggle(true)}
                    aria-label={r.kind === 'pact' ? t('res.pact', { n: r.level, left, max: r.max }) : t('res.slot', { n: r.level, left, max: r.max })}
                    title={r.kind === 'pact' ? t('res.pact', { n: r.level, left, max: r.max }) : t('res.slot', { n: r.level, left, max: r.max })}
                  >
                    <span className="res-lv" aria-hidden="true">
                      {r.kind === 'pact' ? `P${r.level}` : r.level}
                    </span>
                    <b aria-hidden="true">{left}</b>
                  </button>
                )
              })}
              {sp && (
                <button className={`res-chip res-sp ${sp.left <= 0 ? 'none' : ''}`} onClick={() => toggle(true)} aria-label={t('flex.pointsLeft', sp)} title={t('flex.pointsLeft', sp)}>
                  <span className="res-lv" aria-hidden="true">
                    {t('res.sp')}
                  </span>
                  <b aria-hidden="true">{sp.left}</b>
                </button>
              )}
            </div>
          )}
          <div className="res-line res-rest">
            {conc ? (
              <span className="res-conc on">
                <span className="glyph" aria-hidden="true">
                  ✦
                </span>
                <span className="res-conc-name" title={conc}>
                  {conc}
                </span>
                <button className="mini-btn" onClick={props.onEndConcentration} aria-label={t('res.endConc', { name: conc })} title={t('res.endConc', { name: conc })}>
                  ✕
                </button>
              </span>
            ) : (
              <span className="res-conc">{t('res.noConc')}</span>
            )}
            {have.map((p) => (
              <span key={p.item!.id} className="res-potion" title={p.name}>
                <button className="mini-btn" onClick={() => props.onDrink(p.item!)} aria-label={t('res.drink', { name: p.name, n: p.quantity })}>
                  −
                </button>
                <span className="res-pn">{potionShort(p.name)}</span>
                <b>×{p.quantity}</b>
              </span>
            ))}
            {have.length === 0 && <span className="res-nopot">{t('res.noPotions')}</span>}
          </div>
        </div>
      )}
    </section>
  )
}
