const CACHE_VERSION = 'v0.0.9';
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
            console.error(`[SW] Failed to cache ${err.message}`);
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

  // 新增：策略1 - 针对后端API请求，使用“网络优先，缓存兜底”策略
  if (url.pathname.includes('/console/dvfs/get-dvfs-data.php')) {
    event.respondWith((async () => {
      const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
      try {
        // 优先尝试网络请求
        const networkResponse = await fetch(event.request);

        // 如果请求成功，用新数据更新缓存，并返回新数据
        if (networkResponse.ok) {
          await runtimeCache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // 如果网络请求失败（比如离线），则尝试从缓存中获取
        console.log('[SW] API网络请求失败，尝试从缓存中读取...');
        const cachedResponse = await runtimeCache.match(event.request);
        
        // 如果缓存中有数据，则返回它；如果没有，则请求失败
        return cachedResponse || Promise.reject(new Error("Network error and no cache available."));
      }
    })());
    return;
  }

  // 策略2: 对于图片和字体等资源，使用 "缓存优先" 策略
  if (url.origin === self.location.origin && (event.request.destination === 'image' || event.request.destination === 'font')) {
    event.respondWith((async () => {
      const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
      const cachedResponse = await runtimeCache.match(event.request);

      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          await runtimeCache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        console.error('[SW] Network fetch failed for runtime asset:', error);
        throw error;
      }
    })());
    return;
  }

  // 策略3: 默认，处理预缓存的核心文件和SPA导航
  event.respondWith((async () => {
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }

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
