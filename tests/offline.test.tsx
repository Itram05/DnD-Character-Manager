// Offline use: the service worker (pwa/sw.js) run against a fake browser, the build step that fills
// it in (pwa/plugin.ts), and the "New version ready" row. What needs a real browser (registration,
// reload with the network off, the switch between two builds) is checked by hand in Chrome; see
// "Offline use and updates" in the README.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { afterAll, describe, expect, it } from 'vitest'
import { buildVersion, listBuild, renderWorker, type BuildFile } from '../pwa/plugin'
import { UpdateRow } from '../src/ui/UpdateBar'

const SCOPE = 'https://example.test/DnD-Character-Manager/'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const file = (path: string, text: string): BuildFile => ({ path, hash: sha(text), bytes: text.length })

type Listener = (event: Record<string, unknown>) => void
type Stored = Map<string, Map<string, Response>>

/** A browser as far as the worker can see it: a network (path -> text), caches, and the events. */
function browser(caches: Stored = new Map()) {
  const network = new Map<string, string>()
  const listeners = new Map<string, Listener>()
  const requested: string[] = []
  const state = { online: true, skipped: false, unregistered: false, windows: 1 }
  const cacheApi = {
    open: async (name: string) => {
      if (!caches.has(name)) caches.set(name, new Map())
      const store = caches.get(name)!
      return {
        put: async (url: string, res: Response) => void store.set(url, res),
        match: async (url: string) => store.get(url)?.clone(),
      }
    },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  }
  const self = {
    registration: { scope: SCOPE, unregister: async () => void (state.unregistered = true) },
    addEventListener: (type: string, fn: Listener) => void listeners.set(type, fn),
    skipWaiting: async () => void (state.skipped = true),
    clients: { matchAll: async () => Array.from({ length: state.windows }) },
  }
  const fetchFake = async (input: string | { url: string }) => {
    const url = typeof input === 'string' ? input : input.url
    requested.push(url)
    if (!state.online) throw new TypeError('Failed to fetch')
    const text = network.get(url.slice(SCOPE.length))
    return text === undefined ? new Response('not found', { status: 404 }) : new Response(text, { headers: { 'content-type': 'text/plain' } })
  }
  /** fires an event and hands back what the worker gave to waitUntil / respondWith */
  const fire = (type: string, extra: Record<string, unknown> = {}) => {
    let pending: Promise<unknown> | undefined
    const keep = (p: Promise<unknown>) => void (pending = p)
    listeners.get(type)!({ ...extra, waitUntil: keep, respondWith: keep })
    return pending
  }
  return {
    caches,
    requested,
    state,
    serve(build: Record<string, string>) {
      network.clear()
      for (const [p, text] of Object.entries(build)) network.set(p, text)
    },
    run: (code: string) => void new Function('self', 'caches', 'fetch', code)(self, cacheApi, fetchFake),
    install: () => fire('install'),
    activate: () => fire('activate'),
    message: (data: string) => fire('message', { data }),
    get: (path: string, method = 'GET') => fire('fetch', { request: { url: path.startsWith('http') ? path : SCOPE + path, method } }) as Promise<Response> | undefined,
  }
}

const V1 = { 'index.html': '<html>one</html>', 'assets/index-aaa.js': 'app one', 'assets/spells-aaa.js': 'spells one' }
const V2 = { 'index.html': '<html>two</html>', 'assets/index-bbb.js': 'app two', 'assets/spells-aaa.js': 'spells one' }
const filesOf = (build: Record<string, string>) => Object.entries(build).map(([p, text]) => file(p, text))
const text = async (res: Promise<Response> | undefined) => (await res)!.text()

