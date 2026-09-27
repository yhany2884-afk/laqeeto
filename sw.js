/* Service worker — caches the whole app shell so it works offline.
 * Bump CACHE_VERSION whenever you change any file so users get the update. */
const CACHE_VERSION = 'laqeeto-v2.2.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/config.js',
  './js/vendor/supabase.js',
  './js/utils.js',
  './js/ui.js',
  './js/camera.js',
  './js/pwa.js',
  './js/icons.js',
  './js/splash.js',
  './js/views/public.js',
  './js/views/auth.js',
  './js/views/owner.js',
  './js/views/tech.js',
  './js/views/chat.js',
  './js/views/admin.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './fonts/plex-arabic-arabic-400.woff2',
  './fonts/plex-arabic-arabic-500.woff2',
  './fonts/plex-arabic-arabic-700.woff2',
  './fonts/plex-arabic-latin-400.woff2',
  './fonts/plex-arabic-latin-500.woff2',
  './fonts/plex-arabic-latin-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('laqeeto-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate for same-origin GET requests; navigations fall back to the cached app shell.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy)); } return res; })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
