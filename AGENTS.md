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
