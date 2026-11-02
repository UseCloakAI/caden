// Caden service worker: the app shell works offline-first; the brain, Cloak,
// realtime and the face models always go to the network.
const CACHE = 'caden-v34';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/caden.css', 'icons/icon.svg', 'icons/icon-192.png',
  'fonts/fonts.css', 'fonts/space-grotesk-latin.woff2', 'fonts/syne-latin.woff2', 'icons/ph/style.css', 'icons/ph/Phosphor.woff2',
  'js/app.js', 'js/camera.js', 'js/hands.js', 'js/airnav.js', 'js/config.js', 'js/store.js', 'js/mesh.js', 'js/lan.js', 'js/locate.js', 'js/qr.js', 'js/sfx.js', 'js/wave.js', 'js/wheel.js', 'js/where.js', 'js/clocks.js', 'js/spoken.js', 'js/motion.js', 'fonts/geist-latin-wght-normal.woff2', 'js/vendor/qrcode.js', 'js/faces.js', 'js/voice.js', 'js/brain.js', 'js/orb.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for our own files (so a deploy shows up right away), cache as fallback.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
