// Offline use and updates (the page's side; the service worker itself is pwa/sw.js).
//
// How a new version arrives:
//  1. The browser re-checks sw.js when the app is opened (and we ask again when the app comes back
//     to the front after an hour or more). A changed sw.js downloads the whole new build quietly.
//  2. The new build then waits. The page in use keeps running the version it started with: nothing
//     is swapped under a game in progress. The "New version ready" row appears.
//  3. It is applied by "Reload" on that row, or by itself the next time the app is opened: closing
//     every window lets the browser switch, and a page that finds a version already waiting when it
//     starts takes it at once, before anything is on screen to lose.
// Characters (localStorage) and pictures (IndexedDB) are not part of any of this.
declare const __OFFLINE__: boolean

const HOUR = 60 * 60 * 1000
const APPLIED_AT = 'dnd-sheet.updateAppliedAt'

let ready = false
const listeners = new Set<() => void>()
let registration: ServiceWorkerRegistration | undefined
let reloading = false
/** this page asked for the switch, so it reloads when the switch happens */
let wanted = false

export const updateStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  ready: () => ready,
  /** renderToString and browsers without service workers: never ready */
  never: () => false,
}

function setReady() {
  if (ready) return
  ready = true
  listeners.forEach((fn) => fn())
}

function reload() {
  if (reloading) return
  reloading = true
  window.location.reload()
}

/** "Reload" on the row: switch to the downloaded version and load it. The open sheet saves itself on pagehide. */
export function applyUpdate() {
  const waiting = registration?.waiting
  if (!waiting) return reload() // another window has already switched: this one only needs the new files
  wanted = true
  waiting.postMessage('APPLY')
  // the worker answers by taking over ("controllerchange" below); if it never does, a plain reload
  // is harmless: the page starts again on the version it had and offers the update again
  window.setTimeout(reload, 4000)
}

function recentlyApplied(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(APPLIED_AT))
    window.sessionStorage.setItem(APPLIED_AT, String(Date.now()))
    return Date.now() - at < 60_000
  } catch {
    return true // no sessionStorage, no guard against a reload loop: do not reload by ourselves
  }
}

function watch(worker: ServiceWorker | null) {
  if (!worker) return
  worker.addEventListener('statechange', () => {
    // "installed" with a controller = a newer build is downloaded and waiting behind the one in use.
    // Without a controller this is the very first install: nothing to announce.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) setReady()
  })
}

export function startOffline() {
  if (!import.meta.env.PROD || !__OFFLINE__ || !('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  const start = async () => {
    const hadController = !!sw.controller
    sw.addEventListener('controllerchange', () => {
      if (wanted) reload()
      // switched by another window of the app: this one keeps running, and the row offers the reload
      else if (hadController) setReady()
    })
    try {
      const reg = await sw.register('./sw.js')
      registration = reg
      if (reg.waiting && hadController) {
        // a version was already waiting when the app opened (a refresh, or the phone kept the old page alive)
        setReady()
        if (!recentlyApplied()) {
          wanted = true
          reg.waiting.postMessage('APPLY_IF_ALONE')
        }
      }
      watch(reg.installing)
      reg.addEventListener('updatefound', () => watch(reg.installing))

      let checkedAt = Date.now()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - checkedAt < HOUR) return
        checkedAt = Date.now()
        reg.update().catch(() => {}) // offline: try again next time
      })
    } catch {
      // registration refused (private mode, http): the app works as before, only not offline
    }
  }
  if (document.readyState === 'complete') void start()
  else window.addEventListener('load', () => void start(), { once: true })
}
