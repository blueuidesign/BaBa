/// <reference lib="webworker" />
// Service worker tự viết (vite-plugin-pwa chế độ injectManifest):
// 1) cache file app để mở được khi mất mạng; 2) nhận thông báo đẩy và mở đúng màn khi bấm.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

type PushData = { title?: string; body?: string; link?: string; tag?: string };

self.addEventListener('push', (event) => {
  let data: PushData = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'Kho BaBa', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kho BaBa', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { link: data.link || '/thong-bao' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link: string = event.notification.data?.link || '/thong-bao';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).focus();
          await (c as WindowClient).navigate(link).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(link);
    })()
  );
});
