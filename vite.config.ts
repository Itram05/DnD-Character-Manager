/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { offlinePlugin } from './pwa/plugin.ts'

// Offline use (installable app, service worker). true: the build writes dist/sw.js, which keeps the
// whole build in the browser. false is the way back if the worker ever misbehaves: the build then
// writes a sw.js that removes itself and its caches from every browser that has it, and the page
// stops registering one. Keep it false for a good while before deleting any of this: a browser only
// gets the off switch when it next opens the site.
const OFFLINE = true

// base './' makes the build work from any sub-folder (e.g. GitHub Pages /repo-name/).
export default defineConfig(({ mode }) => {
  // Paths to the owner's own character files for tests/ownerFiles.ts: OWNER_* from .env.test.local
  // (git-ignored, `*.local`) or the environment. Not in the repo; without them those tests are skipped.
  const ownerEnv = mode === 'test' ? loadEnv(mode, process.cwd(), 'OWNER_') : {}
  if (mode === 'test' && !ownerEnv.OWNER_GRAV_FILE && process.env.OWNER_FILES !== 'skip')
    console.log("Owner files: OWNER_GRAV_FILE is not set, so the tests on the owner's character are skipped (see tests/ownerFiles.ts).")
  return {
    base: './',
    plugins: [react(), offlinePlugin(OFFLINE)],
    define: { __OFFLINE__: JSON.stringify(OFFLINE) },
    test: { env: ownerEnv },
  }
})
