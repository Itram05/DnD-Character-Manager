import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'

// ---------------- Modal ----------------

export function Modal(props: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    document.body.classList.add('modal-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal ${props.wide ? 'modal-wide' : ''} ${props.className ?? ''}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <header className="modal-head">
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>
        <div className="modal-body">{props.children}</div>
        {props.footer && <footer className="modal-foot">{props.footer}</footer>}
      </div>
    </div>
  )
}

export function Confirm(props: { title: string; message: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={props.title}
      onClose={props.onCancel}
      footer={
        <>
          <button className="btn" onClick={props.onCancel}>
            {t('common.cancel')}
          </button>
          <button className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </>
      }
    >
      <p>{props.message}</p>
    </Modal>
  )
}

// ---------------- Pips (uses, slots) ----------------

/** Row of circles: filled = available, hollow = spent. Clicking a filled one spends, a hollow one restores. */
export function Pips(props: { max: number; left: number; onSpend?: () => void; onRestore?: () => void; variant?: 'use' | 'mana' | 'pact' | 'death-ok' | 'death-fail'; label?: string; size?: 'sm' | 'md' }) {
  const { max, left } = props
  if (max > 12) {
    return (
      <span className={`pips-count pips-${props.variant ?? 'use'}`}>
        {props.onRestore && (
          <button className="mini-btn" onClick={props.onRestore} aria-label={t('common.restoreOne')} disabled={left >= max}>
            +
          </button>
        )}
        <b>{left}</b>/{max}
        {props.onSpend && (
          <button className="mini-btn" onClick={props.onSpend} aria-label={t('common.spendOne')} disabled={left <= 0}>
            −
          </button>
        )}
      </span>
    )
  }
  return (
    <span className={`pips pips-${props.variant ?? 'use'} pips-${props.size ?? 'md'}`} role="group" aria-label={props.label ?? t('common.usesLeft', { left, max })}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < left
        return (
          <button
            key={i}
            className={`pip ${filled ? 'pip-full' : 'pip-empty'}`}
            aria-label={filled ? t('common.spendOne') : t('common.restoreOne')}
            onClick={(e) => {
              e.stopPropagation()
              if (filled) props.onSpend?.()
              else props.onRestore?.()
            }}
            disabled={filled ? !props.onSpend : !props.onRestore}
          />
        )
      })}
    </span>
  )
}

// ---------------- inputs ----------------

export function NumberField(props: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; className?: string }) {
  const [text, setText] = useState(String(props.value))
  useEffect(() => setText(String(props.value)), [props.value])
  return (
    <label className={`field ${props.className ?? ''}`}>
      <span>{props.label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={text}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n)) props.onChange(n)
        }}
        onBlur={() => setText(String(props.value))}
      />
    </label>
  )
}

export function TextField(props: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; className?: string; list?: string }) {
  return (
    <label className={`field ${props.className ?? ''}`}>
      <span>{props.label}</span>
      <input type="text" value={props.value} placeholder={props.placeholder} list={props.list} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  )
}

export function TextArea(props: { label: string; value: string; onChange: (s: string) => void; rows?: number; placeholder?: string; hint?: string }) {
  return (
    <label className="field field-area">
      <span>{props.label}</span>
      {props.hint && <small className="hint">{props.hint}</small>}
      <textarea rows={props.rows ?? 4} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  )
}

export function Select<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <label className={`field ${props.className ?? ''}`}>
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Check(props: { label: ReactNode; checked: boolean; onChange: (b: boolean) => void; className?: string }) {
  return (
    <label className={`check ${props.className ?? ''}`}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  )
}

// ---------------- rich text (tiny markdown subset used by the SRD data) ----------------

function inline(s: string, keyBase: string): ReactNode[] {
  // **bold**, _italic_
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|_(.+?)_/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(m[1] !== undefined ? <strong key={`${keyBase}-${i++}`}>{m[1]}</strong> : <em key={`${keyBase}-${i++}`}>{m[2]}</em>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

export function RichText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  const blocks = text.split(/\n{2,}/)
  return (
    <div className={`rich ${className ?? ''}`}>
      {blocks.map((b, bi) => {
        const lines = b.split('\n')
        if (lines.every((l) => l.trim().startsWith('|'))) {
          const rows = lines.map((l) =>
            l
              .trim()
              .replace(/^\||\|$/g, '')
              .split('|')
              .map((x) => x.trim()),
          )
          return (
            <div className="table-wrap" key={bi}>
              <table>
                <thead>
                  <tr>
                    {rows[0].map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1).map((r, ri) => (
                    <tr key={ri}>
                      {r.map((cell, ci) => (
                        <td key={ci}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (lines.every((l) => /^\s*(•|-|\*)\s/.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*(•|-|\*)\s/, ''), `${bi}-${li}`)}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^\s*•\s*/, '• '), `${bi}-${li}`)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

// ---------------- toast ----------------

export interface ToastMsg {
  id: number
  title: string
  lines?: string[]
  tone?: 'info' | 'good' | 'bad'
}

export function Toasts({ items, onDismiss }: { items: ToastMsg[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((m) => (
        <div key={m.id} className={`toast toast-${m.tone ?? 'info'}`} onClick={() => onDismiss(m.id)} role="status">
          <strong>{m.title}</strong>
          {m.lines && m.lines.length > 0 && (
            <ul>
              {m.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

export function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return match
}

export const fmtMod = (n: number) => (Number.isNaN(n) ? '?' : n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
