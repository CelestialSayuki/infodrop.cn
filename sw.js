const CACHE_VERSION = 'v0.1.0';
const CACHE_NAME = `project-mammoth-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `project-mammoth-runtime-${CACHE_VERSION}`;
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
          const expectedCaches = [CACHE_NAME, RUNTIME_CACHE_NAME];
          if (!expectedCaches.includes(key)) {
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

  const url = new URL(event.request.url);

    const isPhpApi = url.pathname.includes('/console/dvfs/get-dvfs-data.php');
    const isSupabaseApi = url.href.includes('supabase.co/rest/v1/speedometer_results');

    if (isPhpApi || isSupabaseApi) {
      event.respondWith((async () => {
        const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
        try {
          const networkResponse = await fetch(event.request);

          if (networkResponse.ok) {
            await runtimeCache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cachedResponse = await runtimeCache.match(event.request);
          
          return cachedResponse || Promise.reject(new Error("Network error and no cache available."));
        }
      })());
      return;
  }

  if (url.pathname.endsWith('version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith((async () => {
    const precache = await caches.open(CACHE_NAME);
    const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);

    const precachedResponse = await precache.match(event.request);
    if (precachedResponse) {
      return precachedResponse;
    }

    const runtimeCachedResponse = await runtimeCache.match(event.request);
    if (runtimeCachedResponse) {
      return runtimeCachedResponse;
    }
    
    const hasFileExtension = /[^/]+\.[^/]+$/.test(url.pathname);
    if (!hasFileExtension && url.origin === self.location.origin) {
      const path = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
      const pathIndexUrl = new URL(path + 'index.html', url.origin);
      
      const precachedIndexResponse = await precache.match(pathIndexUrl);
      if (precachedIndexResponse) {
        return precachedIndexResponse;
      }
    }

    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse.ok || networkResponse.type === 'opaque') {
        await runtimeCache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      throw error;
    }
  })());
});
