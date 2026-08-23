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
// v2: v1 could contain unverified opaque responses, including cached error
// pages that render as permanently broken drawings. Renaming discards them once.
const MEDIA_CACHE = "heroal-media-v2";
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

const PRECACHE_CONCURRENCY = 4;
const MAX_DOWNLOAD_ATTEMPTS = 3;

/** Requests for article drawings and other pictures. */
function isImageRequest(request) {
  return (
    request.destination === "image" ||
    /\.(png|jpg|jpeg|svg|webp|gif|ico)$/i.test(new URL(request.url).pathname) ||
    /(googleusercontent\.com|drive\.google\.com)/.test(request.url)
  );
}

/**
 * Google Drive thumbnail links redirect to lh3.googleusercontent.com, and only
 * that final host sends CORS headers. Requesting it directly makes the response
 * readable, which is what allows us to tell a real drawing from an error page
 * (a cached HTTP 429 would look like a permanently broken drawing on a terminal
 * that is already underground). It also avoids the multi-megabyte storage
 * padding the browser applies to unreadable opaque responses.
 */
function corsCandidate(url) {
  const match = /^https?:\/\/drive\.google\.com\/thumbnail\?(.*)$/i.exec(url);
  if (!match) return null;

  const params = new URLSearchParams(match[1]);
  const id = params.get("id");
  if (!id) return null;

  return `https://lh3.googleusercontent.com/d/${id}=${params.get("sz") || "w1000"}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  // Searches every cache: app icons are precached in the shell cache while
  // article drawings live in the media cache.
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only verifiable responses are stored. Cross-origin drawings arrive here as
    // unreadable opaque responses, so they are cached exclusively by the
    // validated precache path below rather than gambling on an error page.
    if (response.ok) {
      const cache = await caches.open(MEDIA_CACHE);
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
 * Fetches one drawing and returns it only if it is definitely an image.
 * Rate limiting (429) and server errors are retried, because a single sync
 * requests a couple of hundred drawings from the same host in a burst.
 */
async function downloadDrawing(url) {
  const target = corsCandidate(url) || url;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    let transient = true;
    try {
      const response = await fetch(target, { mode: "cors", cache: "no-store" });
      const type = response.headers.get("Content-Type") || "";
      if (response.ok && type.startsWith("image/")) return response;
      // 4xx other than 429 will not resolve by trying again.
      transient = response.status === 429 || response.status >= 500;
    } catch (err) {
      // Network or CORS failure; worth one more try.
    }

    if (!transient) return null;
    if (attempt < MAX_DOWNLOAD_ATTEMPTS) await sleep(600 * 2 ** (attempt - 1));
  }

  return null;
}

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
        const response = await downloadDrawing(url);
        if (response) {
          // Stored under the original URL so the <img> tags hit the cache.
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
