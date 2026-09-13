#!/usr/bin/env node
/**
 * Create PocketBase collections from schema.json and seed records
 * from server-kit/data/*.csv (if present) or the inlined DEFAULT_DATA seed.
 *
 * Env:
 *   PB_URL                default http://127.0.0.1:8090
 *   PB_ADMIN_EMAIL
 *   PB_ADMIN_PASSWORD
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const SCHEMA_PATH = path.join(ROOT, "schema.json");
const BASE = String(process.env.PB_URL || "http://127.0.0.1:8090").replace(
  /\/$/,
  "",
);
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@heroal.local";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "change-me-now";
const LANGS = ["de", "en", "ru"];

const DEFAULT_DATA = {
  users: {
    1234: {
      nummer: "2020",
      pin: "1234",
      vorname_de: "Max",
      nachname_de: "Best",
      benutzer_de: "Mitarbeiter",
      status_de: "Aktiv",
    },
    1111: {
      nummer: "1111",
      pin: "1111",
      vorname_de: "Admin",
      nachname_de: "heroal",
      benutzer_de: "Administrator",
      status_de: "Aktiv",
    },
    "0001": {
      nummer: "0001",
      pin: "0001",
      vorname_de: "Inaktiv",
      nachname_de: "Konto",
      benutzer_de: "Mitarbeiter",
      status_de: "Inaktiv",
    },
  },
  artikel: {
    1371: {
      id: "1",
      art_nr: "1371",
      artikel_nr: "1371",
      barcode: "",
      name_de: "Blende FMR HC oben",
      category: "Blenden",
      system: "FMR HC",
      masse_de: "FMR HC",
      hinweis_de:
        "Blende oben für FMR HC. Bei Verpackung auf Kantenschutz achten.",
      image_url:
        "https://drive.google.com/thumbnail?sz=w1000&id=1yr4XwcJ42a-HL_YVqBV-WhMnPOpKuqGL",
      drive_folder_id: "",
    },
    5044: {
      id: "2",
      art_nr: "5044",
      artikel_nr: "5044",
      barcode: "",
      name_de: "F-HTF-IS DRP (Insektenschutz)",
      category: "Führungen",
      system: "Rollladen + ISG",
      masse_de: "Rollladen + ISG",
      hinweis_de: "",
      image_url: "",
      drive_folder_id: "",
    },
  },
  farben: {
    7016: {
      code: "7016",
      hex: "#383E42",
      name_de: "Anthrazitgrau",
      oberflaeche_de: "RAL 7016 Matt / Glanz",
      kollektion: "RAL",
      hinweis_de: "Standard-Anthrazit für heroal Profile.",
      name_en: "Anthracite grey",
      name_ru: "Антрацитово-серый",
    },
    9016: {
      code: "9016",
      hex: "#F1F0EA",
      name_de: "Verkehrsweiß",
      oberflaeche_de: "RAL 9016 Standard",
      kollektion: "RAL",
      name_en: "Traffic white",
      name_ru: "Транспортный белый",
    },
    8000: {
      code: "8000",
      hex: "#826C34",
      name_de: "Grünbraun",
      oberflaeche_de: "heroal Standard",
      kollektion: "heroal",
      name_en: "Green brown",
      name_ru: "Зелёно-коричневый",
    },
  },
  auskunft: [
    {
      kategorie_de: "ERP 15",
      name_de: "Ausschuss richtig buchen",
      beschreibung_de:
        "Achtung: Nur mit gültiger Packnummer buchen.\n1. ERP Maske 15 öffnen.",
      name_ru: "Списание брака в ERP 15",
      beschreibung_ru: "Внимание: Списывать только с действующим Packnummer.",
    },
    {
      kategorie_de: "Verpackung",
      name_de: "Verpackungsrichtlinie Blenden",
      beschreibung_de:
        "Schutzfolie prüfen, Eckschützer anbringen und mit Stretchfolie fixieren.",
      name_ru: "Правила упаковки коробов и бленд",
      beschreibung_ru:
        "Проверить защитную пленку, установить угловые протекторы и зафиксировать стрейч-пленкой.",
    },
  ],
};

function parseCSV(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  return lines.map((line) => {
    const row = [];
    let inside = false;
    let cell = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inside = !inside;
      else if (c === "," && !inside) {
        row.push(cell.trim());
        cell = "";
      } else cell += c;
    }
    row.push(cell.trim());
    return row;
  });
}

function csvMap(header) {
  const map = {};
  (header || []).forEach((raw, i) => {
    const name = String(raw || "").trim();
    if (!name) return;
    map[name] = i;
    map[name.toLowerCase()] = i;
  });
  return map;
}

function cell(row, map, names) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    if (!name) continue;
    let i = map[name];
    if (i == null) i = map[String(name).toLowerCase()];
    if (i == null) continue;
    const v = String(row[i] == null ? "" : row[i]).trim();
    if (v) return v;
  }
  return "";
}

function loadCsv(fileName) {
  const file = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(file)) return null;
  const rows = parseCSV(fs.readFileSync(file, "utf8"));
  if (!rows.length) return { map: {}, rows: [] };
  return { map: csvMap(rows[0]), rows: rows.slice(1) };
}

function parseArtikelCsv(table) {
  const out = {};
  if (!table) return out;
  table.rows.forEach((row) => {
    const artNr = cell(row, table.map, [
      "artikel_nr",
      "art_nr",
      "artnr",
      "art-nr",
    ]);
    if (!artNr) return;
    const bildHaupt = cell(row, table.map, [
      "bild_haupt",
      "img_url",
      "image_url",
    ]);
    const rec = {
      sheet_id: cell(row, table.map, "id"),
      artikel_nr: artNr,
      art_nr: artNr,
      barcode: cell(row, table.map, ["barcode", "ean", "ean13"]),
      category: cell(row, table.map, ["kategorie_de", "category"]),
      system: cell(row, table.map, ["system", "systeme"]),
      image_url: bildHaupt,
      img_url: bildHaupt,
      image_type: cell(row, table.map, ["image_type", "type"]),
      drive_folder_id: cell(row, table.map, "drive_folder_id"),
    };
    LANGS.forEach((code) => {
      rec["name_" + code] = cell(row, table.map, "name_" + code);
      rec["kategorie_" + code] = cell(row, table.map, "kategorie_" + code);
      rec["masse_" + code] = cell(row, table.map, [
        "masse_" + code,
        code === "de" ? "masse" : "",
        code === "de" ? "size" : "",
      ]);
      const text = cell(row, table.map, [
        "beschreibung_" + code,
        "hinweis_" + code,
      ]);
      rec["beschreibung_" + code] = text;
      rec["hinweis_" + code] = text;
    });
    if (!rec.kategorie_de) rec.kategorie_de = rec.category;
    for (let n = 1; n <= 4; n++) {
      rec["img_" + n] = cell(row, table.map, ["bild_" + n, "img_" + n]);
    }
    out[artNr] = rec;
  });
  return out;
}

function parseFarbenCsv(table) {
  const out = {};
  if (!table) return out;
  table.rows.forEach((row) => {
    const code = cell(row, table.map, "code");
    if (!code) return;
    let hex = cell(row, table.map, "hex");
    if (hex && hex.charAt(0) !== "#") hex = "#" + hex;
    out[code] = {
      sheet_id: cell(row, table.map, "id"),
      code,
      hex: hex || "#ffffff",
      image_url: cell(row, table.map, [
        "bild_dummyimage",
        "image_url",
        "img_url",
      ]),
      echtes_foto_url: cell(row, table.map, ["echtes_foto", "echtes_foto_url"]),
      image_type: cell(row, table.map, ["image_type", "type"]),
      name_de: cell(row, table.map, "name_de"),
      name_en: cell(row, table.map, "name_en"),
      name_ru: cell(row, table.map, "name_ru"),
      kategorie_de: cell(row, table.map, "kategorie_de"),
      kategorie_en: cell(row, table.map, "kategorie_en"),
      kategorie_ru: cell(row, table.map, "kategorie_ru"),
      oberflaeche_de: cell(row, table.map, "oberflaeche_de"),
      oberflaeche_en: cell(row, table.map, "oberflaeche_en"),
      oberflaeche_ru: cell(row, table.map, "oberflaeche_ru"),
      kollektion: cell(row, table.map, ["kollektion", "collection"]),
      hinweis_de: cell(row, table.map, ["hinweis_de", "beschreibung_de"]),
      hinweis_en: cell(row, table.map, ["hinweis_en", "beschreibung_en"]),
      hinweis_ru: cell(row, table.map, ["hinweis_ru", "beschreibung_ru"]),
    };
  });
  return out;
}

function parseAuskunftCsv(table) {
  const out = [];
  if (!table) return out;
  table.rows.forEach((row, idx) => {
    const item = {
      sheet_id: cell(row, table.map, "id"),
      sort: idx + 1,
    };
    LANGS.forEach((code) => {
      item["kategorie_" + code] = cell(row, table.map, "kategorie_" + code);
      item["name_" + code] = cell(row, table.map, "name_" + code);
      item["beschreibung_" + code] = cell(
        row,
        table.map,
        "beschreibung_" + code,
      );
    });
    if (LANGS.some((code) => item["kategorie_" + code] || item["name_" + code])) {
      out.push(item);
    }
  });
  return out;
}

function parseBenutzerCsv(table) {
  const out = {};
  if (!table) return out;
  table.rows.forEach((row) => {
    const pin = cell(row, table.map, "pin");
    const nummer = cell(row, table.map, ["benutzername", "nummer", "nr"]);
    const key = pin || nummer;
    if (!key) return;
    const role = cell(row, table.map, [
      "rolle_de",
      "benutzer_de",
      "rolle",
      "role",
      "benutzer",
    ]);
    out[key] = {
      sheet_id: cell(row, table.map, "id"),
      pin: pin || key,
      nummer: nummer || key,
      benutzername: nummer || key,
      vorname_de: cell(row, table.map, ["vorname_de", "vorname", "first"]),
      nachname_de: cell(row, table.map, ["nachname_de", "nachname", "last"]),
      rolle_de: role,
      benutzer_de: role,
      status_de: cell(row, table.map, ["status_de", "status"]),
    };
  });
  return out;
}

function seedFromDefault() {
  const artikel = {};
  Object.keys(DEFAULT_DATA.artikel).forEach((key) => {
    const row = DEFAULT_DATA.artikel[key];
    artikel[row.artikel_nr] = {
      sheet_id: row.id || "",
      artikel_nr: row.artikel_nr,
      art_nr: row.art_nr || row.artikel_nr,
      barcode: row.barcode || "",
      category: row.category || "",
      system: row.system || "",
      kategorie_de: row.category || "",
      name_de: row.name_de || "",
      masse_de: row.masse_de || "",
      hinweis_de: row.hinweis_de || "",
      beschreibung_de: row.hinweis_de || "",
      image_url: row.image_url || "",
      img_url: row.image_url || "",
      drive_folder_id: row.drive_folder_id || "",
    };
  });
  const farben = {};
  Object.keys(DEFAULT_DATA.farben).forEach((key) => {
    farben[key] = Object.assign({ code: String(key) }, DEFAULT_DATA.farben[key]);
  });
  const benutzer = {};
  Object.keys(DEFAULT_DATA.users).forEach((key) => {
    const row = DEFAULT_DATA.users[key];
    benutzer[row.pin] = Object.assign(
      { benutzername: row.nummer, rolle_de: row.benutzer_de },
      row,
    );
  });
  return {
    artikel,
    farben,
    auskunft: DEFAULT_DATA.auskunft.map((row, i) =>
      Object.assign({ sort: i + 1 }, row),
    ),
    benutzer,
  };
}

function loadCatalog() {
  const fromCsv = {
    artikel: parseArtikelCsv(loadCsv("artikel.csv")),
    farben: parseFarbenCsv(loadCsv("farben.csv")),
    auskunft: parseAuskunftCsv(loadCsv("auskunft.csv")),
    benutzer: parseBenutzerCsv(loadCsv("benutzer.csv")),
  };
  const fallback = seedFromDefault();
  return {
    artikel: Object.keys(fromCsv.artikel).length
      ? fromCsv.artikel
      : fallback.artikel,
    farben: Object.keys(fromCsv.farben).length ? fromCsv.farben : fallback.farben,
    auskunft: fromCsv.auskunft.length ? fromCsv.auskunft : fallback.auskunft,
    benutzer: Object.keys(fromCsv.benutzer).length
      ? fromCsv.benutzer
      : fallback.benutzer,
  };
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (err) {
    return { raw: text };
  }
}

async function auth() {
  const bodies = [
    { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  ];
  const paths = [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ];
  for (const p of paths) {
    for (const body of bodies) {
      const res = await fetch(BASE + p, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readJson(res);
      if (res.ok && json.token) return json.token;
    }
  }
  throw new Error(
    "Admin auth failed. Create a superuser first: ./pocketbase superuser upsert " +
      ADMIN_EMAIL +
      " <password>",
  );
}

function headers(token) {
  return {
    Authorization: token,
    "Content-Type": "application/json",
  };
}

function stripEmpty(obj) {
  const out = {};
  Object.keys(obj).forEach((key) => {
    const val = obj[key];
    if (val == null) return;
    if (typeof val === "string" && !val) return;
    out[key] = val;
  });
  return out;
}

async function importSchema(token) {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const collections = schema.collections || schema;
  const res = await fetch(BASE + "/api/collections/import", {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify({ collections, deleteMissing: false }),
  });
  if (!res.ok) {
    throw new Error(
      "collection import failed: " + JSON.stringify(await readJson(res)),
    );
  }
}

async function listAll(token, collection) {
  const items = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      BASE +
        "/api/collections/" +
        collection +
        "/records?page=" +
        page +
        "&perPage=500",
      { headers: headers(token) },
    );
    const json = await readJson(res);
    if (!res.ok) throw new Error("list " + collection + " failed");
    items.push.apply(items, json.items || []);
    if (page >= (json.totalPages || 1)) break;
    page += 1;
  }
  return items;
}

async function clearCollection(token, collection) {
  const items = await listAll(token, collection);
  for (const item of items) {
    const res = await fetch(
      BASE + "/api/collections/" + collection + "/records/" + item.id,
      { method: "DELETE", headers: { Authorization: token } },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error("delete " + collection + "/" + item.id + " failed");
    }
  }
}

async function createRecord(token, collection, payload) {
  const res = await fetch(BASE + "/api/collections/" + collection + "/records", {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(stripEmpty(payload)),
  });
  if (!res.ok) {
    throw new Error(
      "create " +
        collection +
        " failed: " +
        JSON.stringify(await readJson(res)),
    );
  }
}

async function seed(token, catalog) {
  await clearCollection(token, "artikel");
  await clearCollection(token, "farben");
  await clearCollection(token, "auskunft");
  await clearCollection(token, "benutzer");

  for (const key of Object.keys(catalog.artikel)) {
    await createRecord(token, "artikel", catalog.artikel[key]);
  }
  for (const key of Object.keys(catalog.farben)) {
    await createRecord(token, "farben", catalog.farben[key]);
  }
  for (const row of catalog.auskunft) {
    await createRecord(token, "auskunft", row);
  }
  for (const key of Object.keys(catalog.benutzer)) {
    await createRecord(token, "benutzer", catalog.benutzer[key]);
  }
}

function corsDrawingUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return "";
  try {
    const u = new URL(url);
    if (/googleusercontent\.com$/i.test(u.hostname)) return u.href;
    if (u.hostname === "drive.google.com") {
      let id = u.searchParams.get("id");
      if (!id) {
        const match = u.pathname.match(/\/(?:file|folders)\/d\/([^/]+)/i);
        if (match) id = match[1];
      }
      if (!id) return "";
      const size = u.searchParams.get("sz") || "w1600";
      return "https://lh3.googleusercontent.com/d/" + id + "=" + size;
    }
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (err) {}
  return "";
}

function fileExt(type, url) {
  const t = String(type || "").toLowerCase();
  if (t.indexOf("png") !== -1) return ".png";
  if (t.indexOf("webp") !== -1) return ".webp";
  if (t.indexOf("gif") !== -1) return ".gif";
  const pathName = String(url || "").split("?")[0];
  const m = pathName.match(/\.(png|jpe?g|webp|gif)$/i);
  if (m) return m[0].toLowerCase() === ".jpeg" ? ".jpg" : m[0].toLowerCase();
  return ".jpg";
}

async function downloadImage(url) {
  const target = corsDrawingUrl(url);
  if (!target) return null;
  const res = await fetch(target, { redirect: "follow" });
  const type = String(res.headers.get("content-type") || "").toLowerCase();
  if (!res.ok || type.indexOf("image/") !== 0) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return null;
  return { buf, type: type.split(";")[0] || "image/jpeg", url: target };
}

async function patchFile(token, collection, id, field, file, name) {
  const form = new FormData();
  form.append(field, new Blob([file.buf], { type: file.type }), name);
  const res = await fetch(
    BASE + "/api/collections/" + collection + "/records/" + id,
    {
      method: "PATCH",
      headers: { Authorization: token },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(
      "file " + collection + "/" + id + " " + field + " failed: " +
        JSON.stringify(await readJson(res)),
    );
  }
}

async function mapPool(items, limit, fn) {
  let i = 0;
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx]);
      }
    }),
  );
}

async function importRecordFiles(token, collection, record, jobs) {
  let ok = 0;
  let fail = 0;
  for (const job of jobs) {
    if (!job.url || !job.field) continue;
    try {
      const file = await downloadImage(job.url);
      if (!file) {
        fail++;
        continue;
      }
      const name = (job.name || "photo") + fileExt(file.type, file.url);
      await patchFile(token, collection, record.id, job.field, file, name);
      ok++;
      await new Promise((r) => setTimeout(r, 120));
    } catch (err) {
      fail++;
      console.warn("[media]", collection, record.id, job.field, err.message || err);
    }
  }
  return { ok, fail };
}

async function importMedia(token, catalog) {
  if (String(process.env.PB_IMPORT_MEDIA || "1") === "0") {
    console.log("skip media import (PB_IMPORT_MEDIA=0)");
    return;
  }
  const artikelRows = await listAll(token, "artikel");
  const farbenRows = await listAll(token, "farben");
  const jobs = [];

  artikelRows.forEach((row) => {
    const src =
      catalog.artikel[row.artikel_nr] ||
      catalog.artikel[row.art_nr] ||
      null;
    if (!src) return;
    const nr = String(row.artikel_nr || src.artikel_nr || "art");
    jobs.push({
      collection: "artikel",
      record: row,
      files: [
        { field: "bild_haupt", url: src.img_url || src.image_url, name: nr },
        { field: "bild_1", url: src.img_1, name: nr + "_1" },
        { field: "bild_2", url: src.img_2, name: nr + "_2" },
        { field: "bild_3", url: src.img_3, name: nr + "_3" },
        { field: "bild_4", url: src.img_4, name: nr + "_4" },
      ],
    });
  });

  farbenRows.forEach((row) => {
    const src = catalog.farben[row.code];
    if (!src) return;
    const code = String(row.code || "color");
    jobs.push({
      collection: "farben",
      record: row,
      files: [
        {
          field: "bild_dummyimage",
          url: src.image_url,
          name: code + "_dummy",
        },
        {
          field: "echtes_foto",
          url: src.echtes_foto_url,
          name: code,
        },
      ],
    });
  });

  let ok = 0;
  let fail = 0;
  await mapPool(jobs, 2, async (job) => {
    const result = await importRecordFiles(
      token,
      job.collection,
      job.record,
      job.files,
    );
    ok += result.ok;
    fail += result.fail;
  });
  console.log("media imported  ok=%s fail=%s", ok, fail);
}

async function main() {
  const token = await auth();
  await importSchema(token);
  const catalog = loadCatalog();
  await seed(token, catalog);
  await importMedia(token, catalog);
  console.log(
    "OK  artikel=%s farben=%s auskunft=%s benutzer=%s",
    Object.keys(catalog.artikel).length,
    Object.keys(catalog.farben).length,
    catalog.auskunft.length,
    Object.keys(catalog.benutzer).length,
  );
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
