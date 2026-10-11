// The controls of the marks on a map: the bar under the picture (look / edit, the tools, Undo) and the
// panel of the selected mark (its name and note; in edit mode the fields that change it).
// Both sit OUTSIDE the stage, so they never take a touch meant for the map, and the bar is at the bottom
// of the screen, under the thumb.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { DEFAULT_PIN_COLOR, DEFAULT_UNIT, MARK_COLORS, PIN_ICONS, isMarkColor, pinColor, pinIcon, routeColor, scaleUnit } from '../model/mapMarks'
import type { MapPin, MapPoint, MapRoute, MapScale } from '../model/types'
import { PinGlyph } from './MapMarks'

/** What a tap on the map does in edit mode: "select" picks and moves marks, the others add one. */
export type Tool = 'select' | 'pin' | 'route' | 'scale'
export const TOOLS: Tool[] = ['select', 'pin', 'route', 'scale']

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
      {tool === 'route' && (
        <>
          <path {...line} strokeDasharray="3 3.5" d="M5 19 L9 9 L15 14 L19 5" />
          <circle cx="5" cy="19" r="2.2" fill="currentColor" />
          <circle cx="19" cy="5" r="2.2" fill="currentColor" />
        </>
      )}
      {tool === 'scale' && <path {...line} d="M3 15 H21 M3 11 V19 M21 11 V19 M9 13 V17 M15 13 V17" />}
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

