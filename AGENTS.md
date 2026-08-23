# heroal LagerGuide

A static, offline-capable Progressive Web App (PWA) — a warehouse/packing assistant for heroal logistics. The entire app is client-side: `index.html` holds all UI, CSS, and JavaScript; `sw.js` is the service worker; `manifest.json` is the PWA manifest; `icons/` holds icons; `links_base.txt` documents the published Google Sheets CSV export URLs used for data sync.

## Project brief

**Purpose.** An Offline-First PWA reference tool for warehouse and packing staff at heroal (German manufacturer of aluminium profile systems, blinds, roller shutters and hardware). It targets warehouse terminals and mobile devices, and must stay fast and fully autonomous without connectivity.

**Core goals.**

- Instant lookup of heroal profile article numbers with drawings, dimensions and packing instructions.
- Colour identification (RAL / SD special coatings / heroal Farben) with a visual colour swatch.
- Instructions for booking scrap/defects in ERP (ERP-Maske 15).
- Fast lookup of regulations and procedures (Auskunft).
- Bilingual operation: German (primary) and Russian.

**Stack and architecture (deliberate choices — keep them).**

- Vanilla HTML5 / CSS3 / ES6+ only. No frameworks or bundlers, for speed and autonomy.
- PWA offline via `sw.js` (cache-first, plus dynamic interception/caching of images).
- IndexedDB (`heroal_warehouse_db`) stores all tables and cached data.
- Data source: published Google Sheets CSV exports; URLs are configurable at runtime through the settings modal (⚙️).
- Styling follows the official heroal dark-blue theme (`#003a79`).

**Implemented today.** Packnummer login with `gesperrt` (blocked) status check and 20-minute idle auto-logout; responsive layout (mobile <900px fixed 60/40 profiles-vs-colours with no full-page scroll, desktop ≥900px symmetric 50/50 full-height grid); stepwise Google Sheets sync with a CSV parser, modal progress bar and IndexedDB write; warehouse UX niceties — global hotkeys (`/` focuses profiles, `Alt+C` focuses colours, `Esc` resets/closes), one-click copy of article numbers and HEX codes with toast confirmation, automatic SVG placeholder bearing the article number when a drawing is missing or fails to load, a drawing zoom modal, and a live online/offline indicator that blocks sync when offline.

**Working agreement.** The brief above is the design intent; it is expected to be reviewed against real results and adjusted as the project evolves. Treat it as direction, not a frozen spec.

## The offline rule

**Offline is the baseline state, not a fallback mode.** The app must be fully usable with no connectivity at all — the stated bar is "working 1 km underground". Reliable, fast, simple. Any change that makes correct behaviour depend on a live network is a regression, even if it works on a desk with good WiFi.

Consequences that are easy to get wrong:

- **Drawings must be downloaded during sync, not on first view.** They are the only content the app cannot reconstruct locally. `triggerSync` hands every drawing URL to the service worker (`PRECACHE_MEDIA`), which downloads and verifies each one.
- **Never cache a response you cannot verify.** A cross-origin `no-cors` request returns an opaque response whose status is unreadable, so a transient HTTP 429 gets stored as if it were a drawing and the terminal shows a placeholder forever, offline, with nothing reporting it. Drawings are therefore fetched via the CORS-capable `lh3.googleusercontent.com/d/<id>=<size>` form of each Drive link so status and content type can be checked. This also cuts reported storage from ~1.3 GB to ~8 MB, because browsers pad opaque cache entries by megabytes each.
- **Google Drive rate-limits bursts.** One sync asks for ~185 images. Downloads run at concurrency 2 with a cooldown shared across workers; retrying each image independently turns a burst limit into a stampede (a 3x retry once produced 579 requests, all 429, and cached nothing).
- **The precache is incremental, and must stay that way.** Only drawings missing from the cache are fetched, and entries the database no longer references are pruned. This is the main defence against the rate limit, because the limit tracks request count rather than bytes: a routine sync went from 185 requests and ~7.8 MB to 10 requests and 49.7 kB, and from 30-60s to about 2s. The catalogue grows daily, so anything that reintroduces a full re-download on every sync makes the slowest part of the app scale with the size of the database. A corrected drawing therefore needs the explicit "Alle Zeichnungen neu laden" action in settings (`triggerSync(true)`), since the incremental path will otherwise keep serving the copy already on the device.
- **The precache must stay bounded, and every failure mode is time-capped.** Two separate incidents produced a progress dialog frozen for 6-9 minutes: first by applying rate-limit patience to hard network errors, then by having no ceiling on that patience at all. The run now gives up on a drawing after 2 network errors, abandons the whole run after 6 consecutive network errors or 8 consecutive failures of any kind, and stops at a 120s deadline. Measured settling times: unreachable host 6s, sustained 429 92s, all-404 immediate, healthy run unchanged. Scattered individual failures deliberately do *not* abort the run.
- **An aborted sync is normal and recoverable — do not treat it as a bug.** When the drawing host throttles, the first sync can legitimately stop early (it reports `Zeichnungs-Server begrenzt Anfragen` / `Сервер чертежей ограничивает запросы`) and a second sync a short while later usually completes 185/185. This was observed repeatedly against the live host. A failed run never deletes drawings already cached, so the terminal keeps working while the operator retries.
- **A partially cached terminal must not look ready.** When drawings are missing the sync result warns with the count instead of reporting success, and startup logs `[offline] Artikel: N, Zeichnungen im Cache: X/Y`.
- **Two caches, on purpose.** `heroal-shell-v*` is versioned and replaced on deploy; `heroal-media-v*` holds drawings and deliberately survives shell updates. Bumping the media cache name forces every terminal to re-download, so only do it to discard entries that may be corrupt. Verified by releasing a shell version change: the old shell cache is dropped, a new one is built, and all 185 drawings remain.
- **Service worker image lookups must search all caches.** App icons live in the shell cache while drawings live in the media cache, so `handleImage` uses `caches.match` rather than opening one cache.
- **`navigator.storage.persist()` is requested at startup** so the cache is not evicted under storage pressure. Chrome grants this only for installed PWAs or sites with engagement, so it returns false on a plain localhost tab — expect `PERSISTED=false` in development. Real terminals should install the PWA.

