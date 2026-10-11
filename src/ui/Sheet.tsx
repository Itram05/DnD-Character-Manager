import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { dropUnlisted, exportWithImages, imageStore } from '../model/imageStore'
import { creaturePrefs } from '../model/creatures'
import { characterSession, fileNameFor, loadCharacter, type Elsewhere, type Settings } from '../model/storage'
import type { Character } from '../model/types'
import { Toasts, useMediaQuery, type HeadSlots, type ToastMsg } from './common'
import { CreaturesView } from './Creatures'
import { EditView } from './EditView'
import { FeaturesView } from './FeaturesView'
import { ImagesView } from './ImagesView'
import { InventoryView } from './InventoryView'
import { LevelUpView } from './LevelUpView'
import { PlayView } from './PlayView'
import { SpellsView } from './SpellsView'
import { StatsView } from './StatsView'
import { StoryView } from './StoryView'
import { TopBar } from './vitals'

export type Tab = 'play' | 'stats' | 'spells' | 'gear' | 'features' | 'creatures' | 'story' | 'images' | 'level' | 'edit'
/** Every tab, in the order shown. App.tsx reads the same list for its routes. */
export const TABS: Tab[] = ['play', 'stats', 'spells', 'gear', 'features', 'creatures', 'story', 'images', 'level', 'edit']
const MOBILE_MAIN: Tab[] = ['play', 'stats', 'spells', 'gear']

/**
 * The tabs this hero's tab row has. The Creatures tab is the hero's choice (preferences.creatures.where):
 * with "play" the creatures live only in the section of the Play screen. Its address still works.
 */
export const shownTabs = (c: Pick<Character, 'preferences'>): Tab[] => (creaturePrefs(c).where === 'play' ? TABS.filter((x) => x !== 'creatures') : TABS)

export interface SheetApi {
  c: Character
  /** Apply a change. Every change is saved and can be undone. */
  update: (fn: (c: Character) => Character) => void
  toast: (m: Omit<ToastMsg, 'id'>) => void
  settings: Settings
  setSettings: (s: Settings) => void
  /** Opens a tab; with `anchor` (the DOM id of a place in it) the page is scrolled there once the tab is drawn. */
  go: (tab: Tab, anchor?: string) => void
  /** Takes back the last change. Absent when there is nothing to take back (and in tests). For a screen that covers the head's own ↶. */
  undo?: () => void
  /** Slots in the sticky head for the screen's own controls (absent in tests: they render in place). */
  head?: HeadSlots
}

