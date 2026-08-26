/* バージョンを上げるときは version.json / app.js も揃える */
const APP_VERSION = "1.0.6";
const CACHE_NAME = `rikkuku-${APP_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./sw-register.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll は1件失敗で全体失敗→更新が永遠に入らないため個別に入れる
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)),
      );
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("rikkuku-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // バージョン確認は常にネットから（キャッシュしない）
  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("version.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  const isNavigate = request.mode === "navigate";
  const path = url.pathname;
  const isShell =
    isNavigate ||
    path.endsWith(".html") ||
    path.endsWith("manifest.webmanifest") ||
    path.endsWith("sw-register.js") ||
    path.endsWith("app.js") ||
    path.endsWith("styles.css") ||
    path.endsWith("/") ||
    /\/$/.test(path);

  if (isShell) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // HTTPキャッシュも使わず最新を取りにいく
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    throw new Error("offline");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached =
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true }));
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    cache.put(request, fresh.clone());
  }
  return fresh;
}
