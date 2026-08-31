/**
 * Offline service worker.
 *
 * The app has no server dependency — generators, mastery, scheduling and the
 * whole hint ladder are local — so it should work on a tablet in a car park
 * with no signal. Only the optional Claude hint call needs the network, and it
 * already falls back to the authored ladder when unavailable.
 *
 * Strategy: precache the shell on install, then network-first for navigations
 * (so a deployed update is picked up promptly) and cache-first for hashed
 * build assets (which are immutable by name, so a cache hit is always correct).
 */

const CACHE = 'genesis-lab-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 during development cannot fail the whole
      // install and leave the app with no worker at all.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache the hint API: a stale hint for a different question would be
  // worse than no hint, and its failure path is already handled.
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        // Only cache real, complete responses — an opaque or error response
        // cached here would persist a broken asset until the next version.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    }),
  );
});
