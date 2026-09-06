const CACHE_NAME = 'faktio-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls — always go to the network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML navigation: always fetch fresh from network
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets with content hash (e.g. /assets/index-abc123.js): cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(fresh => {
          const clone = fresh.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return fresh;
        })
      )
    );
    return;
  }

  // Everything else: network-first (logos, manifest, etc.)
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
