import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      // Static assets to precache (app shell)
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],

      manifest: {
        name: 'Nexus Judge',
        short_name: 'Nexus Judge',
        description: 'AI-powered Commander MTG Rules Judge & Companion',
        theme_color: '#0a0810',
        background_color: '#0a0810',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Precache all compiled JS / CSS / HTML / fonts / icons
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],

        runtimeCaching: [
          {
            // Scryfall card data — NetworkFirst so live updates come through,
            // but cached for offline / slow connections (7-day TTL)
            urlPattern: /^https:\/\/api\.scryfall\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'scryfall-api',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Scryfall card images — CacheFirst, they never change for a given
            // printing (30-day TTL, 150 images)
            urlPattern: /^https:\/\/cards\.scryfall\.io\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-images',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Gemini AI — always live, never cache (responses are dynamic)
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts — CacheFirst, nearly immutable (1-year TTL)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
