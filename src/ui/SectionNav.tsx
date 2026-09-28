// Quick navigation between the sections of a long screen (the Play screen).
// Computer (wide): a narrow column beside the content that stays in place while scrolling ("side").
// Narrower screens: a small button in the sticky head that opens the same list ("menu").
// A tap scrolls smoothly to the section; the section under the head is marked as current.
// The sections carry `scroll-margin-top` in CSS (see index.css, --head-h), so the sticky head
// never covers a section's title after the jump.
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { loadSideNavCollapsed, saveSideNavCollapsed } from '../model/storage'

/**
 * Which side of the content the computer column stands on. Change this one value to move it;
 * the CSS follows through `data-nav-side` on .play-layout (see index.css) and the arrows turn with it.
 */
export const SIDE_NAV_SIDE: 'right' | 'left' = 'right'

export interface NavSection {
  /** DOM id of the section element. */
  id: string
  label: string
  /** Number of cards in it, when that means something. */
  n?: number
  /** A group inside the section above it (a kind inside a hand): indented. */
  sub?: boolean
}

/** Height of the sticky head in px, from the --head-h variable the sheet keeps up to date. */
function headHeight(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--head-h')
  return parseFloat(v) || 0
}

/**
 * The current section: the last one whose top has passed just under the sticky head.
 * At the very bottom of the page the lowest section still on screen wins (a short last
 * section can never reach the top). Sections side by side (the three smaller hands) have the
 * same top; the first of them wins.
 */
function useActiveSection(ids: string[]): [string | undefined, (id: string) => void] {
  const [active, setActive] = useState<string | undefined>(ids[0])
  // after a tap the tapped section stays marked while the smooth scroll runs
  const pinnedUntil = useRef(0)
  const key = ids.join('|')
  useEffect(() => {
    const list = key ? key.split('|') : []
    let frame = 0
    const calc = () => {
      frame = 0
      if (Date.now() < pinnedUntil.current) return
      const line = headHeight() + 24
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let best: string | undefined
      let bestTop = -Infinity
      for (const id of list) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        const counts = atBottom ? top < window.innerHeight - 40 : top <= line
        if (counts && top > bestTop + 1) {
          best = id
          bestTop = top
        }
      }
      setActive(best ?? list[0])
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(calc)
    }
    calc()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])
  const pin = (id: string) => {
    pinnedUntil.current = Date.now() + 900
    setActive(id)
  }
  return [active, pin]
}

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

function SectionList({ sections, active, onPick }: { sections: NavSection[]; active?: string; onPick: (id: string) => void }) {
  // the hand a marked kind belongs to is marked too (lighter), so the place is clear at a glance
  const activeIndex = sections.findIndex((s) => s.id === active)
  let parent = -1
  if (activeIndex >= 0 && sections[activeIndex].sub) {
    for (let i = activeIndex; i >= 0; i--)
      if (!sections[i].sub) {
        parent = i
        break
      }
  }
  return (
    <ul className="section-list">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className={`section-link ${s.sub ? 'sub' : ''} ${i === activeIndex ? 'current' : ''} ${i === parent ? 'within' : ''}`}
            aria-current={i === activeIndex ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault()
              onPick(s.id)
            }}
          >
            <span className="section-label">{s.label}</span>
            {s.n !== undefined && <span className="section-n">{s.n}</span>}
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * The column beside the content (computer). An arrow at its top folds it into a thin strip
 * (only the arrow, turned back) so the cards get the room; the choice is remembered.
 * `initiallyCollapsed` is for tests; otherwise it comes from storage.
 */
export function SectionNavSide({ sections, initiallyCollapsed }: { sections: NavSection[]; initiallyCollapsed?: boolean }) {
  const [active, pin] = useActiveSection(sections.map((s) => s.id))
  const [collapsed, setCollapsed] = useState(() => initiallyCollapsed ?? loadSideNavCollapsed())
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    saveSideNavCollapsed(next)
  }
  // the arrow points where the column will go: toward the edge to hide it, back toward the content to show it
  const towardEdge = SIDE_NAV_SIDE === 'right' ? '»' : '«'
  const towardContent = SIDE_NAV_SIDE === 'right' ? '«' : '»'
  const label = collapsed ? t('nav.show') : t('nav.hide')
  return (
    <nav className={`section-nav side ${collapsed ? 'collapsed' : ''}`} aria-label={t('nav.onThisScreen')}>
      <div className="section-nav-top">
        {!collapsed && <h4>{t('nav.onThisScreen')}</h4>}
        <button className="section-fold" onClick={toggle} aria-expanded={!collapsed} aria-label={label} title={label}>
          <span aria-hidden="true">{collapsed ? towardContent : towardEdge}</span>
        </button>
      </div>
      {!collapsed && (
        <SectionList
          sections={sections}
          active={active}
          onPick={(id) => {
            pin(id)
            scrollToSection(id)
          }}
        />
      )}
    </nav>
  )
}

/** The small button in the sticky head and its list (phone and narrow windows). `initiallyOpen` is for tests. */
export function SectionNavMenu({ sections, initiallyOpen }: { sections: NavSection[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen ?? false)
  const [active, pin] = useActiveSection(sections.map((s) => s.id))
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className="section-anchor">
      <button className="section-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label={t('nav.jump')} title={t('nav.jump')}>
        <span aria-hidden="true">§</span>
      </button>
      {open && (
        <>
          <div className="section-backdrop" onMouseDown={() => setOpen(false)} />
          <nav className="section-nav menu" aria-label={t('nav.onThisScreen')}>
            <SectionList
              sections={sections}
              active={active}
              onPick={(id) => {
                setOpen(false)
                pin(id)
                scrollToSection(id)
              }}
            />
          </nav>
        </>
      )}
    </div>
  )
}
