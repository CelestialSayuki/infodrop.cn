const CACHE_VERSION = 'temp-rev3';
const CACHE_NAME = `project-mammoth-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `project-mammoth-runtime-${CACHE_VERSION}`;
const MANIFEST_URL = './precache-manifest.json';

let totalFiles = 0;
let cachedCount = 0;
let currentProgress = 0;

function isUpdatePausedByClient() {
  return new Promise(async (resolve) => {
    const timeout = setTimeout(() => resolve(false), 500);
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
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
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'INSTALLATION_STARTED' });
    }
    if (await isUpdatePausedByClient()) {
      throw new Error('Installation aborted by user setting.');
    }
    const versionResponse = await fetch('./public-static/version.json', { cache: 'no-store' });
    if (!versionResponse.ok) throw new Error('Failed to fetch version.json.');
    const versionConfig = await versionResponse.json();
    if (versionConfig.version !== CACHE_VERSION) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'VERSION_MISMATCH' });
      }
      throw new Error(`Version mismatch. SW: ${CACHE_VERSION}, JSON: ${versionConfig.version}. Aborting.`);
    }
    if (versionConfig.rsr_patches && Array.isArray(versionConfig.rsr_patches)) {
      for (const patchBranch of versionConfig.rsr_patches) {
        const baseCacheName = `project-mammoth-cache-${patchBranch.base}`;
        if (await caches.has(baseCacheName)) {
          const baseCache = await caches.open(baseCacheName);
          const newCache = await caches.open(CACHE_NAME);

          const baseRequests = await baseCache.keys();
          await Promise.all(baseRequests.map(async (request) => {
            const response = await baseCache.match(request);
            if (response) {
              await newCache.put(request, response);
            }
          }));
          
          const deltaFiles = patchBranch.delta;
          totalFiles = deltaFiles.length;
          cachedCount = 0;
          currentProgress = 0;
          const cachingStartTime = Date.now();
          
          const patchPromises = deltaFiles.map(async (url) => {
            try {
              const request = new Request(url, { cache: 'no-store' });
              const networkResponse = await fetch(request);
              if (!networkResponse.ok) throw new Error(`RSR: Network response was not ok for: ${url}`);
              await newCache.put(request, networkResponse.clone());
              
              cachedCount++;
              currentProgress = Math.round((cachedCount / totalFiles) * 100);

              let estimatedRemainingTime = null;
              if (cachedCount > 0) {
                  const elapsedTime = Date.now() - cachingStartTime;
                  const filesPerMillisecond = cachedCount / elapsedTime;
                  const remainingFiles = totalFiles - cachedCount;
                  estimatedRemainingTime = remainingFiles / filesPerMillisecond;
              }

              const allClients = await self.clients.matchAll({ includeUncontrolled: true });
              for (const client of allClients) {
                client.postMessage({ type: 'CACHE_PROGRESS', payload: { total: totalFiles, current: cachedCount, percent: currentProgress, currentFile: url, estimatedRemainingTime: estimatedRemainingTime } });
              }
            } catch (err) {
            }
          });

          await Promise.all(patchPromises);

          const finalClients = await self.clients.matchAll({ includeUncontrolled: true });
          for (const client of finalClients) {
            client.postMessage({ type: 'CACHE_COMPLETE', payload: { version: versionConfig.version } });
          }
          return;
        }
      }
    }
    
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch precache manifest.');
    
    const filesToCache = await response.json();
    totalFiles = filesToCache.length;
    cachedCount = 0;
    currentProgress = 0;
    
    const cachingStartTime = Date.now();

    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 100;

    async function postProgressUpdate(force = false) {
      const now = Date.now();
      if (!force && now - lastUpdateTime < UPDATE_INTERVAL) {
        return;
      }
      lastUpdateTime = now;

      currentProgress = Math.round((cachedCount / totalFiles) * 100);
      let estimatedRemainingTime = null;
      if (cachedCount > 0) {
          const elapsedTime = Date.now() - cachingStartTime;
          const filesPerMillisecond = cachedCount / elapsedTime;
          const remainingFiles = totalFiles - cachedCount;
          estimatedRemainingTime = (filesPerMillisecond > 0) ? (remainingFiles / filesPerMillisecond) : null;
      }

      const allClients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({ type: 'CACHE_PROGRESS', payload: { total: totalFiles, current: cachedCount, percent: currentProgress, currentFile: null, estimatedRemainingTime: estimatedRemainingTime } });
      }
    }

    const cachePromises = filesToCache.map(async (url) => {
      try {
        const request = new Request(url, { cache: 'no-store' });
        const networkResponse = await fetch(request);
        if (!networkResponse.ok) {
          throw new Error(`Full install: Network response was not ok for: ${url}`);
        }
        await cache.put(request, networkResponse);
        
        cachedCount++;
        await postProgressUpdate();

      } catch (err) {
      }
    });

    await Promise.all(cachePromises);
    await postProgressUpdate(true);

    const finalClients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of finalClients) {
      client.postMessage({ type: 'CACHE_COMPLETE', payload: { version: CACHE_VERSION } });
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
  } else if (event.data && event.data.type === 'VALIDATE_VERSION') {
    const expectedVersion = event.data.payload.expectedVersion;
    if (CACHE_VERSION !== expectedVersion) {
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        for (const client of clients) {
          client.postMessage({ type: 'ACTIVE_WORKER_VERSION_MISMATCH' });
        }
      });
    }
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
  
  if (url.pathname.endsWith('.php') && !url.pathname.includes('/upload/dvfs/get-dvfs-data.php')) {
      event.respondWith(fetch(event.request, { cache: 'no-store' }));
      return;
  }

    const isPhpApi = url.pathname.includes('/upload/dvfs/get-dvfs-data.php');
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
