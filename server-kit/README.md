# server-kit — PocketBase for heroal Artikel

The PWA runs on **Google Sheets + Drive** until you switch it. This folder is the
turnkey local stack: one PocketBase binary, schema, CSV seed, and a media import
that copies drawings into PocketBase file fields so terminals can go offline
without Google.

Requires **Node 18+** (`fetch`, `FormData`, `Blob`).

## 1. Install PocketBase

Download the binary for your OS from
https://github.com/pocketbase/pocketbase/releases
and put it in this folder (`pocketbase` or `pocketbase.exe`).

Create an admin once:

```
./pocketbase superuser upsert admin@heroal.local change-me-now
```

Windows:

```
.\pocketbase.exe superuser upsert admin@heroal.local change-me-now
```

## 2. Start

```
./pocketbase serve
```

Admin UI: http://127.0.0.1:8090/_/  
API: http://127.0.0.1:8090/api/

On a warehouse LAN, bind all interfaces:

```
./pocketbase serve --http=0.0.0.0:8090
```

Keep the PWA and PocketBase on the **same host name** (or reverse-proxy `/api`
to PocketBase). The PWA rewrites `localhost` in `LOCAL_SERVER_URL` to the page
hostname, so a terminal opening `http://192.168.1.10:8000` talks to
`http://192.168.1.10:8090`.

## 3. Load catalogue + drawings

Put CSV exports in `server-kit/data/` with these names:

- `artikel.csv`
- `farben.csv`
- `auskunft.csv`
- `benutzer.csv`

Headers must match the live Google Sheets (`artikel_nr`, `bild_haupt` /
`img_url`, `bild_1`…`bild_4`, `code`, `echtes_foto`, `pin`, language columns
`*_de` / `*_en` / `*_ru`).

From this folder, with PocketBase running:

```
PB_ADMIN_EMAIL=admin@heroal.local PB_ADMIN_PASSWORD=change-me-now node migrate-csv.js
```

Windows PowerShell:

```
$env:PB_ADMIN_EMAIL="admin@heroal.local"
$env:PB_ADMIN_PASSWORD="change-me-now"
node migrate-csv.js
```

The script:

1. Imports `schema.json` (idempotent).
2. Replaces records in `artikel`, `farben`, `auskunft`, `benutzer`.
3. Downloads drawings from Drive/`lh3` URLs in the CSV and stores them in
   PocketBase file fields (`bild_haupt`, `bild_1`…`bild_4`, `echtes_foto`,
   `bild_dummyimage`). Rate-limited (2 at a time).

If `data/*.csv` is missing, the inlined seed (PIN `1234` / `1111`, articles
`1371` / `5044`) is used instead.

Skip drawing download (text-only, still depends on Google URLs):

```
PB_IMPORT_MEDIA=0 node migrate-csv.js
```

Optional: `PB_URL=http://127.0.0.1:8090`

Handbook rows after go-live are edited in PocketBase Admin (`auskunft`), not in
the PWA.

## 4. Point the PWA at PocketBase

Either change `CONFIG` in `index.html` and bump `SHELL_VERSION` in `sw.js`:

```js
DATA_SOURCE: "LOCAL",
LOCAL_SERVER_URL: "http://localhost:8090",
```

Or, without another code edit, in the browser console on a terminal:

```js
const u = JSON.parse(localStorage.getItem("heroal_urls") || "{}");
u.dataSource = "LOCAL";
u.localServer = "http://192.168.1.10:8090"; // omit to keep CONFIG default
localStorage.setItem("heroal_urls", JSON.stringify(u));
location.reload();
```

Empty `LOCAL_SERVER_URL` means “same origin” (nginx: `/` = PWA, `/api` = PocketBase).

Then **Sync** once so drawings land in `heroal-media-v2`. After that the
terminal is offline-capable against the local files, not Drive.

Switch back: `dataSource: "GOOGLE"` (or `CONFIG.DATA_SOURCE`) and reload.

## Notes

- Collection rules are open (`list` / `view` / `create` / `update`) so the PWA
  can read the catalogue and upload photos without a PocketBase login. Do not
  expose this port to the public internet.
- Photo capture in LOCAL mode PATCHes the matching `artikel` / `farben` file
  field. The Google Apps Script web app is not used.
- Do not bump `heroal-media-v*` when only switching the data source.
