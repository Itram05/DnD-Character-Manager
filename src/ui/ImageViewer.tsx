// One image on the whole screen. Zoom: mouse wheel, pinch, double click / double tap, the + and − buttons.
// Move: drag (when zoomed in). Next / previous: the arrows, the arrow keys, or a sideways swipe while the
// picture is not zoomed. Close: Esc or ✕. The arithmetic is in model/images.ts (tested without a browser).
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '../i18n'
import { FIT, clampView, fitSize, maxScale, stepIndex, zoomAt, type Box, type View } from '../model/images'
import { imageStore } from '../model/imageStore'
import type { CharacterImage } from '../model/types'

const TAP_MS = 300
const TAP_MOVE = 10
const SWIPE = 60
const BUTTON_ZOOM = 1.6
const DOUBLE_TAP_ZOOM = 2.5

type Loaded = { id: string; url: string | null }

export function ImageViewer(props: { characterId: string; images: CharacterImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { images, index, onIndex, onClose } = props
  const image = images[index]
  const count = images.length
  const stage = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [screen, setScreen] = useState<Box>({ width: 0, height: 0 })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [measured, setMeasured] = useState<(Box & { id: string }) | null>(null)
  const [view, setViewState] = useState<View>(FIT)
  const [dragging, setDragging] = useState(false)

  // the picture's own size: from the entry, or (a hand-written file without it) from the loaded picture
  const natural: Box = image?.width && image.height ? { width: image.width, height: image.height } : measured && measured.id === image?.id ? measured : { width: 0, height: 0 }
  const fit = fitSize(natural, screen)
  const max = maxScale(natural, fit)

  // the latest values for the event handlers (they are attached once)
  const live = useRef({ view, fit, screen, max, index, count })
  live.current = { view, fit, screen, max, index, count }
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

  // another picture: back to "fits the screen"
  useEffect(() => setView(FIT), [image?.id, setView])

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
      if (e.key === 'Escape') onClose()
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
    document.body.classList.add('modal-open')
    root.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      el?.removeEventListener('wheel', onWheel)
      document.body.classList.remove('modal-open')
    }
  }, [go, zoom, setView, onClose])

  // ----- pointers: one finger / the mouse drags, two fingers pinch -----
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ startX: 0, startY: 0, startAt: 0, moved: 0, pinched: false, lastTapAt: 0, lastTapX: 0, lastTapY: 0 })
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
    if (pointers.current.size === 1) Object.assign(g, { startX: e.clientX, startY: e.clientY, startAt: e.timeStamp, moved: 0, pinched: false })
    else g.pinched = true
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
    if (l.view.scale > 1) setView(clampView({ ...l.view, x: l.view.x + e.clientX - prev.x, y: l.view.y + e.clientY - prev.y }, l.fit, l.screen, l.max))
  }

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return
    if (pointers.current.size > 0) return
    setDragging(false)
    const l = live.current
    const g = gesture.current
    if (g.pinched || e.type === 'pointercancel') return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (g.moved < TAP_MOVE && e.timeStamp - g.startAt < TAP_MS) {
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
    if (l.view.scale <= 1.01 && Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
  }

  if (!image) return null
  const ready = loaded && loaded.id === image.id
  const src = (ready && loaded.url) || image.thumb
  const missing = ready && !loaded.url
  const zoomed = view.scale > 1.01
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
      <div
        className={`viewer-stage ${zoomed ? 'zoomed' : ''} ${dragging ? 'dragging' : ''}`}
        ref={stage}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
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
      </div>
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
  )
}
