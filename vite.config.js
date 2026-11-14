import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { preciseTerrainPlugin } from './scripts/precise-server.mjs'

// Relative base so the build works on GitHub Pages under /<repo>/ as well as locally.
// preciseTerrainPlugin adds the one-click precise terrain API when the app runs on your own computer.
export default defineConfig({
  plugins: [react(), preciseTerrainPlugin()],
  base: './',
})
