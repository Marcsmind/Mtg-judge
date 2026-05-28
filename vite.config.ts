import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/.netlify/functions': {
        target: 'https://mtg-judge.netlify.app',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Vitest runs pure-logic unit tests in a Node environment.
    // React component tests are not included yet (DOM env needed for those).
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',

      // Static assets to precache (app shell)
      includeAssets: ['favicon.svg', 'pwa-icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],

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
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },

      workbox: {
        // Precache all compiled JS / CSS / HTML / fonts / icons
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],

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
