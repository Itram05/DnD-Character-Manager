// Quick navigation between the sections of a long screen (the Play screen).
// Computer (wide): a narrow column beside the content that stays in place while scrolling ("side").
// Narrower screens: a small button in the sticky head that opens the same list ("menu").
// A tap scrolls smoothly to the section; the section under the head is marked as current.
// Sections that stand side by side on the screen are one entry (see sectionRows.ts).
// The sections carry `scroll-margin-top` in CSS (see index.css, --head-h), so the sticky head
// never covers a section's title after the jump.
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { loadSideNavCollapsed, saveSideNavCollapsed } from '../model/storage'
import { groupByRow, rowKey, type NavEntry } from './sectionRows'

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

/**
 * The list as shown: sections that start on one row of the screen joined into one entry (see sectionRows.ts).
 * Measured in the page after it is drawn, and again whenever the page changes size (a wider or narrower
 * window, the side column folded or unfolded, cards added), so on a narrow screen, where the same
 * sections stand one under another, they are separate again. Until measured (and in a server render)
 * every section is its own entry.
 */
function useRowGroups(sections: NavSection[]): NavEntry[] {
  const key = sections.map((s) => `${s.id}:${s.label}:${s.n ?? ''}:${s.sub ? 1 : 0}`).join('|')
  const [measured, setMeasured] = useState<{ key: string; entries: NavEntry[] }>()
  const latest = useRef(sections)
  useEffect(() => {
    latest.current = sections
  })
  useEffect(() => {
    let frame = 0
    let shown = ''
    const measure = () => {
      frame = 0
      const entries = groupByRow(latest.current, (id) => document.getElementById(id)?.getBoundingClientRect().top)
      const joined = rowKey(entries)
      if (joined === shown) return // nothing moved to another row: no new render
      shown = joined
      setMeasured({ key, entries })
    }
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('resize', later)
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(later)
    ro?.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', later)
      ro?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])
  if (measured && measured.key === key) return measured.entries
  return sections.map((s) => ({ ...s, members: [s.id] }))
}

/** Height of the sticky head in px, from the --head-h variable the sheet keeps up to date. */
function headHeight(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--head-h')
  return parseFloat(v) || 0
}

/**
 * The current entry: the last one whose top has passed just under the sticky head.
 * At the very bottom of the page the lowest entry still on screen wins (a short last
 * section can never reach the top). Sections side by side are one entry already (useRowGroups),
 * so the id of an entry (its first section) stands for the whole row.
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

/** The shown entries (row groups) and the current one, for either form of the navigation. */
function useNav(sections: NavSection[]) {
  const entries = useRowGroups(sections)
  const [active, pin] = useActiveSection(entries.map((e) => e.id))
  return { entries, active, pin }
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

/** A chevron drawn as a thick line (crisp at any size and in both themes, unlike a « » glyph). */
function FoldArrow({ to }: { to: 'left' | 'right' }) {
  return (
    <svg className={`fold-arrow to-${to}`} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d={to === 'right' ? 'M9 4l8 8-8 8' : 'M15 4l-8 8 8 8'} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The column beside the content (computer). It keeps the full visible height under the sticky head;
 * a handle on its inner edge (toward the content), halfway down, folds it away, like the handle of a
 * drawer. Folded, the column takes no room at all (the cards get the full width); only a small tab
 * stays, floating on the screen's edge halfway down, to bring it back. The choice is remembered.
 * `initiallyCollapsed` is for tests; otherwise it comes from storage.
 */
export function SectionNavSide({ sections, initiallyCollapsed }: { sections: NavSection[]; initiallyCollapsed?: boolean }) {
  const { entries, active, pin } = useNav(sections)
  const [collapsed, setCollapsed] = useState(() => initiallyCollapsed ?? loadSideNavCollapsed())
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    saveSideNavCollapsed(next)
  }
  // the arrow points where the column will go: toward the edge to hide it, back toward the content to show it
  const towardEdge = SIDE_NAV_SIDE
  const towardContent = SIDE_NAV_SIDE === 'right' ? 'left' : 'right'
  const label = collapsed ? t('nav.show') : t('nav.hide')
  return (
    <nav className={`section-nav side ${collapsed ? 'collapsed' : ''}`} aria-label={t('nav.onThisScreen')}>
      <button className="section-fold" onClick={toggle} aria-expanded={!collapsed} aria-label={label} title={label}>
        <FoldArrow to={collapsed ? towardContent : towardEdge} />
      </button>
      {!collapsed && (
        <div className="section-nav-body">
          <h4>{t('nav.onThisScreen')}</h4>
          <SectionList
            sections={entries}
            active={active}
            onPick={(id) => {
              pin(id)
              scrollToSection(id)
            }}
          />
        </div>
      )}
    </nav>
  )
}

/** The small button in the sticky head and its list (phone and narrow windows). `initiallyOpen` is for tests. */
export function SectionNavMenu({ sections, initiallyOpen }: { sections: NavSection[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen ?? false)
  const { entries, active, pin } = useNav(sections)
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
              sections={entries}
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