describe('the service worker', () => {
  it('keeps the whole build and serves it with the network off', async () => {
    const b = browser()
    b.serve(V1)
    b.run(renderWorker(filesOf(V1)))
    await b.install()
    await b.activate()
    b.state.online = false
    expect(await text(b.get(''))).toBe('<html>one</html>') // the app's address is index.html
    expect(await text(b.get('index.html'))).toBe('<html>one</html>')
    expect(await text(b.get('assets/spells-aaa.js?v=1'))).toBe('spells one')
    expect((await b.get('assets/index-aaa.js'))!.headers.get('content-type')).toBe('text/plain')
    // installing does not make it take over by itself
    expect(b.state.skipped).toBe(false)
  })

  it('leaves alone what is not its own: other sites, writes, files outside the build', async () => {
    const b = browser()
    b.serve(V1)
    b.run(renderWorker(filesOf(V1)))
    await b.install()
    expect(b.get('https://other.test/x.js')).toBeUndefined()
    expect(b.get('https://example.test/another-app/index.html')).toBeUndefined()
    expect(b.get('index.html', 'POST')).toBeUndefined()
    // in the app's folder but not in the build: asked from the network
    expect((await b.get('sw.js'))!.status).toBe(404)
    expect(b.requested.at(-1)).toBe(SCOPE + 'sw.js')
  })

  it('refuses a build it cannot download whole: a missing file, or a file of another version', async () => {
    const missing = browser()
    missing.serve({ 'index.html': V2['index.html'], 'assets/spells-aaa.js': V2['assets/spells-aaa.js'] })
    missing.run(renderWorker(filesOf(V2)))
    await expect(missing.install()).rejects.toThrow('assets/index-bbb.js: HTTP 404')
    expect([...missing.caches.keys()]).toEqual([])

    // the CDN still serves the old index.html next to the new sw.js
    const stale = browser()
    stale.serve({ ...V2, 'index.html': V1['index.html'] })
    stale.run(renderWorker(filesOf(V2)))
    await expect(stale.install()).rejects.toThrow('index.html: not the file of version')
    expect([...stale.caches.keys()]).toEqual([])
  })

  it('a new version downloads beside the old one and replaces it only when it takes over', async () => {
    const stored: Stored = new Map()
    const one = browser(stored)
    one.serve(V1)
    one.run(renderWorker(filesOf(V1)))
    await one.install()
    await one.activate()

    const two = browser(stored)
    two.serve(V2)
    two.run(renderWorker(filesOf(V2)))
    await two.install()
    // waiting: both builds are stored, the old worker still answers with the old one, nobody was told to switch
    expect(stored.size).toBe(2)
    expect(await text(one.get(''))).toBe('<html>one</html>')
    expect(await text(one.get('assets/index-aaa.js'))).toBe('app one')
    expect(two.state.skipped).toBe(false)

    await two.activate()
    expect([...stored.keys()]).toEqual([`hero-deck-${buildVersion(filesOf(V2))}`])
    two.state.online = false
    expect(await text(two.get(''))).toBe('<html>two</html>')
  })

  it('a failed download of a new version leaves the old one whole', async () => {
    const stored: Stored = new Map()
    const one = browser(stored)
    one.serve(V1)
    one.run(renderWorker(filesOf(V1)))
    await one.install()

    const two = browser(stored)
    two.serve(V1) // the new files are not there yet
    two.run(renderWorker(filesOf(V2)))
    await expect(two.install()).rejects.toThrow()
    expect([...stored.keys()]).toEqual([`hero-deck-${buildVersion(filesOf(V1))}`])
    one.state.online = false
    expect(await text(one.get(''))).toBe('<html>one</html>')
  })

  it('takes over when the page asks: APPLY always, APPLY_IF_ALONE only with no other window open', async () => {
    const b = browser()
    b.run(renderWorker(filesOf(V1)))
    b.state.windows = 2
    await b.message('APPLY_IF_ALONE')
    expect(b.state.skipped).toBe(false)
    await b.message('anything else')
    expect(b.state.skipped).toBe(false)
    b.state.windows = 1
    await b.message('APPLY_IF_ALONE')
    expect(b.state.skipped).toBe(true)

    const c = browser()
    c.run(renderWorker(filesOf(V1)))
    c.state.windows = 3
    await c.message('APPLY')
    expect(c.state.skipped).toBe(true)
  })

  it('does not touch localStorage or IndexedDB (the characters and their pictures)', () => {
    for (const f of ['pwa/sw.js', 'pwa/sw-off.js']) {
      const code = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')
      expect(code).not.toMatch(/indexedDB|localStorage/i)
    }
  })

  it('the off switch removes the caches and the worker, and nothing of anyone else', async () => {
    const stored: Stored = new Map([
      ['hero-deck-abc', new Map()],
      ['someone-else', new Map()],
    ])
    const b = browser(stored)
    b.run(readFileSync('pwa/sw-off.js', 'utf8'))
    b.install()
    expect(b.state.skipped).toBe(true)
    await b.activate()
    expect([...stored.keys()]).toEqual(['someone-else'])
    expect(b.state.unregistered).toBe(true)
  })
})

