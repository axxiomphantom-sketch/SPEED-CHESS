/**
 * SPEED CHESS service worker.
 *
 * Deliberately conservative: a chess app must never serve a stale board or a stale auth response.
 * Only the app shell is cached, so the installed app opens instantly and survives a flaky
 * connection; every API and WebSocket call goes straight to the network.
 *
 * Cache strategy
 *   - navigation  → network-first, falling back to the cached shell offline
 *   - /assets/*   → cache-first (content-hashed, immutable, so a new build gets a new URL)
 *   - /api, /ws   → never touched; not caching auth or game state is the point
 */

const VERSION = 'v1';
const SHELL = `speed-chess-shell-${VERSION}`;
const ASSETS = `speed-chess-assets-${VERSION}`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      // addAll is atomic: one 404 would reject the whole install, so tolerate individual misses.
      .then(cache => Promise.all(SHELL_URLS.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== ASSETS).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** Anything dynamic must bypass the cache entirely. */
function isDynamic(url) {
  return url.pathname.startsWith('/api') ||
         url.pathname.startsWith('/ws') ||
         url.pathname.startsWith('/uploads') ||
         url.pathname.startsWith('/auth');
}

self.addEventListener('fetch', event => {
  const { request } = event;
  // Only plain GETs are cacheable; POST/PATCH (moves, auth) must never be replayed.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isDynamic(url)) return;

  // Navigations: always try the network so deploys are picked up immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put('/', copy)).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? Response.error())
    );
    return;
  }

  // Hashed build output and static files.
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached ?? fetch(request).then(response => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(ASSETS).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
      )
    );
  }
});
