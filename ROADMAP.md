# heroal Artikel — Техническая дорожная карта

Документ фиксирует фактическое состояние PWA (оболочка `heroal-shell-v379`, медиа `heroal-media-v2`) и то, что ещё не закрыто. Это не маркетинговый бриф, а рабочий срез для запуска и следующих итераций.

---

## Вердикт: презентация и запуск

**Презентовать можно.** Сценарий склада закрыт: PIN, поиск артикулов/цветов/Auskunft, чертежи, зум/свайп, офлайн после синка, фото в очередь, три языка UI.

**Запускать в работу можно — по контуру Google Таблицы + Drive.** Это текущий продакшен (`CONFIG.DATA_SOURCE: "GOOGLE"`). Условия приёмки терминала:

1. Установить PWA (не «вкладка Chrome»): иначе `navigator.storage.persist()` часто `false`, кэш чертежей могут вытеснить.
2. Один успешный синк каталога и чертежей. Первый проход по Drive/`lh3` может оборваться по 429 — это штатно; повтор через минуту докачивает недостающее. Не считать терминал готовым, пока синк не предупреждает о недостающих чертежах.
3. Пользователи только из листа `benutzer` со статусом **Aktiv** и PIN ровно из 4 цифр. Неизвестный PIN отклоняется.
4. Фото пишут только активные администраторы. Остальные роли — справочник.
5. Не проверять офлайн через DevTools Offline / Shift+F5: жёсткая перезагрузка обходит service worker.

**PocketBase — не текущий прод, а подготовленный cutover.** Переключение рабочее (сиды, импорт чертежей в file-поля, precache `/api/files`, фото PATCH), но это отдельная операция на LAN, не «кнопка в настройках». Порт PocketBase нельзя выставлять в интернет: правила коллекций открытые.

---

## ✅ Что уже сделано

### 1. Стандартизация базы (Google Sheets)
- Листы в нижнем регистре: `artikel`, `farben`, `auskunft`, `benutzer`; первичная колонка `id`.
- Ключи: `artikel_nr` (алиасы `artnr` / `art_nr`), `system`, `bild_haupt` (алиас `img_url`), слоты `bild_1`–`bild_4`.
- Каталог трёхъязычный: колонки `*_de` / `*_en` / `*_ru`. UI-словарь — отдельный контур (`src/i18n.js` + `translations.json`, валидация `scripts/validate-i18n.js`).

### 2. Бэкенд фото (Google Apps Script & Drive)
- `gas/Code.gs`: только `uploadPhoto` + инструменты таблицы. Поиск листов/колонок без учёта регистра.
- Папки строго `FOLDER_ARTIKEL_ID` / `FOLDER_FARBEN_ID`, не корень Диска.
- Меню `⚙️ heroal Skripte`: `syncImagesFromDrive()`, `updateFarbenFormulas()`.
- Контракт имён: `{artikel_nr}.jpg`, `{artikel_nr}_1.jpg`…`_4.jpg`, `{code}.jpg` / `{code}_dummy.jpg`.
- Публичная ссылка: `https://lh3.googleusercontent.com/d/{fileId}=w1600`.
- Записи справочника из PWA в таблицу **нет** — Auskunft правится в Sheets (Google) или в админке PocketBase (LOCAL).

### 3. Офлайн, кэши, IndexedDB
- Два кэша: оболочка `heroal-shell-v379` (бампается при правках UI), медиа `heroal-media-v2` (**не** бампать без порчи хранилища).
- HTML: network-first; чертежи: cache-first, в кэш только `Content-Type: image/`, без opaque.
- CSV с `docs.google.com` SW не перехватывает. JSON PocketBase `/api/collections/` тоже не кэшируется оболочкой; `/api/files/` идёт как картинки.
- IndexedDB `heroal_warehouse_db` **v6**: `store_data` (`heroal_db`), `translations` (`bundle`), `photoQueue` (Blob). Store `writeQueue` при апгрейде удаляется, если остался от короткого эксперимента.
- Каталог в RAM (`appDB`); base64/Blob в каталог не пишутся.
- `navigator.storage.persist()` при старте.

### 4. Поиск, UX терминала, фото
- Поля `#find-prof` / `#find-color` / `#find-guide`, debounce 150 мс, `RESULT_LIMIT = 80`, индексы AND-токенов, точный `artikel_nr` / `code` наверх.
- Сетка: смартфон / планшет / десктоп, `body { overflow: hidden }`, OSK с `inputmode="none"`.
- Карточки: свайп галереи, зум с превью, копирование номера/HEX/описания, плейсхолдер SVG при дырке в чертеже.
- Автовыход по простою 20 минут. Горячие клавиши `/`, `Alt+C`, `Esc`.
- Фото: JPEG 0.82, сторона ≤ 1600px, очередь `photoQueue`, flush при `online` и после синка.

### 5. Precache чертежей
- Синк качает чертежи **на странице** (`precacheCatalogMediaChunked`: пачки по 6, пауза 120 мс, `cache.match` пропускает уже лежащее).
- В очередь входят HTTP-URL с `lh3` **и** `/api/files/` (артикулы + проверяемые фото цветов).
- Инкремент: обычный синк не затирает кэш. Полная перекачка — `triggerSync(true)` (API есть, **кнопки в UI сейчас нет** — см. пробелы).
- Дедлайны и abort по сети/429 остаются в SW (`precacheMedia`, concurrency 2) на случай вызова `PRECACHE_MEDIA`; текущий ручной синк идёт через страничный путь.

