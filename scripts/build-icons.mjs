// Draws the app icons (public/icons/*.png) from the favicon's two cards and star.
// One-off: run again only when the icon changes. Needs Chrome or Edge, which does the drawing:
//   node scripts/build-icons.mjs                      (looks in the usual Windows places)
//   CHROME=/path/to/chrome node scripts/build-icons.mjs
// The drawing itself is public/favicon.svg, put on the app's dark background (--bg) at three sizes
// of margin: change the favicon and run this to change every icon.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => p && existsSync(p))
if (!chrome) throw new Error('Chrome or Edge not found: set CHROME to its path.')

const BG = '#13111a' // --bg of the dark theme, the same as theme-color in index.html
const art = readFileSync(join(root, 'public/favicon.svg'), 'utf8').replace(/<\/?svg[^>]*>/g, '')
// the drawing fills about 52 x 62 of the favicon's 64 x 64, centred near (30, 31)
const icon = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/><g transform="translate(32 32) scale(${scale}) translate(-30 -31)">${art}</g></svg>`

const ICONS = [
  // name, pixels, scale of the drawing
  ['icon-192.png', 192, 0.8],
  ['icon-512.png', 512, 0.8],
  // maskable: Android may cut the icon to a circle or a rounded square, keeping only the middle 80%
  ['icon-maskable-512.png', 512, 0.6],
  ['apple-touch-icon.png', 180, 0.76],
]

const out = join(root, 'public/icons')
mkdirSync(out, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'hero-deck-icons-'))
try {
  for (const [name, px, scale] of ICONS) {
    const page = join(tmp, `${name}.html`)
    writeFileSync(page, `<!doctype html><style>html,body{margin:0;overflow:hidden;background:${BG}}svg{display:block;width:${px}px;height:${px}px}</style>${icon(scale)}`)
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${join(tmp, 'profile')}`, `--window-size=${px},${px}`, `--screenshot=${join(out, name)}`, pathToFileURL(page).href], { stdio: 'ignore' })
    console.log(`${name}: ${px} x ${px}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
