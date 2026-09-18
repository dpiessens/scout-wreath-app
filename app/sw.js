// Service worker: lets the app open and take orders with no signal.
// App files are served from the cache and refreshed in the background, so a new deploy
// shows up the next time the app is opened. The API, sign-in and admin page always go to the network.
const CACHE = 'scout-orders-v1';
const THUMBS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 20, 21, 22].map(n => `img/w${n}.jpg`);
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/products.js', 'js/report.js',
  'img/venmo-qr.png', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png',
  ...THUMBS,
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.auth/') || url.pathname.startsWith('/admin')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req)
      .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => cached);
    if (cached) { event.waitUntil(fresh); return cached; }
    return fresh;
  })());
});
