import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  optimizeDeps: { include: ['pdfjs-dist'] },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/test-results/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
})
