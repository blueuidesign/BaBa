import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-baba-xanh.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Kho BaBa',
        short_name: 'Kho BaBa',
        description: 'Ghi bán, nấu, kho cho điểm bán Sữa lành từ BaBa',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F3EB',
        theme_color: '#296241',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ]
});
