import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isTest = process.env.NODE_ENV === 'test';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    !isTest &&
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: {
          enabled: true,
          type: 'module',
        },
        includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png', 'offline.html'],
        manifest: {
          name: 'CivicShield AI',
          short_name: 'CivicShield',
          description: 'Intelligent Disaster Management & Early Warning Platform for India',
          theme_color: '#0f172a',
          background_color: '#0a0f1e',
          display: 'standalone',
          orientation: 'any',
          start_url: '/portal',
          scope: '/',
          lang: 'en',
          categories: ['utilities', 'weather', 'productivity'],
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
          shortcuts: [
            {
              name: 'Live Map',
              short_name: 'Map',
              description: 'View the live disaster map',
              url: '/portal',
              icons: [{ src: '/icon-192.png', sizes: '192x192' }],
            },
            {
              name: 'Coordinator Dashboard',
              short_name: 'Dashboard',
              description: 'Open the coordinator dashboard',
              url: '/dashboard',
              icons: [{ src: '/icon-192.png', sizes: '192x192' }],
            },
            {
              name: 'Field Responder',
              short_name: 'Responder',
              description: 'Field agent mobile view',
              url: '/responder',
              icons: [{ src: '/icon-192.png', sizes: '192x192' }],
            },
          ],
        },
      }),
  ].filter(Boolean),
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.git'
    ]
  },
});
