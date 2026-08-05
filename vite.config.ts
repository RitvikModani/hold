import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  // GitHub Pages serves this repo at /hold/, not at the domain root, so every
  // asset URL needs that prefix. Set only by the deploy workflow — local dev
  // and any root-domain host (Vercel, Netlify) keep '/' and need no change.
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Hold — attention trainer',
        short_name: 'Hold',
        description: 'How long can you hold it? Attention training, one rung at a time.',
        theme_color: '#0a0a0b',
        background_color: '#0a0a0b',
        display: 'standalone',
        orientation: 'portrait',
        // No explicit start_url — the plugin derives it from `base`, so it
        // stays correct whether the app is served from a domain root or from
        // a /hold/ subpath on GitHub Pages.
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The content pool is the app's only network dependency. Cache it so a
        // session survives losing connection part-way through.
        runtimeCaching: [
          {
            urlPattern: /\/content\/pool\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'hold-pool' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    fs: {
      // Tolerates the launcher reaching the project by its 8.3 short path,
      // which Vite otherwise treats as a different directory to the long one
      // and refuses to serve. Dev server only — no bearing on the build.
      strict: false,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
