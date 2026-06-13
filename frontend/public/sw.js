importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);
}

const CACHE_NAME = 'civicshield-v1';
const OFFLINE_URL = '/offline.html';

// ── Install: pre-cache offline fallback ──────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL]);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network-first with offline fallback ────────
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL)
      )
    );
    return;
  }

  // Cache OSM map tiles with CacheFirst strategy
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
});

// ── Push Notifications ────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'CivicShield AI', body: event.data.text(), severity: 'Medium' };
  }

  const title = data.title || 'CivicShield AI Alert';

  // Icon based on severity
  const iconMap = {
    Critical: '/icon-512.png',
    High:     '/icon-512.png',
    Medium:   '/icon-192.png',
    Low:      '/icon-192.png',
  };

  const options = {
    body: data.body || 'A new disaster event has been detected.',
    icon: iconMap[data.severity] || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: `civicshield-${Date.now()}`,
    renotify: true,
    requireInteraction: data.severity === 'Critical',
    data: { url: '/portal', severity: data.severity },
    actions: [
      { action: 'view', title: '🗺️ View on Map' },
      { action: 'dismiss', title: '✕ Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click Handler ────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/portal';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ── Background Sync (for offline incident reports) ────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-incidents') {
    event.waitUntil(syncPendingIncidents());
  }
});

function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-incidents', 'readonly');
    const store = tx.objectStore('pending-incidents');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deletePending(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-incidents', 'readwrite');
    const store = tx.objectStore('pending-incidents');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function syncPendingIncidents() {
  try {
    const db = await openDB();
    const pending = await getAllPending(db);
    
    for (const incident of pending) {
      try {
        const response = await fetch('/api/incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(incident.data),
        });
        
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          await deletePending(db, incident.id);
        } else {
          console.warn('[SW] Server error syncing incident, will retry later:', response.status);
        }
      } catch (err) {
        console.error('[SW] Network error syncing incident:', err);
      }
    }
  } catch (e) {
    console.error('[SW] Background sync failed:', e);
  }
}

// Simple IndexedDB helper
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('civicshield-offline', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('pending-incidents', { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
