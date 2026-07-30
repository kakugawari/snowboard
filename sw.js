/* オフライン用の最小限のキャッシュ。更新時は CACHE の版数を上げる。 */
const CACHE = 'mofu-snowboard-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-maskable.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png',
  './src/util.js',
  './src/shop.js',
  './src/audio.js',
  './src/input.js',
  './src/world.js',
  './src/render.js',
  './src/plushie.js',
  './src/game.js',
  './src/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
