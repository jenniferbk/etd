import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so ONE build works at any mount path — the root of the
  // campus ETD server (ETD_STATIC_DIR) and jenkleiman.com/tools/etd/ alike.
  // Safe because the app has no client-side route paths (query params only),
  // so index.html is only ever served for extensionless top-level URLs.
  base: './',
  plugins: [react(), tailwindcss()],
})