### Verifying offline behaviour

Do not trust the DevTools "Offline" checkbox alone; it has silently failed to apply during testing. To prove offline behaviour, stop the static server *and* block the data hosts at DNS level, then flush Chrome's host cache via `chrome://net-internals/#dns`:

```
127.0.0.1 drive.google.com
127.0.0.1 lh3.googleusercontent.com
127.0.0.1 docs.google.com
```

Leaving throttling at "No throttling" makes the test stricter: the app still believes it is online, so anything that renders provably came from cache. Useful console checks:

```js
caches.keys().then(async ks => { for (const k of ks) { const c = await caches.open(k); console.log(k, (await c.keys()).length); } })
navigator.storage.estimate().then(e => console.log((e.usage/1048576).toFixed(1) + ' MB'))
```

### Known weak points (not yet addressed)

- Drawings are hosted on Google Drive via the undocumented `thumbnail`/`lh3` endpoints. This is the most fragile dependency in the project: it rate-limits, and the URL format could change without notice. Hosting the drawings with the app or on a real CDN would remove the sync's only unreliable step.
- `handleLogin` accepts any unknown Packnummer as a generic "Mitarbeiter", so the `gesperrt` block is bypassable by typing a different number. `README.md` also documents a master code `9999` that does not exist in the code.

## Communication

The maintainer (Maksym) communicates in Russian — reply in Russian unless asked otherwise. Code, identifiers and commit messages stay in English; user-facing UI strings stay German/Russian.

## Cursor Cloud specific instructions

### Overview

This is a pure static site. There is **no package manager, no build step, no test suite, and no dependencies to install**. "Running" the app just means serving the repository root over HTTP.

### Run (development)

Serve the repo root with any static file server, e.g.:

```
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://localhost:8000/index.html`.

### Non-obvious notes

- **Works fully offline with seed data.** `index.html` embeds a `DEFAULT_DATA` seed (users, articles, colors, defects), so the app is functional without any network access. Use it for local testing:
  - Login Packnummer `1234` → user "Max Best" (any Packnummer is accepted; unknown numbers log in as a generic "Mitarbeiter"; master behavior via the seed users only).
  - Article search: `1371` ("Blende FMR HC oben") or `5044`. Color search: `7016`, `9016`, `8000`.
- **Data sync needs external network.** The "Sync" button (`triggerSync`) fetches live CSVs from Google Sheets (URLs in `links_base.txt` / `DEFAULT_URLS`). This requires outbound internet to `docs.google.com` and will fail offline — this does not indicate a broken environment.
- **Service worker caching can mask edits.** `sw.js` uses a versioned cache (`CACHE_NAME`) and serves cached assets first. When editing files, hard-reload / bypass the service worker (or bump `CACHE_NAME`) so changes are picked up.
- **UI is bilingual** (German default, Russian toggle). State (current user, language, DB) is persisted in `localStorage` / IndexedDB.
- **Lint/build/test:** none configured in this repo.
