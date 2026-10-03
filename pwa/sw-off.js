// The "off switch": what dist/sw.js becomes when OFFLINE is false in vite.config.ts.
// A browser that already has the real service worker fetches this one on its next visit; it removes
// the cached builds and unregisters itself, and from the next load the site comes from the network
// again. It does not reload anything and does not touch localStorage or IndexedDB.
self.addEventListener('install', () => {
  void self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('hero-deck-')).map((n) => caches.delete(n))))
      .then(() => self.registration.unregister()),
  )
})
