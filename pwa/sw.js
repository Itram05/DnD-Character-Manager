// Service worker of Hero Deck: keeps the whole build in a cache so the app opens with no network.
// This file is a template: pwa/plugin.ts fills in the two lines below at build time and writes
// dist/sw.js. It is never served in dev (npm run dev).
//
// The rules it follows:
//  - One cache per build ("hero-deck-<version>"). A build is downloaded whole or not at all: every
//    file is checked against the hash the build wrote here, and one wrong or missing file fails the
//    install, so the version already in use stays. (A CDN can serve a new sw.js next to an old
//    index.html for a few minutes after a deploy; without the check that mix would be cached.)
//  - A new version waits. It takes over when every window of the app is closed, or when the page
//    asks (the "Reload" button). It never replaces the files under a page that is in use.
//  - Only the files of the build are touched. localStorage and IndexedDB (the characters and their
//    pictures) are not this file's business and are never read, written or cleared here.
const VERSION = '__VERSION__'
const FILES = __FILES__ // [path relative to the app's folder, sha-256 hex]

const PREFIX = 'hero-deck-'
const CACHE = PREFIX + VERSION
const scope = self.registration.scope
const INDEX = new URL('index.html', scope).href

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function download() {
  const cache = await caches.open(CACHE)
  try {
    await Promise.all(
      FILES.map(async ([path, hash]) => {
        const url = new URL(path, scope).href
        // no-store: past the browser's own HTTP cache (GitHub Pages lets it keep files for 10 minutes)
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
        const body = await res.arrayBuffer()
        if ((await sha256(body)) !== hash) throw new Error(`${path}: not the file of version ${VERSION}`)
        const headers = new Headers()
        const type = res.headers.get('content-type')
        if (type) headers.set('content-type', type)
        await cache.put(url, new Response(body, { headers }))
      }),
    )
  } catch (e) {
    await caches.delete(CACHE)
    throw e
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(download())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)))),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'APPLY') {
    void self.skipWaiting()
  } else if (event.data === 'APPLY_IF_ALONE') {
    // asked by a page that has just been opened: take over only if no other window of the app is in use
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        if (windows.length <= 1) return self.skipWaiting()
      }),
    )
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return
  const url = new URL(request.url)
  const key = url.origin + url.pathname
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key === scope ? INDEX : key))
      // not a file of the build (or the browser dropped the cache): the network, as if there were no worker
      .then((hit) => hit ?? fetch(request)),
  )
})
