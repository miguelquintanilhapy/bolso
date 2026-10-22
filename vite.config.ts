import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev';

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(build) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'Bolso',
        short_name: 'Bolso',
        description: 'Controle financeiro pessoal',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f3f5',
        theme_color: '#f2f3f5',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});
