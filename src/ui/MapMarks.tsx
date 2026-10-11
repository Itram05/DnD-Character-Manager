// The marks drawn over a map in the viewer: routes (lines), pins, tokens, and the ruler of the scale tool. The
// layer lies over the picture and is drawn in SCREEN pixels: a mark's place follows the picture as it is
// zoomed and moved, its size does not (see model/mapMarks.ts). The layer takes no pointer events itself:
// the viewer's stage gets them all and decides what was touched (markTargets + hitTest), so dragging the
// map, pinching and moving a mark never fight over a finger. The buttons are there for the keyboard and
// screen readers.
import { t } from '../i18n'
import type { Box, View } from '../model/images'
import { inkOn, midway, pinColor, pinIcon, pinsOf, routeColor, routeNumbers, routesOf, segmentHit, toScreen, tokenColor, tokenLabel, tokenPx, tokensOf, type Px } from '../model/mapMarks'
import type { CharacterImage, MapPoint, MapRoute, MapScale, MapToken, PinIcon } from '../model/types'

/**
 * What is selected on the map (or being dragged). `point`: for a route, the number of one of its points
 * (absent = the route as a whole); for the ruler of the scale tool, its end 0 or 1.
 */
export interface Sel {
  kind: 'pin' | 'route' | 'token' | 'ruler'
  id: string
  point?: number
}
export const sameSel = (a: Sel | null | undefined, b: Sel | null | undefined) => !!a && !!b && a.kind === b.kind && a.id === b.id && a.point === b.point
/** The same pin or the same route, whichever of its points. */
export const sameMark = (a: Sel | null | undefined, b: Sel | null | undefined) => !!a && !!b && a.kind === b.kind && a.id === b.id

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

/** A token: a disc in its colour with its few letters. */
export function TokenDisc({ token, size }: { token: MapToken; size: number }) {
  const color = tokenColor(token)
  const label = tokenLabel(token)
  return (
    <span className="token-disc" style={{ width: size, height: size, background: color, color: inkOn(color), borderColor: inkOn(color), fontSize: Math.round(size * ([...label].length > 2 ? 0.36 : 0.44)) }}>
      {label}
    </span>
  )
}

/** Where a mark is touched: the middle of what is drawn (a "pin" stands above its place), and how near counts. */
export interface Target extends Px {
  r: number
  sel: Sel
  /** The place it marks on the stage (for a "pin" that is its tip, under where it is touched). */
  px: number
  py: number
  /** A touch on the line of a route, between two of its points: the number of the point before. Not something to drag. */
  segment?: number
}

/** How near a finger has to be to a point of a line. */
const POINT_REACH = 20
const LINE_REACH = 14

/** The routes' points, then the pins, then the tokens: everything on the image that can be touched, at its place on the stage. Later = drawn on top. */
export function markTargets(image: CharacterImage, view: View, fit: Box, screen: Box, size: number): Target[] {
  if (!fit.width) return []
  const out: Target[] = []
  for (const route of routesOf(image))
    route.points.forEach((p, i) => {
      const at = toScreen(p, view, fit, screen)
      out.push({ ...at, r: POINT_REACH, sel: { kind: 'route', id: route.id, point: i }, px: at.x, py: at.y })
    })
  const r = Math.max(size * 0.62, 20)
  for (const p of pinsOf(image)) {
    const at = toScreen(p, view, fit, screen)
    out.push({ x: at.x, y: pinIcon(p) === 'pin' ? at.y - size * 0.55 : at.y, r, sel: { kind: 'pin', id: p.id }, px: at.x, py: at.y })
  }
  const tr = Math.max(tokenPx(size) * 0.62, 20)
  for (const tk of tokensOf(image)) {
    const at = toScreen(tk, view, fit, screen)
    out.push({ ...at, r: tr, sel: { kind: 'token', id: tk.id }, px: at.x, py: at.y })
  }
  return out
}

/** A touch on the line of a route (not on one of its points): which route, and after which point. The route drawn last wins. */
export function routeLineAt(image: CharacterImage, view: View, fit: Box, screen: Box, x: number, y: number): Target | null {
  if (!fit.width) return null
  const routes = routesOf(image)
  for (let i = routes.length - 1; i >= 0; i--) {
    const seg = segmentHit(
      routes[i].points.map((p) => toScreen(p, view, fit, screen)),
      x,
      y,
      LINE_REACH,
    )
    if (seg >= 0) return { x, y, r: 0, sel: { kind: 'route', id: routes[i].id }, px: x, py: y, segment: seg }
  }
  return null
}

/** The two ends of the scale tool's ruler, as things to drag. */
export function rulerTargets(ruler: readonly MapPoint[], view: View, fit: Box, screen: Box): Target[] {
  if (!fit.width) return []
  return ruler.map((p, i) => {
    const at = toScreen(p, view, fit, screen)
    return { ...at, r: 24, sel: { kind: 'ruler', id: 'ruler', point: i }, px: at.x, py: at.y }
  })
}

/** "86 mi · 3.6 days", or nothing when the map has no scale. */
export function routeText(route: MapRoute, scale: MapScale | undefined, box: Box, points: readonly MapPoint[] = route.points): string {
  const n = routeNumbers(route, scale, box, points)
  return [n.length, n.days === null ? null : t(n.days === '1' ? 'maps.route.day' : 'maps.route.days', { n: n.days })].filter(Boolean).join(' · ')
}

