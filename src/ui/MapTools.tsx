// The controls of the marks on a map: the bar under the picture (look / edit, the tools, Undo) and the
// panel of the selected mark (its name and note; in edit mode the fields that change it).
// Both sit OUTSIDE the stage, so they never take a touch meant for the map, and the bar is at the bottom
// of the screen, under the thumb.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { DEFAULT_PIN_COLOR, MARK_COLORS, PIN_ICONS, isMarkColor, pinColor, pinIcon } from '../model/mapMarks'
import type { MapPin } from '../model/types'
import { PinGlyph } from './MapMarks'

/** What a tap on the map does in edit mode: "select" picks and moves marks, the others add one. */
export type Tool = 'select' | 'pin'
export const TOOLS: Tool[] = ['select', 'pin']

function ToolIcon({ tool }: { tool: Tool | 'layers' | 'edit' }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {tool === 'select' && <path {...line} d="M12 3 V21 M3 12 H21 M12 3 L9 6 M12 3 L15 6 M12 21 L9 18 M12 21 L15 18 M3 12 L6 9 M3 12 L6 15 M21 12 L18 9 M21 12 L18 15" />}
      {tool === 'pin' && (
        <>
          <path {...line} d="M12 22 C12 22 5 14 5 9.5 A7 7 0 1 1 19 9.5 C19 14 12 22 12 22 Z" />
          <circle cx="12" cy="9.5" r="2.2" fill="currentColor" />
        </>
      )}
      {tool === 'layers' && <path {...line} d="M12 4 L21 9 L12 14 L3 9 Z M3 13.5 L12 18.5 L21 13.5" />}
      {tool === 'edit' && <path {...line} d="M4 20 L5 15.5 L16.5 4 L20 7.5 L8.5 19 Z M14 6.5 L17.5 10" />}
    </svg>
  )
}

function BarButton(props: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`map-tool ${props.on ? 'on' : ''} ${props.className ?? ''}`} aria-pressed={props.on} disabled={props.disabled} onClick={props.onClick} title={props.label}>
      {props.children}
      <span>{props.label}</span>
    </button>
  )
}

/**
 * The bar under the picture. Looking (the default): one button that turns editing on. Editing: the tools,
 * Undo and "Done". Nothing on the map can be moved or added while looking.
 */
export function MapBar(props: { edit: boolean; onEdit: (on: boolean) => void; tool: Tool; onTool: (t: Tool) => void; onUndo?: () => void; hint?: string }) {
  if (!props.edit)
    return (
      <div className="map-bar" role="toolbar" aria-label={t('maps.bar')}>
        <span className="map-bar-hint">{props.hint}</span>
        <BarButton label={t('maps.edit')} onClick={() => props.onEdit(true)} className="map-tool-edit">
          <ToolIcon tool="edit" />
        </BarButton>
      </div>
    )
  return (
    <div className="map-bar editing" role="toolbar" aria-label={t('maps.bar')}>
      <div className="map-bar-tools">
        {TOOLS.map((x) => (
          <BarButton key={x} label={t(`maps.tool.${x}`)} on={props.tool === x} onClick={() => props.onTool(x)}>
            <ToolIcon tool={x} />
          </BarButton>
        ))}
        <BarButton label={t('maps.undo')} disabled={!props.onUndo} onClick={() => props.onUndo?.()}>
          <span className="map-tool-glyph">↶</span>
        </BarButton>
      </div>
      <button type="button" className="map-done" onClick={() => props.onEdit(false)}>
        {t('maps.done')}
      </button>
    </div>
  )
}

/**
 * A text field that changes the character when it is left (or when its panel goes away), not on every
 * key: one edit of a name is one step of Undo.
 */
export function CommitText(props: { label: string; value: string; onCommit: (s: string) => void; area?: boolean; placeholder?: string; focus?: boolean; inputMode?: 'decimal'; className?: string }) {
  const [text, setText] = useState(props.value)
  const live = useRef({ text, value: props.value, onCommit: props.onCommit })
  live.current = { text, value: props.value, onCommit: props.onCommit }
  // the value changed from outside (Undo): show it
  useEffect(() => setText(props.value), [props.value])
  const commit = () => {
    const l = live.current
    if (l.text !== l.value) l.onCommit(l.text)
  }
  useEffect(() => commit, []) // eslint-disable-line react-hooks/exhaustive-deps
  const el = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!props.focus) return
    el.current?.focus()
    el.current?.select()
  }, [props.focus])
  const common = {
    ref: el,
    value: text,
    placeholder: props.placeholder,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: commit,
  }
  return (
    <label className={`map-field ${props.className ?? ''}`}>
      <span>{props.label}</span>
      {props.area ? (
        <textarea rows={2} {...common} />
      ) : (
        <input type="text" inputMode={props.inputMode} {...common} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      )}
    </label>
  )
}

