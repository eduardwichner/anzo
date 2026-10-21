import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base '/' produces host-relative URLs (/assets/...), so one build serves both
// https://anzo.your-domain.example and http://192.0.2.10:3000, including deep links like /lesson/<id>.
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script', // external registerSW.js: no inline script, so the strict CSP holds
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Anzo',
        short_name: 'Anzo',
        description: 'Engels en Frans leren',
        lang: 'nl',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1f7ae0',
        background_color: '#f4f6fb',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['icon-source.svg'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/audio\//],
        cleanupOutdatedCaches: true,
        // A new build takes over at once (injectRegister 'script' does not set these by itself): otherwise an installed
        // app keeps running the old client against the new server until every window of it is closed.
        skipWaiting: true,
        clientsClaim: true,
        // Only the lesson content works offline. Per-account answers (me, progress, messages, admin pages) are never
        // cached: the device may be shared, and a stale answer would show wrong state.
        runtimeCaching: [
          {
            // packs and paths only: they are the same for every learner of a course; the course list is per account
            urlPattern: ({ url }) => url.pathname.startsWith('/api/content/packs/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'anzo-api',
              networkTimeoutSeconds: 5,
              // Only a good answer is kept: an error (a proxy's 502/503/429, the app's 500) is never cached, so a
              // refresh after a failure always asks the server again.
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  // `npm run dev` starts the API on :3001 (the systemd service keeps :3000) and sets ANZO_DEV_API.
  server: {
    proxy: {
      '/api': process.env.ANZO_DEV_API || 'http://127.0.0.1:3001',
      '/audio': process.env.ANZO_DEV_API || 'http://127.0.0.1:3001',
    },
  },
  build: {
    // npm run build → dist (what the service serves); the e2e runner builds into dist-e2e (ANZO_CLIENT_OUT)
    outDir: process.env.ANZO_CLIENT_OUT || 'dist',
    emptyOutDir: true,
  },
});
