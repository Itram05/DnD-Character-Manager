import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' makes the build work from any sub-folder (e.g. GitHub Pages /repo-name/).
export default defineConfig({
  base: './',
  plugins: [react()],
})
