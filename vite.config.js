import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: installable on iOS/Android (Add to Home Screen). Auto-update so
    // users always get the latest version a few seconds after deploy.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // Don't try to cache navigation requests for /api/* — those are
        // dynamic backend calls and must always reach the server.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      manifest: {
        name: 'World Cup 2026 Bets',
        short_name: 'WC 2026',
        description: 'Private score-prediction game for FIFA World Cup 2026',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#6366f1',
        lang: 'en',
        dir: 'auto',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Forward /api/* to the local Vercel-equivalent Express app
      // (api/_local-dev.js → port 3000). In production Vercel routes
      // /api/* directly to api/[...slug].js — no proxy needed.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
