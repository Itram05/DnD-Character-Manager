// One image on the whole screen. Zoom: mouse wheel, pinch, double click / double tap, the + and − buttons.
// Move: drag (when zoomed in). Next / previous: the arrows, the arrow keys, or a sideways swipe while the
// picture is not zoomed. Close: Esc or ✕. The arithmetic is in model/images.ts (tested without a browser).
//
// Marks on the map (pins, routes, tokens): drawn over the picture by MapMarks, changed through model/mapMarks.ts.
// The viewer opens LOOKING: a tap on a mark shows its name and note, and nothing can be moved, so
// dragging the map never drags a pin. "Edit map" in the bar under the picture turns editing on: then a
// drag that starts on a mark moves the mark (a drag anywhere else still moves the map, two fingers still
// pinch), and a tap on the map adds what the chosen tool adds. Every change is one step of Undo.
// "Layers" (in the bar, while looking) shows and hides pins, routes and tokens and sets the size of the
// marks: the character's own choices (preferences.maps), for all of its maps.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '../i18n'
import { FIT, clampView, fitSize, maxScale, stepIndex, zoomAt, type Box, type View } from '../model/images'
import { imageStore } from '../model/imageStore'
import { newId } from '../model/id'
import { DEFAULT_MAP_PREFS, mapPrefs, setLayerShown, setMapPref, shownMarks } from '../model/prefs'
import {
  MARK_PX,
  addPin,
  addRoute,
  addRoutePoint,
  addToken,
  freeTokenColor,
  hitTest,
  marksCount,
  movePin,
  moveRoutePoint,
  moveToken,
  nextName,
  nextTokenName,
  patchPin,
  patchRoute,
  patchToken,
  pinsOf,
  removePin,
  removeRoute,
  removeRoutePoint,
  removeToken,
  routesOf,
  scaleUnit,
  setScale,
  toPoint,
  toScreen,
  tokensOf,
} from '../model/mapMarks'
import type { Character, CharacterImage, MapLayer, MapPoint } from '../model/types'
import { MapMarks, markTargets, routeLineAt, routeText, rulerTargets, sameMark, type Drag, type Sel, type Target } from './MapMarks'
import { LayersPanel, MapBar, PinPanel, RoutePanel, ScalePanel, TokenPanel, ToolHint, type PanelAt, type Tool } from './MapTools'
import type { SheetApi } from './Sheet'

const TAP_MS = 300
const TAP_MOVE = 10
const SWIPE = 60
const BUTTON_ZOOM = 1.6
const DOUBLE_TAP_ZOOM = 2.5

type Loaded = { id: string; url: string | null }

/**
 * `api`: the sheet, for changing the marks and for Undo. Without it the viewer only shows them.
 */
