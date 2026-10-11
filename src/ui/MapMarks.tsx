// The marks drawn over a map in the viewer: pins (and, with them, routes and tokens). The layer lies over
// the picture and is drawn in SCREEN pixels: a mark's place follows the picture as it is zoomed and
// moved, its size does not (see model/mapMarks.ts). The layer takes no pointer events itself: the
// viewer's stage gets them all and decides what was touched (hitTest), so dragging the map, pinching and
// moving a mark never fight over a finger. The buttons are there for the keyboard and screen readers.
import { t } from '../i18n'
import type { Box, View } from '../model/images'
import { inkOn, pinColor, pinIcon, pinsOf, toScreen, type Px } from '../model/mapMarks'
import type { CharacterImage, MapPoint, PinIcon } from '../model/types'

/** What is selected on the map. */
export type Sel = { kind: 'pin'; id: string }
export const sameSel = (a: Sel | null, b: Sel | null) => !!a && !!b && a.kind === b.kind && a.id === b.id

/** A mark being dragged: shown at `at` until the finger lifts (one change, one step of Undo). */
export interface Drag {
  sel: Sel
  at: MapPoint
}

const star = (() => {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.4 : 10
    const a = (Math.PI / 5) * i - Math.PI / 2
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12.6 + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
})()

/** One of the pin shapes, in a 24 x 24 box. "pin" points at its place with its tip; the others sit on it with their centre. */
export function PinGlyph({ icon, color, size }: { icon: PinIcon; color: string; size: number }) {
  const ink = inkOn(color)
  const shape = { fill: color, stroke: ink, strokeWidth: 1.4, strokeLinejoin: 'round' as const }
  return (
    <svg className="pin-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icon === 'pin' && (
        <>
          <path {...shape} d="M12 23 C12 23 4.5 14.5 4.5 9.5 A7.5 7.5 0 1 1 19.5 9.5 C19.5 14.5 12 23 12 23 Z" />
          <circle cx="12" cy="9.5" r="2.7" fill={ink} />
        </>
      )}
      {icon === 'dot' && <circle {...shape} cx="12" cy="12" r="7.5" />}
      {icon === 'star' && <polygon {...shape} points={star} />}
      {icon === 'flag' && (
        <>
          <path {...shape} d="M6.5 3.5 L20.5 8 L6.5 12.5 Z" />
          <path d="M6.5 2.5 V22" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M6.5 2.5 V22" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {icon === 'house' && <path {...shape} d="M2.5 12 L12 3.5 L21.5 12 H19 V20.5 H14 V14.5 H10 V20.5 H5 V12 Z" />}
      {icon === 'tent' && <path {...shape} d="M12 3.5 L22 20.5 H14.5 L12 14.5 L9.5 20.5 H2 Z" />}
      {icon === 'cross' && <path {...shape} d="M4.5 7.5 L7.5 4.5 L12 9 L16.5 4.5 L19.5 7.5 L15 12 L19.5 16.5 L16.5 19.5 L12 15 L7.5 19.5 L4.5 16.5 L9 12 Z" />}
      {icon === 'danger' && (
        <>
          <path {...shape} d="M12 3 L22.5 21 H1.5 Z" />
          <rect x="11" y="9" width="2" height="6.5" rx="0.8" fill={ink} />
          <circle cx="12" cy="18" r="1.25" fill={ink} />
        </>
      )}
      {icon === 'question' && (
        <>
          <circle {...shape} cx="12" cy="12" r="9.5" />
          <text x="12" y="16.8" textAnchor="middle" fontSize="13.5" fontWeight="700" fontFamily="system-ui, sans-serif" fill={ink}>
            ?
          </text>
        </>
      )}
    </svg>
  )
}

/** Where a mark is touched: the middle of what is drawn (a "pin" stands above its place), and how near counts. */
export interface Target extends Px {
  r: number
  sel: Sel
  /** The place it marks on the stage (for a "pin" that is its tip, under where it is touched). */
  px: number
  py: number
}

/** Everything on the image that can be touched, at its place on the stage. Later = drawn on top. */
export function markTargets(image: CharacterImage, view: View, fit: Box, screen: Box, size: number): Target[] {
  if (!fit.width) return []
  const r = Math.max(size * 0.62, 20)
  return pinsOf(image).map((p) => {
    const at = toScreen(p, view, fit, screen)
    return { x: at.x, y: pinIcon(p) === 'pin' ? at.y - size * 0.55 : at.y, r, sel: { kind: 'pin', id: p.id } as Sel, px: at.x, py: at.y }
  })
}

export function MapMarks(props: {
  image: CharacterImage
  view: View
  fit: Box
  screen: Box
  /** The side of a pin in screen pixels. */
  size: number
  /** Names written under the marks. */
  names: boolean
  sel: Sel | null
  drag?: Drag | null
  editing?: boolean
  onSelect?: (s: Sel) => void
}) {
  const { image, view, fit, screen, size, sel, drag } = props
  if (!fit.width) return null
  const place = (s: Sel, p: MapPoint) => toScreen(drag && sameSel(drag.sel, s) ? drag.at : p, view, fit, screen)
  return (
    <div className={`map-marks ${props.editing ? 'editing' : ''}`}>
      {pinsOf(image).map((p) => {
        const s: Sel = { kind: 'pin', id: p.id }
        const at = place(s, p)
        const icon = pinIcon(p)
        const on = sameSel(sel, s)
        return (
          <button
            key={p.id}
            type="button"
            className={`map-mark map-pin icon-${icon} ${on ? 'sel' : ''} ${drag && sameSel(drag.sel, s) ? 'moving' : ''}`}
            style={{ transform: `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`, ['--mark' as string]: `${size}px` }}
            aria-label={t('maps.pin.aria', { name: p.name })}
            aria-pressed={on}
            onClick={() => props.onSelect?.(s)}
          >
            <PinGlyph icon={icon} color={pinColor(p)} size={size} />
            {(props.names || on) && <span className="map-name">{p.name}</span>}
          </button>
        )
      })}
    </div>
  )
}