export function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Exports the character as a JSON file, its images inside (read from the browser's image store).
 * Resolves to the names of the images whose picture this browser does not have: they are in the file
 * as entries without a picture, and the caller should say so.
 */
export async function downloadJson(c: Character): Promise<string[]> {
  const { json, missing } = await exportWithImages(c, imageStore())
  downloadText(json, fileNameFor(c))
  return missing
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
  // whether the sheet holds a change that is not in storage yet; only then is anything written
  const dirty = useRef(false)
  const update = useCallback((fn: (c: Character) => Character) => {
    const prev = cRef.current
    const next = fn(prev)
    if (next === prev) return
    const stamped = { ...next, updatedAt: new Date().toISOString() }
    cRef.current = stamped
    dirty.current = true
    setUndo((u) => [...u.slice(-29), prev])
    setC(stamped)
  }, [])

  // The same character can be open in a second tab or window, or be replaced (import) or deleted from the
  // list there. This sheet must never write its older copy over that. The session (storage.ts) lets a save
  // through only while storage still holds what this sheet last read or wrote; when it holds something
  // else, STORAGE WINS: the sheet shows that version, with a toast. A change of this sheet that was not
  // written yet is then dropped, and the toast says so. That is at most what was done in the last quarter
  // second (the autosave delay), unless saving had already failed. Undo is emptied: its steps are states
  // of the older version, and stepping back would put that version over the other tab's.
  const [session] = useState(() => characterSession(props.initial.id))
  const [gone, setGone] = useState(false)
  const takeOver = useCallback(
    (found: Elsewhere) => {
      if (found.kind === 'same') return
      const unsaved = dirty.current
      dirty.current = false
      if (found.kind === 'gone') return setGone(true)
      cRef.current = found.character
      setC(found.character)
      setUndo([])
      toast(unsaved ? { title: t('sync.replacedUnsaved'), lines: [t('sync.replacedUnsavedHint')], tone: 'bad' } : { title: t('sync.replaced') })
    },
    [toast],
  )
  const save = useCallback(() => {
    if (!dirty.current) return
    const r = session.save(cRef.current)
    if (r.kind === 'saved') dirty.current = false
    else if (r.kind === 'failed') toast({ title: t('storage.saveFailed'), lines: [r.error], tone: 'bad' })
    else takeOver(r)
  }, [session, takeOver, toast])

  // autosave (debounced)
  const saveTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(save, 250)
    return () => window.clearTimeout(saveTimer.current)
  }, [c, save])

  // flush the pending save when leaving the sheet (the debounce above would drop it)
  useEffect(() => () => save(), [save])
  // and when the page itself goes away (tab closed, app sent to the background, Reload for a new version)
  useEffect(() => {
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [save])

  // look at storage when another tab changes it (the browser's `storage` event goes to every OTHER tab),
  // and when this tab comes back to the front: a tab the browser had put to sleep gets no events.
  // On the way to the back the pending save is written at once: the browser slows the timers of a hidden
  // tab, and the tab that comes to the front should find this one's last change already in storage.
  useEffect(() => {
    const look = () => takeOver(session.check())
    const onStorage = (e: StorageEvent) => void (session.concerns(e.key) && look())
    const onVisible = () => (document.visibilityState === 'visible' ? look() : save())
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', look)
    window.addEventListener('pageshow', look)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', look)
      window.removeEventListener('pageshow', look)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session, takeOver, save])

  // once, on opening: delete the stored pictures of images removed earlier. Not at the moment of removal,
  // so Undo can bring a removed image back for as long as the sheet stays open. A picture is kept if the
  // character lists it in storage or in this sheet at the moment of deleting, not only when it was opened.
  useEffect(() => {
    void dropUnlisted(props.initial, imageStore(), () => [cRef.current, loadCharacter(props.initial.id)]).catch(() => [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportFile = () =>
    void downloadJson(cRef.current)
      .then((missing) => missing.length && toast({ title: t('images.exportMissing'), lines: missing, tone: 'bad' }))
      .catch((e) => toast({ title: t('images.exportFailed'), lines: [String((e as Error).message ?? e)], tone: 'bad' }))

  const doUndo = () => {
    if (!undo.length) return
    const prev = undo[undo.length - 1]
    cRef.current = prev
    dirty.current = true
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
  const tab = props.tab
  // "Edit" on a section leads to the place where that section is edited: a tab, and a spot in it.
  // The spot is remembered until the tab is on the screen, then scrolled to, clear of the sticky head.
  const anchor = useRef<string | null>(null)
  const toAnchor = useCallback(() => {
    const id = anchor.current
    anchor.current = null
    const el = id ? document.getElementById(id) : null
    if (!el) return
    el.style.scrollMarginTop = 'calc(var(--head-h, 0px) + 0.5rem)'
    el.scrollIntoView({ block: 'start' })
    el.classList.add('arrived')
    window.setTimeout(() => el.classList.remove('arrived'), 1600)
  }, [])
  useEffect(() => {
    if (anchor.current) toAnchor()
  }, [tab, toAnchor])
  const go = (next: Tab, at?: string) => {
    anchor.current = at ?? null
    if (next === tab) toAnchor()
    else props.onTab(next)
  }
  const api: SheetApi = { c, update, toast, settings: props.settings, setSettings: props.setSettings, go, undo: undo.length ? doUndo : undefined, head: { tools, chips } }

  if (gone)
    return (
      <div className="list-page">
        <p className="warn">{t('sync.gone')}</p>
        <button className="btn" onClick={props.onBack}>
          {t('nav.allCharacters')}
        </button>
      </div>
    )

  return (
    <div className={`sheet tab-${tab}`}>
      {/* the sticky head: vitals, then the tabs (computer; a phone has them at the bottom),
          the screen's own tools (Cards/List, funnel) and the active filters */}
      <TopBar api={api} onBack={props.onBack} onUndo={undo.length ? doUndo : undefined}>
        <div className="head-row">
          {wide && (
            <nav className="tabs-top" aria-label={t('nav.sections')}>
              {shownTabs(c).map((x) => (
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
        {tab === 'creatures' && <CreaturesView api={api} />}
        {tab === 'story' && <StoryView api={api} />}
        {tab === 'images' && <ImagesView api={api} />}
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
            {shownTabs(c)
              .filter((x) => !MOBILE_MAIN.includes(x))
              .map((x) => (
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
            <button className="btn btn-block" onClick={exportFile}>
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
  creatures: '♞',
  story: '✎',
  images: '▦',
  level: '⇪',
  edit: '⚙',
}
