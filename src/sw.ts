import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// Cleanup old caches and precache assets
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// immediately activate new service worker
self.skipWaiting();
clientsClaim();

// Faster static assets after first load
registerRoute(
    ({ request }) => request.destination === 'script' || request.destination === 'style' || request.destination === 'worker',
    new StaleWhileRevalidate({
        cacheName: 'lunaris-static-resources',
    }),
);

registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
        cacheName: 'lunaris-images',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
            }),
        ],
    }),
);

registerRoute(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({
        cacheName: 'lunaris-pages',
        networkTimeoutSeconds: 3,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 30,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
            }),
        ],
    }),
);

// Handle push notifications
self.addEventListener('push', (event: PushEvent) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Lunaris';
    const options = {
        body: data.body || '',
        icon: '/pwa_logo.png',
        badge: '/pwa_logo.png',
        data: data.url ? { url: data.url } : {},
        vibrate: [200, 100, 200],
        requireInteraction: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

interface NotificationData {
    url?: string;
}

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Check if there is already a window/tab open with the target URL
            for (const client of clientList) {
                const notificationData = event.notification.data as NotificationData;
                if (notificationData.url && client.url.includes(notificationData.url) && 'focus' in client && typeof client.focus === 'function') {
                    return (client as WindowClient).focus();
                }
            }
            // If not, open a new window/tab with the target URL
            if (self.clients.openWindow) {
                const notificationData = event.notification.data as NotificationData;
                if (notificationData.url) {
                    return self.clients.openWindow(notificationData.url);
                }
            }
        })
    );
});
