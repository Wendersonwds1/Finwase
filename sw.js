// ════════════════════════════════════════════════
//  FinWise Service Worker v1.0
//  Cache-first para assets estáticos + fallback offline
// ════════════════════════════════════════════════

const CACHE_NAME = 'finwise-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap'
];

// ── INSTALL: pré-cacheia os assets estáticos ──────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Instalando e cacheando assets...');
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[SW] Alguns assets não foram cacheados:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpa caches antigos ───────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-first com fallback de rede ───────
self.addEventListener('fetch', event => {
  // Ignora requisições não-GET
  if (event.request.method !== 'GET') return;

  // Ignora chrome-extension e outros schemes
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Cache hit — retorna imediatamente e atualiza em background
        const fetchUpdate = fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {});
        return cached;
      }

      // Cache miss — busca na rede
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200) return response;

          // Só cacheia mesma origem e Google Fonts
          const url = event.request.url;
          const shouldCache =
            url.startsWith(self.location.origin) ||
            url.startsWith('https://fonts.googleapis.com') ||
            url.startsWith('https://fonts.gstatic.com');

          if (shouldCache) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }

          return response;
        })
        .catch(() => {
          // Offline fallback
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ── BACKGROUND SYNC (futuro): sincroniza dados offline ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-finwise') {
    console.log('[SW] Background sync acionado.');
  }
});

// ── PUSH NOTIFICATIONS ───────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {
    title: 'FinWise',
    body: 'Você tem contas a vencer hoje! 📅'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'FinWise', {
      body: data.body || 'Verifique suas finanças.',
      icon: './icons/icon-192x192.png',
      badge: './icons/icon-96x96.png',
      tag: 'finwise-notif',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) {
        return list[0].focus();
      }
      return clients.openWindow('./');
    })
  );
});

console.log('[SW] FinWise Service Worker carregado.');
