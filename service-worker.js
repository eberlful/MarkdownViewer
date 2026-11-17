'use strict';

// Increment this version whenever the cached application files change.
const CACHE_PREFIX = `folio-shell:${encodeURIComponent(self.registration.scope)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v12`;
const ASSETS = [
  './', './index.html', './styles.css', './core.js', './app.js', './features.js',
  './images.js', './pwa.js', './presentation.js', './workspace.js', './tags.js', './tabs.js', './enhancements.js', './theme.js', './assets/graphit-mark.svg', './manifest.webmanifest', './pwa-icons/icon-192.png',
  './pwa-icons/icon-512.png', './pwa-icons/icon-512-maskable.png'
];
const SCOPE = new URL(self.registration.scope);
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, SCOPE).href));
const INDEX_URL = new URL('./index.html', SCOPE).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
  )));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE.origin) return;
  const isAppNavigation = event.request.mode === 'navigate' && (url.pathname === SCOPE.pathname || url.pathname === new URL(INDEX_URL).pathname);
  if (!isAppNavigation && !ASSET_URLS.has(url.href)) return;
  const key = isAppNavigation ? INDEX_URL : url.href;
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(key)).then(response => response || fetch(event.request)));
});
