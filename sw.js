/* Lune — service worker.
 * - Précache explicite et complet de l'app : si un seul fichier manque, l'installation échoue
 *   et la version précédente (avec son cache) reste en place. Jamais de précache partiel.
 * - App : cache d'abord, réseau en secours (et mise en cache).
 * - Polices servies localement (fonts/), précachées comme le reste : aucune requête externe.
 * - Mise à jour contrôlée : la nouvelle version attend le message 'SKIP_WAITING'
 *   (envoyé par l'app quand l'utilisatrice accepte la mise à jour, jamais pendant une saisie).
 * VERSION et APP_FILES sont générés par `node tools/stamp-sw.mjs` (empreinte des fichiers) :
 * le relancer après toute modification ; tools/smoke.mjs échoue si VERSION est périmée.
 */

const VERSION = '59b78a8908';
const APP_CACHE = `lune-app-${VERSION}`;

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './fonts/atkinson-hyperlegible-mono-normal-latin-ext.woff2',
  './fonts/atkinson-hyperlegible-mono-normal-latin.woff2',
  './fonts/atkinson-hyperlegible-next-italic-latin-ext.woff2',
  './fonts/atkinson-hyperlegible-next-italic-latin.woff2',
  './fonts/atkinson-hyperlegible-next-normal-latin-ext.woff2',
  './fonts/atkinson-hyperlegible-next-normal-latin.woff2',
  './fonts/young-serif-normal-latin-ext.woff2',
  './fonts/young-serif-normal-latin.woff2',
  './css/app.css',
  './css/fonts.css',
  './css/views/calendar.css',
  './css/views/cycles.css',
  './css/views/learn.css',
  './css/views/log.css',
  './css/views/onboarding.css',
  './css/views/settings.css',
  './css/views/today.css',
  './css/views/urgence.css',
  './js/content/articles.js',
  './js/content/tips.js',
  './js/demo-data.js',
  './js/engine/alerts.js',
  './js/engine/cycles.js',
  './js/engine/dates.js',
  './js/engine/fertility.js',
  './js/engine/index.js',
  './js/engine/mucus.js',
  './js/engine/predict.js',
  './js/engine/regularity.js',
  './js/engine/temperature.js',
  './js/main.js',
  './js/store.js',
  './js/ui/dom.js',
  './js/ui/sheet.js',
  './js/ui/views/calendar.js',
  './js/ui/views/cycles.js',
  './js/ui/views/learn.js',
  './js/ui/views/log.js',
  './js/ui/views/onboarding.js',
  './js/ui/views/settings.js',
  './js/ui/views/today.js',
  './js/ui/views/urgence.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const existed = await caches.has(APP_CACHE);
    const cache = await caches.open(APP_CACHE);
    try {
      // addAll est atomique : un seul échec rejette tout, et l'installation échoue.
      await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
    } catch (err) {
      if (!existed) await caches.delete(APP_CACHE);
      throw err;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('lune-') && key !== APP_CACHE) // purge aussi l'ancien cache lune-fonts-v1
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) self.skipWaiting();
});

/** Cache d'abord ; sinon réseau (mis en cache) ; navigation hors ligne → index.html. */
async function appFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(appFirst(request));
  }
});