/** The palette, and a free colour beside it. */
export function ColorChoice(props: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div className="map-field map-row">
      <div className="map-swatches" role="group" aria-label={props.label}>
        {MARK_COLORS.map((col) => (
          <button key={col} type="button" className={`map-swatch ${props.value === col ? 'on' : ''}`} style={{ background: col }} aria-label={col} aria-pressed={props.value === col} onClick={() => props.onChange(col)} />
        ))}
        <label className={`map-swatch map-swatch-free ${(MARK_COLORS as readonly string[]).includes(props.value) ? '' : 'on'}`} title={t('maps.colorFree')}>
          <input type="color" value={isMarkColor(props.value) ? props.value : DEFAULT_PIN_COLOR} aria-label={t('maps.colorFree')} onChange={(e) => props.onChange(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

/** Where the panel sits on a phone: at the bottom, or at the top when the mark it is about is in the lower half (so it stays in sight). */
export type PanelAt = 'bottom' | 'top'

function PanelShell(props: { title: ReactNode; onClose: () => void; children?: ReactNode; className?: string; at?: PanelAt; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <aside className={`map-panel at-${props.at ?? 'bottom'} ${props.className ?? ''}`} aria-label={t('maps.panel')}>
      <header className="map-panel-head">
        <div className="map-panel-title">{props.title}</div>
        {props.onDelete && (
          <button type="button" className="map-delete" onClick={props.onDelete}>
            {props.deleteLabel}
          </button>
        )}
        <button type="button" className="viewer-btn map-panel-close" onClick={props.onClose} aria-label={t('common.close')} title={t('common.close')}>
          ✕
        </button>
      </header>
      {props.children}
    </aside>
  )
}

/** The selected pin. Looking: its name and note. Editing: name, note, colour, shape, delete. */
export function PinPanel(props: { pin: MapPin; edit: boolean; fresh?: boolean; at?: PanelAt; onPatch: (p: Partial<Pick<MapPin, 'name' | 'note' | 'color' | 'icon'>>) => void; onDelete: () => void; onClose: () => void }) {
  const { pin } = props
  const color = pinColor(pin)
  if (!props.edit)
    return (
      <PanelShell
        onClose={props.onClose}
        at={props.at}
        title={
          <>
            <PinGlyph icon={pinIcon(pin)} color={color} size={22} />
            <b>{pin.name}</b>
          </>
        }
      >
        {pin.note ? <p className="map-note">{pin.note}</p> : <p className="map-note muted">{t('maps.noNote')}</p>}
      </PanelShell>
    )
  return (
    <PanelShell onClose={props.onClose} at={props.at} title={<b>{t('maps.pin.title')}</b>} className="editing" onDelete={props.onDelete} deleteLabel={t('maps.pin.delete')}>
      <CommitText label={t('common.name')} value={pin.name} onCommit={(name) => props.onPatch({ name })} focus={props.fresh} />
      <CommitText label={t('maps.note')} value={pin.note ?? ''} onCommit={(note) => props.onPatch({ note })} area placeholder={t('maps.notePlaceholder')} />
      <ColorChoice label={t('maps.color')} value={color} onChange={(c) => props.onPatch({ color: c })} />
      <div className="map-field map-row">
        <div className="map-icons" role="group" aria-label={t('maps.icon')}>
          {PIN_ICONS.map((ic) => (
            <button key={ic} type="button" className={`map-icon ${pinIcon(pin) === ic ? 'on' : ''}`} aria-pressed={pinIcon(pin) === ic} aria-label={t(`maps.icon.${ic}`)} title={t(`maps.icon.${ic}`)} onClick={() => props.onPatch({ icon: ic })}>
              <PinGlyph icon={ic} color={color} size={24} />
            </button>
          ))}
        </div>
      </div>
    </PanelShell>
  )
}

/** In edit mode with nothing selected: one line that says what a tap does now. */
export function ToolHint({ tool }: { tool: Tool }) {
  return <p className="map-hint">{t(`maps.hint.${tool}`)}</p>
}
