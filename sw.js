/**
 * heroal Artikel — Service Worker
 *
 * Offline-first: the app must stay fully usable without any connectivity.
 *
 * Two separate caches on purpose:
 *  - SHELL_CACHE is versioned and replaced on every deploy.
 *  - MEDIA_CACHE holds article drawings and survives shell updates, because
 *    re-downloading ~200 drawings after every deploy would leave terminals
 *    without drawings until they are online again.
 */
const SHELL_VERSION = "v277";
const SHELL_CACHE = `heroal-shell-${SHELL_VERSION}`;
// v2: v1 could contain unverified opaque responses, including cached error
// pages that render as permanently broken drawings. Renaming discards them once.
const MEDIA_CACHE = "heroal-media-v2";
const KEEP_CACHES = [SHELL_CACHE, MEDIA_CACHE];

// Icons declared only in the HTML, which the manifest does not list.
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/favicon.ico",
  "./icons/apple-touch-icon.png",
  "./logo/heroal-artikel-logo-hell.png",
  "./images/artikel-empty.png",
  "./images/farben-empty.png",
  "./src/i18n.js",
  "./src/locales/translations.json",
];

/**
 * Icons listed in the manifest, so adding one there is enough to have it
 * available offline. Hardcoding the set here meant a new icon silently missed
 * the cache until someone remembered to edit this file too.
 */
async function manifestIconAssets() {
  try {
    const response = await fetch("./manifest.json", { cache: "reload" });
    if (!response.ok) return [];
    const manifest = await response.json();
    return (manifest.icons || [])
      .map((icon) => icon && icon.src)
      .filter(Boolean);
  } catch (err) {
    console.warn("[sw] could not read icons from manifest:", err);
    return [];
  }
}

// Google Drive rate-limits bursts, and a sync asks for a couple of hundred
// drawings at once, so downloads stay deliberately gentle and back off together.
const PRECACHE_CONCURRENCY = 2;
const MAX_DOWNLOAD_ATTEMPTS = 4;
const RATE_LIMIT_COOLDOWN_MS = 4000;
const MAX_COOLDOWN_MS = 30000;
// Being throttled is worth waiting out; an unreachable host is not. Retrying
// every drawing through the full backoff once the connection is gone stalls the
// sync dialog for many minutes, so hard network errors give up quickly and the
// run is abandoned altogether after a few in a row.
const MAX_NETWORK_ATTEMPTS = 2;
const NETWORK_ABORT_THRESHOLD = 6;
// Patience for throttling still needs a ceiling. When the host refuses nearly
// everything, walking the whole list caches nothing and leaves the operator in
// front of a frozen dialog for minutes, so the run is bounded both by a run of
// consecutive failures and by wall-clock time.
const FAILURE_ABORT_THRESHOLD = 8;
const PRECACHE_DEADLINE_MS = 120000;

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
      const assets = [
        ...new Set([...SHELL_ASSETS, ...(await manifestIconAssets())]),
      ];
      // Cache assets individually: with addAll a single missing file would
      // abort the whole install and leave the app without an offline shell.
      await Promise.all(
        assets.map(async (asset) => {
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
  const url = new URL(request.url);
  const isDocument =
    request.mode === "navigate" ||
    request.destination === "document" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html");

  // HTML must revalidate so a deploy is visible on the next load. Drawings
  // stay cache-first; going underground still has the last good shell.
  if (isDocument) {
    try {
      const response = await fetch(request, { cache: "reload" });
      if (response.ok && url.origin === self.location.origin) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      const cached =
        (await cache.match(request, { ignoreSearch: true })) ||
        (await cache.match("./index.html"));
      return cached || offlineResponse();
    }
  }

  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && url.origin === self.location.origin) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return offlineResponse();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // The browser must fetch sw.js itself, or updates never install.
  if (url.pathname.endsWith("/sw.js")) return;

  // Spreadsheet exports must always be fresh; they are the sync source.
  if (url.hostname === "docs.google.com") return;

  event.respondWith(
    isImageRequest(request) ? handleImage(request) : handleShell(request),
  );
});

/**
 * Shared cooldown: when one download is rate-limited, every worker waits.
 * Retrying independently is what turns a burst limit into a stampede.
 */
let rateLimitedUntil = 0;

async function awaitRateLimit() {
  const remaining = rateLimitedUntil - Date.now();
  if (remaining > 0) await sleep(remaining);
}

