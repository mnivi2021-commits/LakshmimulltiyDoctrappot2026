// Minimal service worker so phones can install the page as an app.
// It does not cache patient data: the page and its files are fetched fresh,
// with a saved copy of the page only as an offline fallback.
const CACHE = 'lmh-shell-v1';
const SHELL = ['/', '/images/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only same-site page loads; never touch the chat requests to the Worker.
  if (req.method !== 'GET' || req.mode !== 'navigate' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).catch(() => caches.match('/')));
});
