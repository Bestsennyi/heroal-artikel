# heroal LagerGuide

A static, offline-capable Progressive Web App (PWA) — a warehouse/packing assistant for heroal logistics. The entire app is client-side: `index.html` holds all UI, CSS, and JavaScript; `sw.js` is the service worker; `manifest.json` is the PWA manifest; `icons/` holds icons; `links_base.txt` documents the published Google Sheets CSV export URLs used for data sync.

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