function noteRateLimit(response) {
  // Retry-After is not CORS-safelisted, so it is usually unreadable here.
  const retryAfter = Number(response.headers.get("Retry-After"));
  const delay =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : RATE_LIMIT_COOLDOWN_MS;
  rateLimitedUntil = Math.max(
    rateLimitedUntil,
    Date.now() + Math.min(delay, MAX_COOLDOWN_MS),
  );
}

/**
 * Fetches one drawing. Resolves to `{ response }` only when the result is
 * definitely an image, otherwise to `{ kind }` describing why it failed so the
 * caller can tell a missing drawing from a lost connection.
 */
async function downloadDrawing(url, deadline) {
  const target = corsCandidate(url) || url;
  let networkFailures = 0;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    if (deadline && Date.now() > deadline) return { kind: "timeout" };
    await awaitRateLimit();

    try {
      const response = await fetch(target, { mode: "cors", cache: "no-store" });
      const type = response.headers.get("Content-Type") || "";
      if (response.ok && type.startsWith("image/")) return { response };

      if (response.status === 429) {
        noteRateLimit(response);
      } else if (response.status < 500) {
        // Any other 4xx means this drawing will not appear by asking again.
        return { kind: "missing" };
      }
    } catch (err) {
      networkFailures++;
      if (networkFailures >= MAX_NETWORK_ATTEMPTS) return { kind: "network" };
    }

    if (attempt < MAX_DOWNLOAD_ATTEMPTS) await sleep(1500 * 2 ** (attempt - 1));
  }

  return { kind: "missing" };
}

/**
 * Downloads article drawings so the app is offline-ready before the device
 * loses connectivity.
 *
 * Incremental by default: drawings already in the cache are left alone. The
 * catalogue grows daily, and re-fetching the whole set on every sync is what
 * makes a routine sync slow and provokes the host's rate limiting — the cost
 * scales with the number of requests, not the few megabytes involved.
 *
 * Pass `force` to re-download everything, which is how a drawing corrected in
 * the source data reaches terminals that already cached the old version.
 */
async function precacheMedia(urls, port, options) {
  const force = Boolean(options && options.force);
  const cache = await caches.open(MEDIA_CACHE);
  const wanted = [...new Set((urls || []).filter(Boolean))];

  // Drop entries no longer referenced by the database so a renamed or removed
  // drawing cannot linger in the cache forever.
  const keep = new Set(wanted);
  let pruned = 0;
  for (const request of await cache.keys()) {
    if (!keep.has(request.url)) {
      await cache.delete(request);
      pruned++;
    }
  }

  const pending = [];
  let reused = 0;
  for (const url of wanted) {
    if (!force && (await cache.match(url))) {
      reused++;
    } else {
      pending.push(url);
    }
  }

  const unique = pending;
  const total = unique.length;
  const deadline = Date.now() + PRECACHE_DEADLINE_MS;
  let done = 0;
  let cachedCount = 0;
  let consecutiveNetworkErrors = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  let abortReason = null;

  const abort = (reason) => {
    aborted = true;
    abortReason = abortReason || reason;
  };

  const report = () => {
    if (port) port.postMessage({ type: "PRECACHE_PROGRESS", done, total });
  };
  report();

  let cursor = 0;
  async function worker() {
    while (cursor < unique.length && !aborted) {
      const url = unique[cursor++];
      try {
        const result = await downloadDrawing(url, deadline);
        if (result.response) {
          // Stored under the original URL so the <img> tags hit the cache.
          await cache.put(url, result.response);
          cachedCount++;
          consecutiveNetworkErrors = 0;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          if (result.kind === "network") {
            consecutiveNetworkErrors++;
            if (consecutiveNetworkErrors >= NETWORK_ABORT_THRESHOLD) {
              abort("network");
            }
          } else {
            consecutiveNetworkErrors = 0;
          }
          if (consecutiveFailures >= FAILURE_ABORT_THRESHOLD) {
            abort("unavailable");
          }
        }
      } catch (err) {
        consecutiveFailures++;
      }

      if (Date.now() > deadline) abort("timeout");
      done++;
      report();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PRECACHE_CONCURRENCY, total || 1) }, worker),
  );

  if (port) {
    const offline = reused + cachedCount;
    port.postMessage({
      type: "PRECACHE_DONE",
      total: wanted.length,
      cached: offline,
      failed: wanted.length - offline,
      downloaded: cachedCount,
      reused,
      pruned,
      aborted,
      reason: abortReason,
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
    event.waitUntil(precacheMedia(data.urls, port, { force: data.force }));
  } else if (data.type === "MEDIA_STATS") {
    event.waitUntil(mediaStats(port));
  } else if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
