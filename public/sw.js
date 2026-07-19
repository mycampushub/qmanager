// =============================================================================
// QueueFlow — Service Worker (auth-gated PWA)
// Registered ONLY for logged-in users via usePwa hook.
// Handles: offline caching, push notifications, background sync.
// =============================================================================

const CACHE_NAME = 'queueflow-v1';
const STATIC_ASSETS = [
  '/dashboard',
  '/icons/icon-512.png',
];

// ─── Install: pre-cache shell + assets ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail — some assets may not be available during install
      });
    })
  );
  // Activate immediately
  (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

// ─── Activate: clean old caches ─────────────────────────────────────────────
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
  // Take control of all clients immediately
  (self as unknown as ServiceWorkerGlobalScope).clients.claim();
});

// ─── Fetch: Network-first for API, Cache-first for static ───────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API routes: Network First (always try fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Next.js static assets (_next/): Cache First (instant loads)
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Icons / images: Cache First
  if (url.pathname.startsWith('/icons/') || url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML pages (dashboard, etc.): Network First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/dashboard'));
    return;
  }

  // Everything else: Network First
  event.respondWith(networkFirst(request));
});

// ─── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; icon?: string; badge?: string; url?: string } = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'QueueFlow';
  const options: NotificationOptions = {
    body: data.body || 'New update available',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-72.png',
    tag: 'queueflow-notification',
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/dashboard',
    },
  };

  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).registration.showNotification(title, options)
  );
});

// ─── Notification Click: focus or open window ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          return (client as WindowClient).focus();
        }
      }
      // Open new window
      return (self as unknown as ServiceWorkerGlobalScope).clients.openWindow(targetUrl);
    })
  );
});

// ─── Message handler (from usePwa hook) ─────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
  }
});

// ─── Strategies ─────────────────────────────────────────────────────────────

async function networkFirst(request: Request, fallbackUrl?: string): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache successful responses
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Navigate fallback
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }

    // Offline page for navigation requests
    if (request.mode === 'navigate') {
      return new Response(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#666}div{text-align:center}h2{margin:0 0 8px}p{margin:0;color:#999}</style></head><body><div><h2>You\'re Offline</h2><p>QueueFlow will resume when your connection is back.</p></div></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Type declarations for ServiceWorker globals
declare class WindowClient extends Client {
  focus(): Promise<WindowClient>;
}

interface ServiceWorkerGlobalScope extends EventTarget {
  skipWaiting(): Promise<void>;
  clients: Clients;
  registration: ServiceWorkerRegistration;
}

declare var self: ServiceWorkerGlobalScope;