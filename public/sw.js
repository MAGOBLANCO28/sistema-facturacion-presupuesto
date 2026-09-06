const CACHE_NAME = 'faktio-v2';

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
  // HTML navigation: always fetch fresh from network
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
    return;
  }
  // Static assets (JS/CSS with hash): cache-first
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request).then(fresh => {
        const clone = fresh.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return fresh;
      })
    )
  );
});