function PanelShell(props: { title: ReactNode; onClose: () => void; children?: ReactNode; className?: string; at?: PanelAt; onDelete?: () => void; deleteLabel?: string; closeLabel?: string }) {
  return (
    <aside className={`map-panel at-${props.at ?? 'bottom'} ${props.className ?? ''}`} aria-label={t('maps.panel')}>
      <header className="map-panel-head">
        <div className="map-panel-title">{props.title}</div>
        {props.onDelete && (
          <button type="button" className="map-delete" onClick={props.onDelete}>
            {props.deleteLabel}
          </button>
        )}
        {props.closeLabel ? (
          <button type="button" className="map-btn map-btn-primary" onClick={props.onClose}>
            {props.closeLabel}
          </button>
        ) : (
          <button type="button" className="viewer-btn map-panel-close" onClick={props.onClose} aria-label={t('common.close')} title={t('common.close')}>
            ✕
          </button>
        )}
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

/**
 * The selected route. Its head is always there (name, length, days); the fields are behind "Details", so
 * the panel stays one line high while points are being added to the map under it.
 */
export function RoutePanel(props: {
  route: MapRoute
  /** "86 mi · 3.6 days", or empty when the map has no scale. */
  numbers: string
  /** The unit of the map's scale, when it has one (for the day's travel field). */
  unit?: string
  /** The map's own day's travel, shown as what an empty field means. */
  mapPerDay?: number
  /** The number of the selected point, if one is. */
  point?: number
  edit: boolean
  adding?: boolean
  at?: PanelAt
  onPatch: (p: Partial<Pick<MapRoute, 'name' | 'color' | 'perDay'>>) => void
  onDeletePoint: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const { route } = props
  const [details, setDetails] = useState(false)
  const color = routeColor(route)
  const title = (
    <>
      <span className="map-route-dot" style={{ background: color }} />
      <span className="map-route-title">
        <b>{route.name}</b>
        <small>{props.numbers || t('maps.route.noScale')}</small>
      </span>
    </>
  )
  if (!props.edit) return <PanelShell onClose={props.onClose} at={props.at} title={title} />
  return (
    <PanelShell onClose={props.onClose} at={props.at} title={title} className="editing" closeLabel={props.adding ? t('maps.route.finish') : undefined}>
      <p className="map-panel-hint">{props.adding ? t('maps.route.addHint') : t('maps.route.selectHint')}</p>
      <div className="map-panel-foot">
        <button type="button" className="map-btn" aria-expanded={details} onClick={() => setDetails(!details)}>
          {t('maps.details')} {details ? '▴' : '▾'}
        </button>
        {props.point !== undefined && (
          <button type="button" className="map-btn" onClick={props.onDeletePoint}>
            {t('maps.route.deletePoint')}
          </button>
        )}
        <button type="button" className="map-delete" onClick={props.onDelete}>
          {t('maps.route.delete')}
        </button>
      </div>
      {details && (
        <>
          <CommitText label={t('common.name')} value={route.name} onCommit={(name) => props.onPatch({ name })} />
          <ColorChoice label={t('maps.color')} value={color} onChange={(c) => props.onPatch({ color: c })} />
          <CommitText
            label={props.unit ? t('maps.route.perDay', { unit: props.unit }) : t('maps.route.perDayNoScale')}
            value={route.perDay ? String(route.perDay) : ''}
            placeholder={props.mapPerDay ? t('maps.route.perDayMap', { n: props.mapPerDay }) : t('maps.route.perDayNone')}
            inputMode="decimal"
            onCommit={(s) => props.onPatch({ perDay: parseAmount(s) ?? 0 })}
          />
        </>
      )}
    </PanelShell>
  )
}

/** "24", "7,5" or " 12.5 " as a number above 0; anything else is nothing. */
export function parseAmount(s: string): number | undefined {
  const n = Number(s.trim().replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * The scale tool: two taps on the map mark a distance the player knows (the ends of the map's own scale
 * bar, or two towns), then they say how far that is. Nothing is stored until "Save".
 */
export function ScalePanel(props: { scale?: MapScale; ruler: readonly MapPoint[]; at?: PanelAt; onSave: (s: { distance: number; unit: string; perDay?: number }) => void; onRemove: () => void; onRestart: () => void; onClose: () => void }) {
  const { scale } = props
  const [distance, setDistance] = useState(scale ? String(scale.distance) : '')
  const [unit, setUnit] = useState(scale ? scaleUnit(scale) : DEFAULT_UNIT)
  // a new scale in miles starts with the usual day on foot (24 miles); an existing one says what it has
  const [perDay, setPerDay] = useState(scale ? (scale.perDay ? String(scale.perDay) : '') : '24')
  const d = parseAmount(distance)
  const ready = props.ruler.length === 2 && d !== undefined
  return (
    <PanelShell onClose={props.onClose} at={props.at} title={<b>{t('maps.scale.title')}</b>} className="editing">
      <p className="map-panel-hint">{t(props.ruler.length < 2 ? (props.ruler.length ? 'maps.scale.step2' : 'maps.scale.step1') : 'maps.scale.step3')}</p>
      {props.ruler.length === 2 && (
        <>
          <div className="map-fields">
            <label className="map-field">
              <span>{t('maps.scale.distance')}</span>
              <input type="text" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />
            </label>
            <label className="map-field">
              <span>{t('maps.scale.unit')}</span>
              <input type="text" value={unit} maxLength={12} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <label className="map-field">
              <span>{t('maps.scale.perDay')}</span>
              <input type="text" inputMode="decimal" value={perDay} placeholder="–" onChange={(e) => setPerDay(e.target.value)} />
            </label>
          </div>
          <p className="map-panel-hint">{t('maps.scale.perDayHint')}</p>
        </>
      )}
      <div className="map-panel-foot">
        <button type="button" className="map-btn map-btn-primary" disabled={!ready} onClick={() => ready && props.onSave({ distance: d, unit: unit.trim() || DEFAULT_UNIT, perDay: parseAmount(perDay) })}>
          {t('maps.scale.save')}
        </button>
        {props.ruler.length > 0 && (
          <button type="button" className="map-btn" onClick={props.onRestart}>
            {t('maps.scale.restart')}
          </button>
        )}
        {scale && (
          <button type="button" className="map-delete" onClick={props.onRemove}>
            {t('maps.scale.remove')}
          </button>
        )}
      </div>
    </PanelShell>
  )
}

/** In edit mode with nothing selected: one line that says what a tap does now. */
export function ToolHint({ tool }: { tool: Tool }) {
  return <p className="map-hint">{t(`maps.hint.${tool}`)}</p>
}
