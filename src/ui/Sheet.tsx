import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { characterToJson, fileNameFor, saveCharacter, type Settings } from '../model/storage'
import type { Character } from '../model/types'
import { Toasts, useMediaQuery, type HeadSlots, type ToastMsg } from './common'
import { EditView } from './EditView'
import { FeaturesView } from './FeaturesView'
import { InventoryView } from './InventoryView'
import { LevelUpView } from './LevelUpView'
import { PlayView } from './PlayView'
import { SpellsView } from './SpellsView'
import { StatsView } from './StatsView'
import { StoryView } from './StoryView'
import { TopBar } from './vitals'

export type Tab = 'play' | 'stats' | 'spells' | 'gear' | 'features' | 'story' | 'level' | 'edit'
const TABS: Tab[] = ['play', 'stats', 'spells', 'gear', 'features', 'story', 'level', 'edit']
const MOBILE_MAIN: Tab[] = ['play', 'stats', 'spells', 'gear']

export interface SheetApi {
  c: Character
  /** Apply a change. Every change is saved and can be undone. */
  update: (fn: (c: Character) => Character) => void
  toast: (m: Omit<ToastMsg, 'id'>) => void
  settings: Settings
  setSettings: (s: Settings) => void
  go: (tab: Tab) => void
  /** Slots in the sticky head for the screen's own controls (absent in tests: they render in place). */
  head?: HeadSlots
}

export function downloadJson(c: Character) {
  const blob = new Blob([characterToJson(c)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileNameFor(c)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Sheet(props: { initial: Character; tab: Tab; onTab: (t: Tab) => void; onBack: () => void; settings: Settings; setSettings: (s: Settings) => void; onRules: () => void }) {
  const [c, setC] = useState(props.initial)
  const [undo, setUndo] = useState<Character[]>([])
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [moreOpen, setMoreOpen] = useState(false)
  const nextId = useRef(1)
  const wide = useMediaQuery('(min-width: 900px)')

  const toast = useCallback((m: Omit<ToastMsg, 'id'>) => {
    const id = nextId.current++
    setToasts((ts) => [...ts.slice(-2), { ...m, id }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), m.lines && m.lines.length > 2 ? 7000 : 4000)
  }, [])

  // The ref always holds the latest character, so several updates in one event chain correctly
  // and the undo stack is pushed outside of a state updater (updaters run twice in StrictMode).
  const cRef = useRef(c)
  const update = useCallback((fn: (c: Character) => Character) => {
    const prev = cRef.current
    const next = fn(prev)
    if (next === prev) return
    const stamped = { ...next, updatedAt: new Date().toISOString() }
    cRef.current = stamped
    setUndo((u) => [...u.slice(-29), prev])
    setC(stamped)
  }, [])

  // autosave (debounced)
  const saveTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const st = saveCharacter(c)
      if (!st.ok) toast({ title: t('storage.saveFailed'), lines: [st.error ?? ''], tone: 'bad' })
    }, 250)
    return () => window.clearTimeout(saveTimer.current)
  }, [c, toast])

  // flush the pending save when leaving the sheet (the debounce above would drop it)
  useEffect(() => () => void saveCharacter(cRef.current), [])

  const doUndo = () => {
    if (!undo.length) return
    const prev = undo[undo.length - 1]
    cRef.current = prev
    setC(prev)
    setUndo(undo.slice(0, -1))
  }

  // the sticky head's height as the CSS variable --head-h: a section scrolled to (quick navigation)
  // stops under the head instead of behind it (scroll-margin-top), and the side column sticks under it
  useEffect(() => {
    const head = document.querySelector<HTMLElement>('.sheet-head')
    if (!head || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const set = () => root.style.setProperty('--head-h', `${Math.round(head.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])

  // the head's slots: callback refs, so the screens re-render (before paint) once the slots exist
  const [tools, setTools] = useState<HTMLElement | null>(null)
  const [chips, setChips] = useState<HTMLElement | null>(null)
  const api: SheetApi = { c, update, toast, settings: props.settings, setSettings: props.setSettings, go: props.onTab, head: { tools, chips } }
  const tab = props.tab

  return (
    <div className={`sheet tab-${tab}`}>
      {/* the sticky head: vitals, then the tabs (computer; a phone has them at the bottom),
          the screen's own tools (Cards/List, funnel) and the active filters */}
      <TopBar api={api} onBack={props.onBack} onUndo={undo.length ? doUndo : undefined}>
        <div className="head-row">
          {wide && (
            <nav className="tabs-top" aria-label={t('nav.sections')}>
              {TABS.map((x) => (
                <button key={x} className={`tab ${tab === x ? 'active' : ''}`} onClick={() => props.onTab(x)} aria-current={tab === x ? 'page' : undefined}>
                  {t(`tab.${x}`)}
                </button>
              ))}
              <button className="tab tab-rules" onClick={props.onRules}>
                {t('tab.rules')}
              </button>
            </nav>
          )}
          <div className="head-chips" ref={setChips} />
          <div className="head-tools" ref={setTools} />
        </div>
      </TopBar>

      <main className="sheet-main">
        {tab === 'play' && <PlayView api={api} />}
        {tab === 'stats' && <StatsView api={api} />}
        {tab === 'spells' && <SpellsView api={api} />}
        {tab === 'gear' && <InventoryView api={api} />}
        {tab === 'features' && <FeaturesView api={api} />}
        {tab === 'story' && <StoryView api={api} />}
        {tab === 'level' && <LevelUpView api={api} />}
        {tab === 'edit' && <EditView api={api} />}
      </main>

      {!wide && (
        <nav className="tabs-bottom" aria-label={t('nav.sections')}>
          {MOBILE_MAIN.map((x) => (
            <button key={x} className={`tab ${tab === x ? 'active' : ''}`} onClick={() => props.onTab(x)}>
              <span className="tab-icon" aria-hidden="true">
                {TAB_ICON[x]}
              </span>
              {t(`tab.${x}`)}
            </button>
          ))}
          <button className={`tab ${!MOBILE_MAIN.includes(tab) ? 'active' : ''}`} onClick={() => setMoreOpen((o) => !o)}>
            <span className="tab-icon" aria-hidden="true">
              ☰
            </span>
            {t('tab.more')}
          </button>
        </nav>
      )}
      {!wide && moreOpen && (
        <div className="more-sheet" onClick={() => setMoreOpen(false)}>
          <div className="more-panel" onClick={(e) => e.stopPropagation()}>
            {(['features', 'story', 'level', 'edit'] as Tab[]).map((x) => (
              <button
                key={x}
                className="btn btn-block"
                onClick={() => {
                  props.onTab(x)
                  setMoreOpen(false)
                }}
              >
                {t(`tab.${x}`)}
              </button>
            ))}
            <button className="btn btn-block" onClick={props.onRules}>
              {t('tab.rules')}
            </button>
            <button className="btn btn-block" onClick={() => downloadJson(c)}>
              {t('list.export')}
            </button>
            <button className="btn btn-block" onClick={props.onBack}>
              {t('nav.allCharacters')}
            </button>
          </div>
        </div>
      )}
      <Toasts items={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((x) => x.id !== id))} />
    </div>
  )
}

const TAB_ICON: Record<Tab, string> = {
  play: '⚔',
  stats: '◈',
  spells: '✦',
  gear: '⚒',
  features: '❖',
  story: '✎',
  level: '⇪',
  edit: '⚙',
}