export function ImageViewer(props: { characterId: string; images: CharacterImage[]; index: number; onIndex: (i: number) => void; onClose: () => void; api?: SheetApi }) {
  const { images, index, onIndex, onClose, api } = props
  const image = images[index]
  const count = images.length
  const stage = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [screen, setScreen] = useState<Box>({ width: 0, height: 0 })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [measured, setMeasured] = useState<(Box & { id: string }) | null>(null)
  const [view, setViewState] = useState<View>(FIT)
  const [dragging, setDragging] = useState(false)
  // ----- the marks -----
  const [edit, setEdit] = useState(false)
  const [tool, setToolState] = useState<Tool>('select')
  const [sel, setSel] = useState<Sel | null>(null)
  // the scale tool's ruler: the two points being set, not stored until "Save"
  const [ruler, setRuler] = useState<MapPoint[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  // the mark made by the last tap: its name field takes the keyboard
  const [fresh, setFresh] = useState<string | null>(null)
  const [layersOpen, setLayersOpen] = useState(false)
  // the character's choices for the marks: which layers are shown, how big, with names or without
  const prefs = api ? mapPrefs(api.c) : DEFAULT_MAP_PREFS
  const markSize = MARK_PX[prefs.size]
  // what is drawn and can be touched: the image without its hidden layers
  const shown = image ? shownMarks(image, prefs.hide) : image

  // the picture's own size: from the entry, or (a hand-written file without it) from the loaded picture
  const natural: Box = image?.width && image.height ? { width: image.width, height: image.height } : measured && measured.id === image?.id ? measured : { width: 0, height: 0 }
  const fit = fitSize(natural, screen)
  const max = maxScale(natural, fit)

  // the latest values for the event handlers (they are attached once)
  const live = useRef({ view, fit, screen, max, index, count, image, shown, edit, tool, sel, ruler, markSize, onClose, update: api?.update, heroName: api?.c.name ?? '' })
  live.current = { view, fit, screen, max, index, count, image, shown, edit, tool, sel, ruler, markSize, onClose, update: api?.update, heroName: api?.c.name ?? '' }
  const setView = useCallback((v: View) => {
    live.current.view = v
    setViewState(v)
  }, [])
  const go = useCallback(
    (step: number) => {
      const { index: i, count: n } = live.current
      if (n > 1) onIndex(stepIndex(i, step, n))
    },
    [onIndex],
  )
  const zoom = useCallback(
    (factor: number, px = 0, py = 0) => {
      const l = live.current
      setView(zoomAt(l.view, factor, px, py, l.fit, l.screen, l.max))
    },
    [setView],
  )

  // another picture: back to "fits the screen", nothing selected, no half-set scale
  useEffect(() => {
    setView(FIT)
    setSel(null)
    setDrag(null)
    setRuler([])
    setToolState((x) => (x === 'scale' ? 'select' : x))
  }, [image?.id, setView])

  const change = useCallback((fn: (c: Character, imageId: string) => Character) => {
    const l = live.current
    const id = l.image?.id
    if (id) l.update?.((c) => fn(c, id))
  }, [])
  // a phone: the panel of a mark in the lower half of the screen opens at the top, so the mark stays in sight
  const [panelAt, setPanelAt] = useState<PanelAt>('bottom')
  const select = useCallback((s: Sel | null, y?: number) => {
    setSel(s)
    setFresh(null)
    if (s) setLayersOpen(false)
    if (s && y !== undefined) setPanelAt(y > live.current.screen.height / 2 ? 'top' : 'bottom')
  }, [])
  /** Deletes what is selected: a pin, or a route. With `pointOnly`, just the selected point of the route. */
  const removeSel = useCallback(
    (pointOnly = false) => {
      const s = live.current.sel
      if (!s) return
      if (s.kind === 'pin') change((c, im) => removePin(c, im, s.id))
      else if (s.kind === 'token') change((c, im) => removeToken(c, im, s.id))
      else if (s.kind === 'route') {
        if (pointOnly && s.point !== undefined) {
          const n = s.point
          change((c, im) => removeRoutePoint(c, im, s.id, n))
          // the route stays in hand (unless that was its last point)
          return setSel({ kind: 'route', id: s.id })
        }
        change((c, im) => removeRoute(c, im, s.id))
      }
      setSel(null)
    },
    [change],
  )
  const setTool = (next: Tool) => {
    const l = live.current
    setToolState(next)
    setFresh(null)
    // the scale tool starts from the scale the map has
    if (next === 'scale') {
      setSel(null)
      setRuler(l.image?.scale ? [l.image.scale.a, l.image.scale.b] : [])
    }
    // the route tool goes on with the route in hand; any other selection would only be in the way
    else if (next === 'route' && l.sel?.kind !== 'route') setSel(null)
  }
  /** A tap on the picture in edit mode: the chosen tool adds its mark there. */
  const addAt = (at: MapPoint) => {
    const l = live.current
    if (!l.image) return
    if (l.tool === 'pin') {
      const id = newId()
      const name = nextName(
        t('maps.pin.word'),
        pinsOf(l.image).map((p) => p.name),
      )
      change((c, im) => addPin(setLayerShown(c, 'pins', true), im, { id, name, ...at }))
      select({ kind: 'pin', id }, toScreen(at, l.view, l.fit, l.screen).y)
      setFresh(id)
    } else if (l.tool === 'token') {
      const id = newId()
      const name = nextTokenName(l.image, { party: t('maps.token.party'), token: t('maps.token.word') }, l.heroName)
      const color = freeTokenColor(l.image)
      change((c, im) => addToken(setLayerShown(c, 'tokens', true), im, { id, name, ...at, color }))
      select({ kind: 'token', id }, toScreen(at, l.view, l.fit, l.screen).y)
      setFresh(id)
    } else if (l.tool === 'route') {
      const current = l.sel?.kind === 'route' ? routesOf(l.image).find((r) => r.id === l.sel!.id) : undefined
      if (current) {
        // the route in hand grows by one point; the panel stays where it is
        change((c, im) => addRoutePoint(c, im, current.id, at))
        setSel({ kind: 'route', id: current.id, point: current.points.length })
      } else {
        const id = newId()
        const name = nextName(
          t('maps.route.word'),
          routesOf(l.image).map((r) => r.name),
        )
        change((c, im) => addRoute(setLayerShown(c, 'routes', true), im, { id, name, points: [at] }))
        select({ kind: 'route', id, point: 0 })
        setPanelAt('bottom')
      }
    } else if (l.tool === 'scale') {
      // two taps set the ruler; a third starts it again from there
      setRuler(l.ruler.length >= 2 ? [at] : [...l.ruler, at])
    }
  }
  const setEditing = (on: boolean) => {
    setEdit(on)
    setLayersOpen(false)
    setToolState('select')
    setRuler([])
    setDrag(null)
    setFresh(null)
  }

  // load the picture from the store; until then (and if it is not in this browser) the thumbnail shows
  useEffect(() => {
    if (!image) return
    let alive = true
    let url: string | null = null
    imageStore()
      .get(props.characterId, image.id)
      .catch(() => undefined)
      .then((s) => {
        if (!alive) return
        url = s ? URL.createObjectURL(new Blob([s.data], { type: s.type })) : null
        setLoaded({ id: image.id, url })
      })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [props.characterId, image?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // the size of the stage, kept up to date (rotating the phone, resizing the window)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setScreen({ width: r.width, height: r.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // a new screen size: keep the picture inside it
  useEffect(() => {
    const l = live.current
    const v = clampView(l.view, fit, screen, max)
    if (v.scale !== l.view.scale || v.x !== l.view.x || v.y !== l.view.y) setView(v)
  }, [screen.width, screen.height, fit.width, fit.height]) // eslint-disable-line react-hooks/exhaustive-deps

  // keys, the wheel (must be a non-passive listener to stop the page from scrolling), no page scroll behind
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const l = live.current
      // typing in a field of the panel: the keys are text; Esc leaves the field
      const field = (e.target as HTMLElement | null)?.closest?.('input, textarea, select') as HTMLElement | null
      if (field) {
        if (e.key === 'Escape') field.blur()
        return
      }
      if (e.key === 'Escape') {
        if (l.sel) setSel(null)
        else l.onClose()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && l.edit && l.sel) removeSel(true)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === '+' || e.key === '=') zoom(BUTTON_ZOOM)
      else if (e.key === '-') zoom(1 / BUTTON_ZOOM)
      else if (e.key === '0') setView(FIT)
      else return
      e.preventDefault()
    }
    const el = stage.current
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!el) return
      const r = el.getBoundingClientRect()
      // deltaMode 1 = lines (Firefox with a mouse): about 16 px each
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoom(Math.exp(-dy * 0.002), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2)
    }
    window.addEventListener('keydown', onKey)
    el?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      el?.removeEventListener('wheel', onWheel)
    }
  }, [go, zoom, setView, removeSel])
  // once: the page behind does not scroll, and the keys go to the viewer. Not in the effect above: taking
  // the focus again after a change would pull it out of the field being typed in.
  useEffect(() => {
    document.body.classList.add('modal-open')
    root.current?.focus()
    return () => document.body.classList.remove('modal-open')
  }, [])

  // ----- pointers: one finger / the mouse drags, two fingers pinch -----
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ startX: 0, startY: 0, startAt: 0, moved: 0, pinched: false, lastTapAt: 0, lastTapX: 0, lastTapY: 0, hit: null as Target | null, offX: 0, offY: 0, drag: null as Drag | null })
  /** A place of the window as a place on the stage (pixels from its top left corner). */
  const onStage = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect()
    return { x: x - r.left, y: y - r.top }
  }
  const targets = () => {
    const l = live.current
    if (!l.image) return []
    // with the scale tool in hand only its ruler can be touched: a tap anywhere else sets an end of it
    if (l.edit && l.tool === 'scale') return rulerTargets(l.ruler, l.view, l.fit, l.screen)
    return l.shown ? markTargets(l.shown, l.view, l.fit, l.screen, l.markSize) : []
  }
  /** What is under a place of the stage: a mark, else the line of a route. */
  const hitAt = (x: number, y: number): Target | null => {
    const l = live.current
    const hit = hitTest(targets(), x, y)
    if (hit || !l.shown || (l.edit && l.tool === 'scale')) return hit
    return routeLineAt(l.shown, l.view, l.fit, l.screen, x, y)
  }
  const stopDrag = () => {
    gesture.current.drag = null
    setDrag(null)
  }
  const fromCentre = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect()
    return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 }
  }
  const pair = () => {
    const [a, b] = [...pointers.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
  }

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (pointers.current.size === 1) {
      const at = onStage(e.clientX, e.clientY)
      const hit = hitAt(at.x, at.y)
      // from the finger to the place the mark marks (a pin is held by its head, its tip is the place):
      // kept for the whole drag, so the mark does not jump when it starts to move
      Object.assign(g, { startX: e.clientX, startY: e.clientY, startAt: e.timeStamp, moved: 0, pinched: false, hit, offX: hit ? hit.px - at.x : 0, offY: hit ? hit.py - at.y : 0 })
    } else {
      // a second finger: this is a pinch, whatever the first one was doing
      g.pinched = true
      g.hit = null
      stopDrag()
    }
    setDragging(true)
  }

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const l = live.current
    const g = gesture.current
    if (pointers.current.size >= 2) {
      const before = pair()
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const after = pair()
      const c = fromCentre(before.mx, before.my)
      const z = before.dist > 0 ? zoomAt(l.view, after.dist / before.dist, c.x, c.y, l.fit, l.screen, l.max) : l.view
      setView(clampView({ ...z, x: z.x + after.mx - before.mx, y: z.y + after.my - before.my }, l.fit, l.screen, l.max))
      return
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.startX, e.clientY - g.startY))
    if (l.edit && g.hit && g.hit.segment === undefined) {
      // the drag began on a mark: it moves the mark, not the map
      if (g.moved < TAP_MOVE && !g.drag) return
      const at = onStage(e.clientX, e.clientY)
      const point = toPoint(at.x + g.offX, at.y + g.offY, l.view, l.fit, l.screen, true)
      if (!point) return
      g.drag = { sel: g.hit.sel, at: point }
      setDrag(g.drag)
      return
    }
    if (l.view.scale > 1) setView(clampView({ ...l.view, x: l.view.x + e.clientX - prev.x, y: l.view.y + e.clientY - prev.y }, l.fit, l.screen, l.max))
  }

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return
    if (pointers.current.size > 0) return
    setDragging(false)
    const l = live.current
    const g = gesture.current
    const moved = g.drag
    stopDrag()
    if (g.pinched || e.type === 'pointercancel') return
    if (moved) {
      const s = moved.sel
      if (s.kind === 'ruler') return setRuler(l.ruler.map((p, i) => (i === s.point ? moved.at : p)))
      if (s.kind === 'pin') change((c, im) => movePin(c, im, s.id, moved.at))
      else if (s.kind === 'token') change((c, im) => moveToken(c, im, s.id, moved.at))
      else if (s.point !== undefined) change((c, im) => moveRoutePoint(c, im, s.id, s.point!, moved.at))
      // a route's panel stays where it is while its points are moved about
      if (s.kind === 'route' && sameMark(l.sel, s)) setSel(s)
      else select(s, onStage(e.clientX, e.clientY).y)
      return
    }
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (g.moved < TAP_MOVE && e.timeStamp - g.startAt < TAP_MS) {
      // a tap on a mark selects it (its panel opens); looking, a second tap puts it away again
      if (g.hit) {
        g.lastTapAt = 0
        const h = g.hit
        if (h.sel.kind === 'ruler') return
        // a tool that adds is in hand and the tap is on a mark of another kind: the tool adds there, on the
        // very place of that mark (a route through a pinned town, a token on it). Marks of the tool's own
        // kind are selected instead; everything is selected with the Move tool.
        if (l.edit && l.tool !== 'select' && h.sel.kind !== l.tool) {
          const point = toPoint(h.px, h.py, l.view, l.fit, l.screen, true)
          if (point) addAt(point)
          return
        }
        // the route tool, on the line of the route in hand: a new point between the two it is tapped between
        if (l.edit && l.tool === 'route' && h.segment !== undefined && sameMark(l.sel, h.sel)) {
          const point = toPoint(h.px, h.py, l.view, l.fit, l.screen, true)
          const at = h.segment + 1
          if (point) change((c, im) => addRoutePoint(c, im, h.sel.id, point, at))
          return setSel({ kind: 'route', id: h.sel.id, point: at })
        }
        // looking: a route is one thing (its points matter only when editing), and a second tap puts the panel away
        const s: Sel = l.edit ? h.sel : { kind: h.sel.kind, id: h.sel.id }
        if (!l.edit && sameMark(l.sel, s)) return select(null)
        if (s.kind === 'route' && sameMark(l.sel, s)) return setSel(s)
        return select(s, h.py)
      }
      // editing, with a tool that adds: the tap adds it there (so no double tap to zoom with these tools)
      if (l.edit && l.tool !== 'select') {
        const at = onStage(e.clientX, e.clientY)
        const point = toPoint(at.x, at.y, l.view, l.fit, l.screen)
        if (point) addAt(point)
        return
      }
      if (l.sel) select(null)
      // a tap; the second one close to the first, soon after = double tap: zoom in there, or back to fit
      if (e.timeStamp - g.lastTapAt < TAP_MS * 1.3 && Math.hypot(e.clientX - g.lastTapX, e.clientY - g.lastTapY) < 40) {
        g.lastTapAt = 0
        if (l.view.scale > 1.05) setView(FIT)
        else {
          const c = fromCentre(e.clientX, e.clientY)
          zoom(DOUBLE_TAP_ZOOM, c.x, c.y)
        }
      } else Object.assign(g, { lastTapAt: e.timeStamp, lastTapX: e.clientX, lastTapY: e.clientY })
      return
    }
    // not zoomed: a sideways swipe turns the page
    // (not while editing, and not when the swipe began on a mark: that was an attempt to move it)
    if (!l.edit && !g.hit && l.view.scale <= 1.01 && Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
  }

  if (!image) return null
  const ready = loaded && loaded.id === image.id
  const src = (ready && loaded.url) || image.thumb
  const missing = ready && !loaded.url
  const zoomed = view.scale > 1.01
  // (from what is shown: a mark of a layer that has just been hidden is not selected any more)
  const marks = shown ?? image
  const pin = sel?.kind === 'pin' ? pinsOf(marks).find((p) => p.id === sel.id) : undefined
  const token = sel?.kind === 'token' ? tokensOf(marks).find((x) => x.id === sel.id) : undefined
  const route = sel?.kind === 'route' ? routesOf(marks).find((r) => r.id === sel.id) : undefined
  const counts: Record<MapLayer, number> = { pins: pinsOf(image).length, routes: routesOf(image).length, tokens: tokensOf(image).length }
  const hiddenHint = prefs.hide.length ? t('maps.layers.hidden', { list: prefs.hide.map((l) => t(`maps.layer.${l}`).toLowerCase()).join(', ') }) : undefined
  const scaling = edit && tool === 'scale'
  const aspect = natural.width ? natural : fit
  const percent = natural.width && fit.width ? Math.round(((fit.width * view.scale) / natural.width) * 100) : null

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={image.name} tabIndex={-1} ref={root}>
      <header className="viewer-bar">
        <span className="viewer-title">
          <b>{image.name}</b>
          {count > 1 && <span className="viewer-count">{t('images.viewer.count', { n: index + 1, of: count })}</span>}
        </span>
        <span className="viewer-tools">
          <button className="viewer-btn" onClick={() => zoom(1 / BUTTON_ZOOM)} disabled={!zoomed} aria-label={t('images.viewer.zoomOut')} title={t('images.viewer.zoomOut')}>
            −
          </button>
          <button className="viewer-btn viewer-fit" onClick={() => setView(FIT)} disabled={!zoomed} title={t('images.viewer.fit')} aria-label={t('images.viewer.fit')}>
            {percent === null ? '–' : `${percent}%`}
          </button>
          <button className="viewer-btn" onClick={() => zoom(BUTTON_ZOOM)} disabled={view.scale >= max} aria-label={t('images.viewer.zoomIn')} title={t('images.viewer.zoomIn')}>
            +
          </button>
          <button className="viewer-btn viewer-close" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
            ✕
          </button>
        </span>
      </header>
      <div className={`viewer-body ${drag ? 'moving-mark' : ''}`}>
      <div
        className={`viewer-stage ${zoomed ? 'zoomed' : ''} ${dragging ? 'dragging' : ''} ${edit ? `editing tool-${tool}` : ''} ${drag ? 'moving-mark' : ''}`}
        ref={stage}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        // a touch here is fully handled above. Without this the browser also sends a "click" after the finger
        // lifts, to whatever is under it by then: the panel a tap on a pin has just opened there.
        onTouchEnd={(e) => e.cancelable && e.preventDefault()}
      >
        {src ? (
          <img
            className={`viewer-img ${ready && loaded.url ? '' : 'preview'}`}
            src={src}
            alt={image.name}
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget
              if (ready && loaded.url && !(image.width && image.height)) setMeasured({ id: image.id, width: el.naturalWidth, height: el.naturalHeight })
            }}
            style={
              fit.width
                ? { width: fit.width, height: fit.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }
                : { maxWidth: '100%', maxHeight: '100%' }
            }
          />
        ) : (
          !missing && <p className="viewer-note">{t('common.loading')}</p>
        )}
        {missing && <p className="viewer-note viewer-missing">{t('images.missingLong')}</p>}
        <MapMarks image={marks} view={view} fit={fit} screen={screen} aspect={aspect} size={markSize} names={prefs.names} sel={sel} drag={drag} editing={edit} ruler={scaling ? ruler : null} onSelect={select} />
      </div>
      {scaling ? (
        <ScalePanel
          key={image.id}
          scale={image.scale}
          ruler={ruler}
          at={ruler.length === 2 && (toScreen(ruler[0], view, fit, screen).y + toScreen(ruler[1], view, fit, screen).y) / 2 > screen.height / 2 ? 'top' : 'bottom'}
          onSave={(s) => {
            change((c, im) => setScale(c, im, { a: ruler[0], b: ruler[1], ...s }))
            setTool('select')
          }}
          onRemove={() => {
            change((c, im) => setScale(c, im, null))
            setRuler([])
          }}
          onRestart={() => setRuler([])}
          onClose={() => setTool('select')}
        />
      ) : route ? (
        <RoutePanel
          key={route.id}
          route={route}
          numbers={routeText(route, image.scale, aspect)}
          unit={image.scale ? scaleUnit(image.scale) : undefined}
          mapPerDay={image.scale?.perDay}
          point={sel?.point}
          edit={edit}
          adding={edit && tool === 'route'}
          at={panelAt}
          onPatch={(patch) => change((c, im) => patchRoute(c, im, route.id, patch))}
          onDeletePoint={() => removeSel(true)}
          onDelete={() => removeSel()}
          onClose={() => select(null)}
        />
      ) : token ? (
        <TokenPanel
          key={token.id}
          token={token}
          edit={edit}
          fresh={fresh === token.id}
          at={panelAt}
          onPatch={(patch) => change((c, im) => patchToken(c, im, token.id, patch))}
          onDelete={() => removeSel()}
          onClose={() => select(null)}
        />
      ) : pin ? (
        <PinPanel
          key={pin.id}
          pin={pin}
          edit={edit}
          fresh={fresh === pin.id}
          at={panelAt}
          onPatch={(patch) => change((c, im) => patchPin(c, im, pin.id, patch))}
          onDelete={() => removeSel()}
          onClose={() => select(null)}
        />
      ) : layersOpen && api ? (
        <LayersPanel
          prefs={prefs}
          counts={counts}
          onLayer={(l, on) => api.update((c) => setLayerShown(c, l, on))}
          onNames={(on) => api.update((c) => setMapPref(c, 'names', on))}
          onSize={(s) => api.update((c) => setMapPref(c, 'size', s))}
          onClose={() => setLayersOpen(false)}
        />
      ) : (
        edit && <ToolHint tool={tool} />
      )}
      {count > 1 && (
        <>
          <button className="viewer-btn viewer-nav viewer-prev" onClick={() => go(-1)} aria-label={t('images.viewer.prev')} title={t('images.viewer.prev')}>
            ‹
          </button>
          <button className="viewer-btn viewer-nav viewer-next" onClick={() => go(1)} aria-label={t('images.viewer.next')} title={t('images.viewer.next')}>
            ›
          </button>
        </>
      )}
      </div>
      {api && <MapBar edit={edit} onEdit={setEditing} tool={tool} onTool={setTool} onUndo={api.undo} hint={hiddenHint ?? (marksCount(image) ? t('maps.lookHint') : undefined)} layersOpen={layersOpen} onLayers={() => (setLayersOpen(!layersOpen), setSel(null))} hidden={prefs.hide.length} />}
    </div>
  )
}
