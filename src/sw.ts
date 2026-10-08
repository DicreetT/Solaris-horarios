/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Workbox needs this injection point to build the worker. The worker removes
// itself immediately after activation, so stale PWA copies stop controlling Lunaris.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(
        (async () => {
            if ('caches' in self) {
                const keys = await caches.keys();
                await Promise.all(keys.map((key) => caches.delete(key)));
            }

            const windows = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });

            await self.registration.unregister();
            await Promise.all(
                windows.map((client: Client) => {
                    if ('navigate' in client && typeof client.navigate === 'function') {
                        return (client as WindowClient).navigate(client.url);
                    }
                    return Promise.resolve();
                }),
            );
        })(),
    );
});