### 6. Авторизация
- PIN строго 4 цифры; только учётки из каталога со `status_de === "Aktiv"`.
- Неизвестный PIN — отказ, не «гостевой Mitarbeiter».
- После синка сессия перепроверяется; деактивированного выкидывает.

### 7. DataProvider
- Контракт: `fetchCatalog`, `uploadPhoto`.
- `GoogleSheetsDataProvider` — CSV + GAS (прод).
- `LocalServerDataProvider` — PocketBase REST + multipart.
- Источник: `CONFIG.DATA_SOURCE` (`GOOGLE` | `LOCAL`) или override `heroal_urls.dataSource` / `localServer` в `localStorage`. `localhost` в URL сервера подменяется на hostname страницы; пустой URL = same-origin.

### 8. server-kit (PocketBase)
- `schema.json`, `migrate-csv.js` (Node 18+), `server-kit/README.md`.
- Сид из `data/*.csv` или встроенного seed (PIN `1234` / `1111`).
- Импорт медиа с Drive/`lh3` в file-поля (2 потока). `PB_IMPORT_MEDIA=0` — только текст.
- Auskunft после cutover — коллекция в админке `/_/`.

### 9. Чистота рантайма и PWA-манифест
- Мусорные URL не уходят в `<img>` и precache; Drive-ссылки нормализуются в `lh3`.
- SW `fetch` не роняет воркер; битые чертежи — `console.debug`.
- `manifest.json`: `id` = `start_url`, `theme_color` `#003a79`, иконки 192/512 `any` / `maskable`.

### 10. Тесты
- Playwright: PIN `1111` + шапка; поиск `1371` после офлайн-reload со SW; офлайн-запись в `photoQueue`.
- Это smoke, не регресс всего склада.

---

## Условия эксплуатации (Google-контур)

| Тема | Как есть |
|---|---|
| Источник данных | Опубликованные CSV (`links_heroal_artikel.txt` / `DEFAULT_URLS`). Не Sheets REST API. |
| URL таблиц | Вшиты в код + `localStorage.heroal_urls`. **Формы в настройках больше нет** (остались только ключи i18n). |
| Тихий синк | 2.5 с после старта, каждые 12 мин, событие `online`. Ручной — модалка, 120 с; тихий — 25 с на CSV. |
| Исправленный чертёж | Инкремент оставит старую копию, пока не вызвать `triggerSync(true)`. |
| Квота | Persist запрашивается; оператор usage/quota не видит. |
| Роли | Админ / сотрудник / клиент в бейдже; фото только админ. GAS-URL в UI не спрятан отдельно — его просто нет в настройках. |

---

## 🔮 Дальше (не блокирует сегодняшний запуск)

Ниже — зрелость, не обязательный чеклист go-live. Архитектура та же: монолит `index.html`, IndexedDB v6, двухконтурный SW, `DataProvider`.

### Операционные дыры текущего UI
- Вернуть кнопку **«Alle Zeichnungen neu laden»** (`triggerSync(true)`) — ключ `settings.settings_reload` уже в словаре, в шаблоне настроек кнопки нет.
- При желании — поля CSV URL в настройках (ключи `settings.settings_urls` тоже висят без UI) либо сознательно оставить только код/`localStorage`.
- Постоянный индикатор «N фото ждут сеть» в шапке, ручной retry `photoQueue`.

### Сканеры
- `barcode` уже в индексе; камеры `BarcodeDetector` нет. HID-клин: буфер scan-gap, чтобы debounce 150 мс не резал пачку.

### Фон и квота
- Background Sync / Periodic Background Sync для flush фото и докачки чертежей без модалки.
- `storage.estimate()` в настройках, порог >80%, раздельный учёт оболочки / media / `photoQueue`.

### Хрупкость Drive и масштаб
- `lh3`/thumbnail — единственная ненадёжная зависимость Google-контура (429, смена URL). Свой CDN или уже готовый PocketBase-файловый контур.
- Дифф CSV (ETag/хеш вкладки), чтобы не тянуть четыре таблицы целиком каждые 12 мин.
- Телеметрия без PII: версия оболочки, `PERSISTED`, доля чертежей, код abort.

### PocketBase cutover (когда понадобится, не «завтра утром»)
- Чеклист: бинарь, `serve` на LAN, CSV в `server-kit/data/`, `migrate-csv.js` с медиа, `DATA_SOURCE: LOCAL` или `heroal_urls`, один Sync, правка Auskunft только в `/_/`.
- Не открывать 8090 в WAN. Для цеха предпочтителен reverse-proxy: `/` = PWA, `/api` = PocketBase (same-origin).

### Качество поставки
- Playwright: смена языка, офлайн-цвета, abort precache, неизвестный PIN, force-reload чертежей.
- CSP (`docs.google.com`, `lh3`, GAS / PocketBase в allowlist).
- Фикстуры CSV в `tests/fixtures` без сборщика.
- Мёртвые i18n-ключи настроек — либо UI, либо удалить после валидатора «unused».

---

## Статус одной строкой

**Google-контур готов к промышленному справочнику на терминалах** при установке PWA и успешном синке чертежей. **Локальный сервер готов как запасной контур**, не как текущий день-1. Точечные дыры (force-reload чертежей в UI, квота, сканер) не отменяют запуск справочника.
