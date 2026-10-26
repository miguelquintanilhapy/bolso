import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// endereço público do site, usado nas etiquetas de pré-visualização (precisa ser absoluto)
const siteUrl = (
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://bolso-delta.vercel.app')
).replace(/\/$/, '');
const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const sb = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  // abre a conexão com o Supabase (DNS + TLS) em paralelo ao carregamento do site
  const preconnect = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(sb)
    ? `<link rel="preconnect" href="${sb}" crossorigin />\n    <link rel="dns-prefetch" href="${sb}" />`
    : '';
  return {
  define: { __BUILD_ID__: JSON.stringify(build) },
  plugins: [
    react(),
    { name: 'site-url', transformIndexHtml: (html: string) => html.replaceAll('__SITE_URL__', siteUrl).replace('__PRECONNECT__', preconnect) },
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
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], globIgnores: ['og-image.png'] },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
};
});
