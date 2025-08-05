const CACHE_VERSION = 'v0.0.3';
const CACHE_NAME = `project-mammoth-cache-${CACHE_VERSION}`;
const APP_SHELL_URL = './index.html';
const MANIFEST_URL = './precache-manifest.json';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Failed to fetch precache manifest.');
        
        const filesToCache = await response.json();
        const totalFiles = filesToCache.length;
        let cachedCount = 0;

        for (const url of filesToCache) {
          try {
            await cache.add(url);
            cachedCount++;
            
            const clients = await self.clients.matchAll({ includeUncontrolled: true });
            for (const client of clients) {
              client.postMessage({
                type: 'CACHE_PROGRESS',
                payload: {
                  total: totalFiles,
                  current: cachedCount,
                  percent: Math.round((cachedCount / totalFiles) * 100),
                  currentFile: url
                }
              });
            }
          } catch (err) {
            console.error(`[SW] Failed to cache: ${url}`, err);
          }
        }
        
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({
            type: 'CACHE_COMPLETE',
            payload: {
              version: CACHE_VERSION
            }
          });
        }
      } catch (error) {
        console.error('[SW] Pre-caching process failed:', error);
        throw error;
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const url = new URL(event.request.url);
    if (url.pathname.endsWith('/')) {
      try {
        const indexResponse = await caches.match(url.pathname + 'index.html');
        if (indexResponse) {
          return indexResponse;
        }
      } catch (e) {
        // Continue
      }
    }
    
    try {
      const networkResponse = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, networkResponse.clone());
      return networkResponse;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        return await caches.match(APP_SHELL_URL);
      }
      return new Response("Network error", {
        status: 408,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  })());
});
