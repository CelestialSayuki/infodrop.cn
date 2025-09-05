const CACHE_VERSION = '1A1057c';
const CACHE_NAME = `project-mammoth-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `project-mammoth-runtime-${CACHE_VERSION}`;
const APP_SHELL_URL = './index.html';
const MANIFEST_URL = './precache-manifest.json';

let currentProgress = 0;
let totalFiles = 0;
let cachedCount = 0;

function isUpdatePausedByClient() {
  return new Promise(async (resolve) => {
    const timeout = setTimeout(() => resolve(false), 500);

    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window'
    });

    if (!clients || clients.length === 0) {
      clearTimeout(timeout);
      return resolve(false);
    }

    const messageListener = (event) => {
      if (event.data && event.data.type === 'UPDATE_SETTING_RESPONSE') {
        if (event.data.isPaused) {
          self.removeEventListener('message', messageListener);
          clearTimeout(timeout);
          resolve(true);
        }
      }
    };
    
    self.addEventListener('message', messageListener);

    clients.forEach(client => {
      client.postMessage({ type: 'GET_UPDATE_SETTING' });
    });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (await isUpdatePausedByClient()) {
      console.log('[SW] Installation aborted by user setting.');
      throw new Error('Installation aborted by user setting.');
    }

    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch precache manifest.');
    const filesToCache = await response.json();
    totalFiles = filesToCache.length;
    cachedCount = 0;
    currentProgress = 0;
    let lastReportedPercent = -1;
    
    const cachingStartTime = Date.now();

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
        currentProgress = percent;
        
        let estimatedRemainingTime = null;
        if (cachedCount > 0) {
            const elapsedTime = Date.now() - cachingStartTime;
            const filesPerMillisecond = cachedCount / elapsedTime;
            const remainingFiles = totalFiles - cachedCount;
            estimatedRemainingTime = remainingFiles / filesPerMillisecond;
        }

        if (percent > lastReportedPercent) {
          lastReportedPercent = percent;
          const allClients = await self.clients.matchAll({ includeUncontrolled: true });
          for (const client of allClients) {
            client.postMessage({
              type: 'CACHE_PROGRESS',
              payload: {
                total: totalFiles,
                current: cachedCount,
                percent: percent,
                currentFile: url,
                estimatedRemainingTime: estimatedRemainingTime
              }
            });
          }
        }
      } catch (err) {
        console.error(`[SW] Caching failed for: ${url}`, err);
      }
    }

    const finalClients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of finalClients) {
      client.postMessage({
        type: 'CACHE_COMPLETE',
        payload: {
          version: CACHE_VERSION
        }
      });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_PROGRESS') {
    event.source.postMessage({
      type: 'CURRENT_PROGRESS',
      payload: {
        total: totalFiles,
        current: cachedCount,
        percent: currentProgress
      }
    });
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
