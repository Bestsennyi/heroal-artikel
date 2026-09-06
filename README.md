# heroal Artikel 📦

> Autonome Offline-First PWA für Schnelle Artikelsuche, Profilvisualisierung und Farbcodierung (Industrie- & Lager-Terminals).

## 🚀 Funktionen

- **Schnellsuche & Artikelfilter:** Sofortige Suche nach Profilnummern (`artikel_nr`), Barcodes und Bezeichnungen.
- **Offline-First Architektur:** Vollständige Funktion im Offline-Modus dank Service Worker und lokalem IndexedDB-Speicher.
- **Profil- & Zeichnungsvisualisierung:** Technische Querschnitte, Detailkarten mit Pinch-to-Zoom und lokaler Medien-Cache.
- **Farbreferenz & Pulverbeschichtung:** Farbkatalog (RAL, SD) mit visuellen Farbfeldern und echten Farbmustern.
- **Foto-Upload & Lager-Notizen:** Direkter Bildupload über Google Apps Script mit automatischer Ablage in dedizierten Google Drive Ordnern.
- **Mehrsprachige Benutzeroberfläche:** 3 Zielsprachen (Deutsch `DE`, Englisch `EN`, Russisch `RU`) mit dynamischem Umschalten.
- **Touch- & Industrie-optimiert:** Angepasst für Industrie-Touchscreens (Mindest-Touchzone 44×44px, integrierte Bildschirmtastatur mit `inputmode="none"`, Dark-Mode).

## 🛠️ Tech-Stack & Infrastruktur

- **Frontend:** Vanilla HTML5, CSS3 (:root Design-Tokens, Dark Mode), Vanilla ES6+ (Monolith `index.html`, keine Bundler/npm im Runtime).
- **Offline-Caching:** Service Worker (`sw.js`) mit getrennten Caches:
  - `heroal-shell-v*`: Anwendungs-Shell (HTML, Lokalisierung, Icons).
  - `heroal-media-v*`: Medien und technische Zeichnungen (`Cache-First`).
- **Lokale Persistenz:** IndexedDB (`heroal_warehouse_db`, v4):
  - `store_data`: Gesamter Katalog im RAM (`appDB`) und IDB-Key `heroal_db`.
  - `translations`: UI-Translations-Overlay (`bundle`).
  - `photoQueue`: Offline-Upload-Warteschlange für Fotos.
- **Backend & Synchronisation:**
  - Datenquelle: Google Sheets CSV-Export (`pub?gid=...&output=csv`).
  - Bildupload: Google Apps Script Web App (`doPost`, `gas/Code.gs`) ➔ Google Drive API.
- **Lokalisierung (i18n):** Zwei-Schichten-System (`src/i18n.js` für UI, tabellengesteuerte Spalten `*_de`, `*_en`, `*_ru` für Katalogdaten).
- **Live-Demo:** https://bestsennyi.github.io/heroal-artikel/