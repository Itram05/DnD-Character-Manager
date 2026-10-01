/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// base './' makes the build work from any sub-folder (e.g. GitHub Pages /repo-name/).
export default defineConfig(({ mode }) => {
  // Paths to the owner's own character files for tests/ownerFiles.ts: OWNER_* from .env.test.local
  // (git-ignored, `*.local`) or the environment. Not in the repo; without them those tests are skipped.
  const ownerEnv = mode === 'test' ? loadEnv(mode, process.cwd(), 'OWNER_') : {}
  if (mode === 'test' && !ownerEnv.OWNER_GRAV_FILE && process.env.OWNER_FILES !== 'skip')
    console.log("Owner files: OWNER_GRAV_FILE is not set, so the tests on the owner's character are skipped (see tests/ownerFiles.ts).")
  return {
    base: './',
    plugins: [react()],
    test: { env: ownerEnv },
  }
})
