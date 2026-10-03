// Writes dist/sw.js after the build: the service worker (pwa/sw.js) with the list of every file of
// the build and its hash. Build only; in dev there is no sw.js at all, so nothing is ever cached.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const SW_FILE = 'sw.js'

export interface BuildFile {
  /** relative to the build folder, with forward slashes */
  path: string
  hash: string
  bytes: number
}

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')

/** Every file of the build except the worker itself, sorted, so the same build gives the same list. */
export function listBuild(dir: string): BuildFile[] {
  const out: BuildFile[] = []
  const walk = (sub: string) => {
    for (const e of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${e.name}` : e.name
      if (e.isDirectory()) walk(rel)
      else if (rel !== SW_FILE) {
        const data = readFileSync(join(dir, rel))
        out.push({ path: rel, hash: sha256(data), bytes: data.byteLength })
      }
    }
  }
  walk('')
  return out.sort((a, b) => (a.path < b.path ? -1 : 1))
}

/** The version is a hash of the list: it changes when any file changes and only then. */
export const buildVersion = (files: BuildFile[]) => sha256(files.map((f) => `${f.path}:${f.hash}`).join('\n')).slice(0, 12)

export function renderWorker(files: BuildFile[]): string {
  const template = readFileSync(join(here, 'sw.js'), 'utf8')
  return template.replace('__VERSION__', buildVersion(files)).replace('__FILES__', JSON.stringify(files.map((f) => [f.path, f.hash])))
}

/** offline: false writes the off switch (pwa/sw-off.js) instead, which removes the worker from browsers that have it. */
export function offlinePlugin(offline: boolean): Plugin {
  let outDir = 'dist'
  return {
    name: 'hero-deck-offline',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      if (!offline) {
        writeFileSync(join(outDir, SW_FILE), readFileSync(join(here, 'sw-off.js')))
        console.log('offline: OFF. sw.js is the off switch (removes the service worker and its caches).')
        return
      }
      const files = listBuild(outDir)
      writeFileSync(join(outDir, SW_FILE), renderWorker(files))
      const kb = Math.round(files.reduce((n, f) => n + f.bytes, 0) / 1024)
      console.log(`offline: sw.js version ${buildVersion(files)}, ${files.length} files, ${kb} kB kept for use without a network.`)
    },
  }
}
