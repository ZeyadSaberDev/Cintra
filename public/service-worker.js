const CACHE_NAME = 'cintra-shell-v3';
const SHELL_FILES = [
  '/',
  '/manifest.webmanifest',
  '/cintra-mark.png',
  '/cintra-wordmark.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const shell = await fetch('/');
    if (!shell.ok) throw new Error('Could not fetch Cintra app shell for offline setup.');
    const markup = await shell.clone().text();
    await cache.put('/', shell);
    const appAssets = Array.from(markup.matchAll(/(?:src|href)=\"(\/assets\/[^\"\s]+\.(?:js|css))\"/g), (match) => match[1]);
    await cache.addAll([...SHELL_FILES.slice(1), ...appAssets]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith('bayan-shell-') || key.startsWith('cintra-shell-')) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const fresh = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') void cache.put(request, response.clone());
        return response;
      }).catch((error) => {
        if (cached) return cached;
        throw error;
      });
      return cached || fresh;
    })());
  }
});