const xy = (pts: readonly Px[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

export function MapMarks(props: {
  image: CharacterImage
  view: View
  fit: Box
  screen: Box
  /** The picture's proportions (its own pixels when known), for measuring routes. */
  aspect?: Box
  /** The side of a pin in screen pixels. */
  size: number
  /** Names written next to the marks. */
  names: boolean
  sel: Sel | null
  drag?: Drag | null
  editing?: boolean
  /** The scale tool's ruler: 0, 1 or 2 points. Drawn only while that tool is in hand. */
  ruler?: readonly MapPoint[] | null
  onSelect?: (s: Sel) => void
}) {
  const { image, view, fit, screen, size, sel, drag } = props
  if (!fit.width) return null
  const aspect = props.aspect?.width ? props.aspect : fit
  const at = (p: MapPoint) => toScreen(p, view, fit, screen)
  const place = (s: Sel, p: MapPoint) => at(drag && sameSel(drag.sel, s) ? drag.at : p)
  // a route with the point being dragged where the finger is
  const shown = (r: MapRoute): MapPoint[] => (drag && drag.sel.kind === 'route' && drag.sel.id === r.id ? r.points.map((p, i) => (i === drag.sel.point ? drag.at : p)) : r.points)
  const ruler = props.ruler ? props.ruler.map((p, i) => (drag && drag.sel.kind === 'ruler' && drag.sel.point === i ? drag.at : p)).map(at) : null
  const routes = routesOf(image).map((r) => {
    const points = shown(r)
    return { r, points, px: points.map(at), on: !!sel && sel.kind === 'route' && sel.id === r.id }
  })
  return (
    <div className={`map-marks ${props.editing ? 'editing' : ''}`}>
      <svg className="map-lines" width={screen.width} height={screen.height} aria-hidden="true" focusable="false">
        {routes.map(({ r, px, on }) => {
          const color = routeColor(r)
          const ink = inkOn(color)
          return (
            <g key={r.id} className={`map-route ${on ? 'sel' : ''}`}>
              <polyline points={xy(px)} fill="none" stroke={on ? '#ffffff' : '#120e1a'} strokeOpacity={on ? 0.9 : 0.8} strokeWidth={on ? 7 : 6} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={xy(px)} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={on ? undefined : '9 7'} />
              {px.map((p, i) => {
                const picked = on && sel!.point === i
                // the ends are always drawn; the points between only while the route is in hand
                if (!on && i !== 0 && i !== px.length - 1) return null
                return <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={picked ? 9 : on && props.editing ? 7 : 4.5} fill={picked ? '#ffffff' : color} stroke={picked ? color : ink} strokeWidth={picked ? 3 : 1.4} />
              })}
            </g>
          )
        })}
        {ruler && ruler.length > 0 && (
          <g className="map-ruler">
            {ruler.length === 2 && (
              <>
                <polyline points={xy(ruler)} fill="none" stroke="#120e1a" strokeWidth="6" strokeLinecap="round" />
                <polyline points={xy(ruler)} fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 6" />
              </>
            )}
            {ruler.map((p, i) => (
              <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="8" fill="#ffffff" stroke="#120e1a" strokeWidth="2.5" />
            ))}
          </g>
        )}
      </svg>
      {routes.map(({ r, points, px, on }) => {
        const mid = midway(px)
        if (!mid || !(props.names || on)) return null
        const numbers = routeText(r, image.scale, aspect, points)
        return (
          <button
            key={r.id}
            type="button"
            className={`map-mark map-route-name ${on ? 'sel' : ''}`}
            style={{ transform: `translate(${mid.x.toFixed(1)}px, ${mid.y.toFixed(1)}px)` }}
            aria-label={t('maps.route.aria', { name: r.name })}
            aria-pressed={on}
            onClick={() => props.onSelect?.({ kind: 'route', id: r.id })}
          >
            <span className="map-name">
              {r.name}
              {numbers && <small> · {numbers}</small>}
            </span>
          </button>
        )
      })}
      {pinsOf(image).map((p) => {
        const s: Sel = { kind: 'pin', id: p.id }
        const where = place(s, p)
        const icon = pinIcon(p)
        const on = sameSel(sel, s)
        return (
          <button
            key={p.id}
            type="button"
            className={`map-mark map-pin icon-${icon} ${on ? 'sel' : ''} ${drag && sameSel(drag.sel, s) ? 'moving' : ''}`}
            style={{ transform: `translate(${where.x.toFixed(1)}px, ${where.y.toFixed(1)}px)`, ['--mark' as string]: `${size}px` }}
            aria-label={t('maps.pin.aria', { name: p.name })}
            aria-pressed={on}
            onClick={() => props.onSelect?.(s)}
          >
            <PinGlyph icon={icon} color={pinColor(p)} size={size} />
            {(props.names || on) && <span className="map-name">{p.name}</span>}
          </button>
        )
      })}
      {tokensOf(image).map((tk) => {
        const s: Sel = { kind: 'token', id: tk.id }
        const where = place(s, tk)
        const on = sameSel(sel, s)
        const side = tokenPx(size)
        return (
          <button
            key={tk.id}
            type="button"
            className={`map-mark map-token ${on ? 'sel' : ''} ${drag && sameSel(drag.sel, s) ? 'moving' : ''}`}
            style={{ transform: `translate(${where.x.toFixed(1)}px, ${where.y.toFixed(1)}px)`, ['--mark' as string]: `${side}px` }}
            aria-label={t('maps.token.aria', { name: tk.name })}
            aria-pressed={on}
            onClick={() => props.onSelect?.(s)}
          >
            <TokenDisc token={tk} size={side} />
            {(props.names || on) && <span className="map-name">{tk.name}</span>}
          </button>
        )
      })}
    </div>
  )
}
