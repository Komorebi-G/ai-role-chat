const CACHE_NAME = "ai-role-chat-v2";
const OFFLINE_URL = "/chat";

// Assets to precache on install
const PRECACHE_URLS = [OFFLINE_URL, "/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const { pathname } = url;

  // API GET (list/query): network-first, fallback to cache
  if (pathname.startsWith("/api/") && event.request.method === "GET") {
    event.respondWith(networkFirstWithCache(event.request, CACHE_NAME));
    return;
  }

  // API mutations: network-only, no caching
  if (pathname.startsWith("/api/") && event.request.method !== "GET") {
    return; // Let the browser handle — offline mutations fail gracefully
  }

  // Static assets (JS, CSS, fonts, images): cache-first
  if (
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "font" ||
    event.request.destination === "image"
  ) {
    event.respondWith(cacheFirstWithRefresh(event.request, CACHE_NAME));
    return;
  }

  // Navigation / HTML: network-first with offline fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      networkFirstWithFallback(event.request, CACHE_NAME, OFFLINE_URL)
    );
    return;
  }
});

// Network-first, caching successful responses
async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Cache-first, refresh cache in background
async function cacheFirstWithRefresh(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      caches.open(cacheName).then((cache) =>
        cache.put(request, response.clone())
      );
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise;
}

// Network-first for navigation, fallback to cached page
async function networkFirstWithFallback(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Ultimate fallback: cached /chat
    const fallback = await caches.match(fallbackUrl);
    return fallback || new Response("You are offline", { status: 503 });
  }
}
