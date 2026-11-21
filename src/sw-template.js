// Сервис-воркер «Москва Магнат»: кэширует игру, чтобы она открывалась без интернета.
// Файл собирается из шаблона при сборке (см. vite.config.ts).
const CACHE = 'moskva-magnat-__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('moskva-magnat-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Страница: сначала из кэша (мгновенно и без сети).
      const cached = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./', { ignoreVary: true });
        if (shell) return shell;
      }
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })(),
  );
});
