/**
 * heroal LagerGuide — Service Worker
 *
 * Offline-first: the app must stay fully usable without any connectivity.
 *
 * Two separate caches on purpose:
 *  - SHELL_CACHE is versioned and replaced on every deploy.
 *  - MEDIA_CACHE holds article drawings and survives shell updates, because
 *    re-downloading ~200 drawings after every deploy would leave terminals
 *    without drawings until they are online again.
 */
const SHELL_VERSION = "v5";
const SHELL_CACHE = `heroal-shell-${SHELL_VERSION}`;
const MEDIA_CACHE = "heroal-media-v1";
const KEEP_CACHES = [SHELL_CACHE, MEDIA_CACHE];

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/favicon.ico",
  "./icons/favicon-16x16.png",
  "./icons/favicon-32x32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const PRECACHE_CONCURRENCY = 6;

/** Requests for article drawings and other pictures. */
function isImageRequest(request) {
  return (
    request.destination === "image" ||
    /\.(png|jpg|jpeg|svg|webp|gif|ico)$/i.test(new URL(request.url).pathname) ||
    /(googleusercontent\.com|drive\.google\.com)/.test(request.url)
  );
}

/**
 * An opaque response (cross-origin `no-cors`) always reports status 0, so
 * `response.ok` is false even when the download succeeded. Treating opaque
 * responses as cacheable is what makes the Google Drive drawings available
 * offline at all.
 */
function isCacheable(response) {
  return Boolean(response) && (response.ok || response.type === "opaque");
}

function offlineResponse(message) {
  return new Response(message || "Offline", {
    status: 504,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Cache assets individually: with addAll a single missing file would
      // abort the whole install and leave the app without an offline shell.
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            await cache.add(new Request(asset, { cache: "reload" }));
          } catch (err) {
            console.warn("[sw] shell asset failed to cache:", asset, err);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !KEEP_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Cache-first: drawings are immutable, so a hit is served without touching the network. */
async function handleImage(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Never resolve to undefined: that turns into an opaque SW failure instead
    // of a clean error the page can react to via `img.onerror`.
    return offlineResponse("Image unavailable offline");
  }
}

async function handleShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (request.mode === "navigate" || request.destination === "document") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    return offlineResponse();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Spreadsheet exports must always be fresh; they are the sync source.
  if (url.hostname === "docs.google.com") return;

  event.respondWith(
    isImageRequest(request) ? handleImage(request) : handleShell(request),
  );
});

/**
 * Downloads every article drawing so the app is offline-ready before the
 * device loses connectivity. Re-running overwrites existing entries, which is
 * how a drawing corrected in the source data reaches already-synced devices.
 */
async function precacheMedia(urls, port) {
  const cache = await caches.open(MEDIA_CACHE);
  const unique = [...new Set((urls || []).filter(Boolean))];
  const total = unique.length;
  let done = 0;
  let cachedCount = 0;
  let failed = 0;

  const report = () => {
    if (port) port.postMessage({ type: "PRECACHE_PROGRESS", done, total });
  };
  report();

  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const url = unique[cursor++];
      try {
        const response = await fetch(url, {
          mode: "no-cors",
          cache: "no-store",
        });
        if (isCacheable(response)) {
          await cache.put(url, response);
          cachedCount++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
      done++;
      report();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PRECACHE_CONCURRENCY, total || 1) }, worker),
  );

  if (port) {
    port.postMessage({
      type: "PRECACHE_DONE",
      total,
      cached: cachedCount,
      failed,
    });
  }
}

async function mediaStats(port) {
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();
  if (port) port.postMessage({ type: "MEDIA_STATS", count: keys.length });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];

  if (data.type === "PRECACHE_MEDIA") {
    event.waitUntil(precacheMedia(data.urls, port));
  } else if (data.type === "MEDIA_STATS") {
    event.waitUntil(mediaStats(port));
  } else if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