describe('the build step', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hero-deck-build-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), 'page')
  writeFileSync(join(dir, 'assets/app.js'), 'code')
  writeFileSync(join(dir, 'sw.js'), 'an older worker')

  it('lists every file of the build except the worker itself', () => {
    expect(listBuild(dir)).toEqual([
      { path: 'assets/app.js', hash: sha('code'), bytes: 4 },
      { path: 'index.html', hash: sha('page'), bytes: 4 },
    ])
  })

  it('writes the version and the list into the worker', () => {
    const files = listBuild(dir)
    const worker = renderWorker(files)
    expect(worker).toContain(`const VERSION = '${buildVersion(files)}'`)
    expect(worker).toContain(JSON.stringify(files.map((f) => [f.path, f.hash])))
    expect(worker).not.toMatch(/__VERSION__|__FILES__/)
  })

  it('the version changes with any file and only then', () => {
    const before = buildVersion(listBuild(dir))
    writeFileSync(join(dir, 'sw.js'), 'another worker')
    expect(buildVersion(listBuild(dir))).toBe(before)
    writeFileSync(join(dir, 'assets/app.js'), 'code!')
    expect(buildVersion(listBuild(dir))).not.toBe(before)
  })
})

describe('the app around the worker', () => {
  it('the row says a version is ready and offers Reload and Later', () => {
    const html = renderToString(<UpdateRow onReload={() => {}} onLater={() => {}} />)
    expect(html).toContain('New version ready')
    expect(html).toContain('Reload')
    expect(html).toContain('aria-label="Later')
  })

  it('the page links the manifest, and the manifest works from a sub-folder', () => {
    const page = readFileSync('index.html', 'utf8')
    expect(page).toContain('<link rel="manifest" href="./manifest.webmanifest" />')
    expect(page).toContain('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />')
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
    expect(manifest.name).toBe('Hero Deck')
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./')
    expect(manifest.display).toBe('standalone')
    // the same colour as <meta name="theme-color"> and --bg of the dark theme
    const colour = page.match(/name="theme-color" content="(#[0-9a-f]{6})"/)![1]
    expect(manifest.theme_color).toBe(colour)
    expect(manifest.background_color).toBe(colour)
    expect(readFileSync('src/index.css', 'utf8')).toContain(`--bg: ${colour};`)
    // every icon exists, is a PNG of the size it claims, and is addressed relative to the manifest
    const sizes: Record<string, string[]> = {}
    for (const icon of manifest.icons) {
      expect(icon.src).not.toMatch(/^\/|^http/)
      const png = readFileSync(join('public', icon.src))
      expect(png.subarray(1, 4).toString()).toBe('PNG')
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes)
      ;(sizes[icon.purpose] ??= []).push(icon.sizes)
    }
    expect(sizes).toEqual({ any: ['192x192', '512x512'], maskable: ['512x512'] })
  })

  it('the service worker is registered only by the built app, never in dev', () => {
    expect(readFileSync('src/pwa.ts', 'utf8')).toContain("if (!import.meta.env.PROD || !__OFFLINE__ || !('serviceWorker' in navigator)) return")
  })
})
