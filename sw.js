const CACHE_VERSION = 'v0.0.6';
const CACHE_NAME = `project-mammoth-cache-${CACHE_VERSION}`;
const APP_SHELL_URL = './index.html';
const MANIFEST_URL = './precache-manifest.json';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch precache manifest.');
        
        const filesToCache = await response.json();
        const totalFiles = filesToCache.length;
        let cachedCount = 0;
        let lastReportedPercent = -1;

        for (const url of filesToCache) {
          try {
            const request = new Request(url, { cache: 'no-store' });

            const networkResponse = await fetch(request);

            if (!networkResponse.ok) {
              throw new Error(`[SW] Network response was not ok for: ${url}`);
            }

            await cache.put(request, networkResponse);

            cachedCount++;
            const percent = Math.round((cachedCount / totalFiles) * 100);
            
            if (percent > lastReportedPercent) {
              lastReportedPercent = percent;
              const clients = await self.clients.matchAll({ includeUncontrolled: true });
              for (const client of clients) {
                client.postMessage({
                  type: 'CACHE_PROGRESS',
                  payload: {
                    total: totalFiles,
                    current: cachedCount,
                    percent: percent,
                    currentFile: url
                  }
                });
              }
            }
          } catch (err) {
              
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

    const hasFileExtension = /[^/]+\.[^/]+$/.test(url.pathname);

    if (!hasFileExtension) {
      const path = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
      const indexUrl = new URL(path + 'index.html', url.origin);

      const indexCachedResponse = await caches.match(indexUrl);
      if (indexCachedResponse) {
        return indexCachedResponse;
      }
    }

    return fetch(event.request);
  })());
});
