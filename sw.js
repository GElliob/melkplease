// Mode hors ligne : l'app s'ouvre même sans réseau (la nuit, en avion, partout).
// Pour publier une mise à jour, incrémente VERSION.

// Préfixe propre à l'app principale : ne touche jamais aux caches de la bêta (melkplease-beta-*).
const CACHE_PREFIX = 'melkplease-v';
const VERSION = `${CACHE_PREFIX}3`;
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/chrono.js', 'js/feed-form.js', 'js/feeds.js', 'js/files.js', 'js/format.js',
  'js/import-notes.js', 'js/score.js', 'js/stats.js',
  'js/growth.js', 'js/growth-data.js', 'js/suivi-actions.js', 'js/tracking-defs.js', 'js/tracking-form.js', 'js/tracking-model.js', 'js/view-suivi.js', 'js/today.js', 'js/view-today.js', 'js/store.js', 'js/ui.js',
  'js/view-home.js', 'js/view-journal.js', 'js/view-settings.js', 'js/view-stats.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const NETWORK_TIMEOUT_MS = 2500;

function fetchWithTimeout(request) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('réseau trop lent')), NETWORK_TIMEOUT_MS)),
  ]);
}

// Réseau d'abord (mises à jour immédiates), cache si hors ligne ou réseau lent.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetchWithTimeout(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('index.html'))),
  );
});
