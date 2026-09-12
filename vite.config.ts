import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // The library and its audio live in IndexedDB, so once the shell is cached
      // the whole app works offline; nothing here talks to a server.
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Music Universe',
        short_name: 'Music Universe',
        description: '现代音乐播放器、双 Deck DJ 台与实时音乐可视化。',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f7f9f5',
        theme_color: '#151d19',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Large artwork and the visual bundle are still worth precaching up front.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      // Kept off so the dev server and the e2e suite never see a service worker.
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    // Source maps were 5.7 MB of a 7.3 MB deploy and published the full source.
    // Turn them on locally when debugging with `MU_SOURCEMAPS=1 npm run build`.
    sourcemap: process.env.MU_SOURCEMAPS === '1',
    rollupOptions: {
      output: {
        // Separate the heavy 3D stack from the page that uses it, so editing a
        // visual does not invalidate the engine chunk in the PWA precache.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
}));
