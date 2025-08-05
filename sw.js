const CACHE_VERSION = 'v0.0.2';
const CACHE_NAME = `project-mammoth-cache-${CACHE_VERSION}`;
const MANIFEST_URL = './precache-manifest.json';

self.addEventListener('install', (event) => {
  console.log('[SW] 安装中, 版本:', CACHE_VERSION);
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] 开始预缓存所有文件...');
      
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error('无法获取预缓存清单文件');
        }
        const filesToCache = await response.json();
        const totalFiles = filesToCache.length;
        console.log(`[SW] 需要缓存的文件总数: ${totalFiles}`);

        let cachedCount = 0;
        for (const url of filesToCache) {
          try {
            await cache.add(url);
            cachedCount++;
            
            const clients = await self.clients.matchAll();
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
            console.error(`[SW] 缓存失败: ${url}`, err);
          }
        }
        console.log('[SW] 所有文件预缓存完成！');

      } catch (error) {
        console.error('[SW] 预缓存过程失败:', error);
        throw error;
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 激活成功, 版本:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
