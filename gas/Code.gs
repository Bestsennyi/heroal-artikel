/**
 * heroal Artikel — photo upload Web App & Sheet Tools
 *
 * Deploy: Deploy → New deployment / Manage deployments → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 */

// ==========================================
// KONFIGURATION (Ordner & Standard-Namen)
// ==========================================
const FOLDER_ARTIKEL_ID = "1Ma4nET-z2rIXKmGx4a_8Czsa5TSBXUq-";
const FOLDER_FARBEN_ID = "1DU3Xp0nmgeGeVGWn5uyePhSUjvqjkh7n";

const SHEET_ARTIKEL_NAME = "artikel";
const SHEET_FARBEN_NAME = "farben";
const SHEET_SUCHE_NAME = "suche";

// ==========================================
// 1. WEB APP API (doPost & doGet)
// ==========================================
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var body = raw ? JSON.parse(raw) : {};

    if (body.action !== "uploadPhoto") {
      return jsonOut_({ success: false, error: "unknown action" });
    }

    var target = String(body.target || "").toLowerCase().trim();
    var recordId = String(body.recordId || body.id || "").trim();
    var field = String(body.field || "").trim();
    var fileData = String(body.fileData || body.base64 || "");
    var mimeType = String(body.mimeType || "image/jpeg");

    // Имя файла по строгой конвенции heroal
    var fileName = String(body.fileName || "").trim();
    if (!fileName) {
      if (target === "artikel") {
        if (field === "bild_haupt" || field === "img_url") fileName = recordId + ".jpg";
        else {
          var slot = field.match(/^(?:bild|img)_([1-4])$/);
          fileName = slot ? recordId + "_" + slot[1] + ".jpg" : recordId + ".jpg";
        }
      } else {
        fileName = recordId + ".jpg";
      }
    }

    if (!recordId || !field || !fileData) {
      return jsonOut_({ success: false, error: "missing fields (recordId, field, fileData)" });
    }

    var comma = fileData.indexOf(",");
    var b64 = comma >= 0 ? fileData.slice(comma + 1) : fileData;
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);

    // Папка назначения
    var folderId = (target === "farben") ? FOLDER_FARBEN_ID : FOLDER_ARTIKEL_ID;
    var folder = DriveApp.getFolderById(folderId);

    // Удаление предыдущей версии файла (защита от дубликатов)
    var existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId = file.getId();
    var fileUrl = "https://lh3.googleusercontent.com/d/" + fileId + "=w1600";

    writeSheetCell_(target, recordId, field, fileUrl);
    return jsonOut_({ success: true, fileUrl: fileUrl, fileId: fileId, fileName: fileName });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut_({ ok: true, service: "heroal-photo-upload" });
}

// ==========================================
// 2. SHEET WRITER (DYNAMIC & CASE-INSENSITIVE)
// ==========================================
function writeSheetCell_(target, recordId, field, fileUrl) {
  var ss = openSpreadsheet_();
  var sheetNames = (target === "farben")
    ? ["farben", "Farben", "heroal-artikel - Farben"]
    : ["artikel", "Artikel", "heroal-artikel - Artikel"];

  var sheet = openSheetByNames_(ss, sheetNames);
  if (!sheet) throw new Error("sheet not found: " + sheetNames.join(" / "));

  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error("empty sheet");

  var headers = values[0].map(function (h) { return String(h || "").trim(); });
  var col = headerIndexAny_(headers, columnAliases_(target, field));
  if (col < 0) throw new Error("column not found: " + field);

  var keyNames = (target === "farben")
    ? ["code"]
    : ["artikel_nr", "artnr", "art_nr", "art-nr"];
  var keyCol = headerIndexAny_(headers, keyNames);
  if (keyCol < 0) throw new Error("key column not found");

  var rowIndex = -1;
  var needle = String(recordId).trim().toLowerCase();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][keyCol] || "").trim().toLowerCase() === needle) {
      rowIndex = r + 1;
      break;
    }
  }

  if (rowIndex < 0) throw new Error("row not found: " + recordId);
  sheet.getRange(rowIndex, col + 1).setValue(fileUrl);
}

function openSheetByNames_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (sheet) return sheet;
  }
  var want = {};
  for (var n = 0; n < names.length; n++) {
    want[String(names[n] || "").toLowerCase()] = true;
  }
  var all = ss.getSheets();
  for (var s = 0; s < all.length; s++) {
    var nm = String(all[s].getName() || "").toLowerCase();
    if (want[nm]) return all[s];
  }
  return null;
}

function columnAliases_(target, field) {
  var name = String(field || "").trim().toLowerCase();
  if (target === "farben") return [name];
  if (name === "bild_haupt" || name === "img_url" || name === "image_url") {
    return ["bild_haupt", "img_url", "image_url"];
  }
  var slot = name.match(/^(?:bild|img)_([1-4])$/);
  if (slot) return ["bild_" + slot[1], "img_" + slot[1]];
  return [name];
}

function headerIndexAny_(headers, names) {
  for (var n = 0; n < names.length; n++) {
    var idx = headerIndex_(headers, names[n]);
    if (idx >= 0) return idx;
  }
  return -1;
}

function headerIndex_(headers, name) {
  var want = String(name || "").trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").trim().toLowerCase() === want) return i;
  }
  return -1;
}

function openSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 3. WERKZEUGE & MENÜ (Drive Sync & Dummy-Images)
// ==========================================
function syncImagesFromDrive() {
  var ss = openSpreadsheet_();
  var sheet = openSheetByNames_(ss, ["artikel", "Artikel"]);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var artnrCol = headerIndexAny_(headers, ["artikel_nr", "artnr", "art_nr"]) + 1;
  var bildCol = headerIndexAny_(headers, ["bild_haupt", "img_url"]) + 1;

  if (artnrCol === 0 || bildCol === 0) return;

  var folder = DriveApp.getFolderById(FOLDER_ARTIKEL_ID);
  var files = folder.getFiles();
  var map = {};

  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName().replace(/\.[^/.]+$/, "").trim();
    var p = name.split("_");
    var nr = p[0].toLowerCase();
    var slot = p[1] || "main";
    var url = "https://lh3.googleusercontent.com/d/" + f.getId() + "=w1600";

    if (!map[nr]) map[nr] = {};
    if (slot === "main") map[nr].main = url;
    else map[nr]["slot" + slot] = url;
  }

  var nrValues = sheet.getRange(2, artnrCol, lastRow - 1, 1).getValues();
  var rows = [];

  for (var i = 0; i < nrValues.length; i++) {
    var key = String(nrValues[i][0]).trim().toLowerCase();
    var item = map[key] || {};
    rows.push([item.main || "", item.slot1 || "", item.slot2 || "", item.slot3 || "", item.slot4 || ""]);
  }

  sheet.getRange(2, bildCol, rows.length, 5).setValues(rows);
  SpreadsheetApp.getUi().alert("✅ Artikel-Bilder synchronisiert!");
}

function updateFarbenFormulas() {
  var ss = openSpreadsheet_();
  var sheet = openSheetByNames_(ss, ["farben", "Farben"]);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var dummyCol = headerIndex_(headers, "bild_dummyimage") + 1;
  var hexColLetter = "C";

  var formulas = [];
  for (var r = 2; r <= lastRow; r++) {
    formulas.push([`=IF(${hexColLetter}${r}=""; ""; IMAGE("https://dummyimage.com/150x150/" & SUBSTITUTE(${hexColLetter}${r}; "#"; "") & "/" & SUBSTITUTE(${hexColLetter}${r}; "#"; "") & ".png"; 2))`]);
  }

  sheet.getRange(2, dummyCol, formulas.length, 1).setFormulas(formulas);
  SpreadsheetApp.getUi().alert("✅ Dummy-Bilder aktualisiert!");
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("⚙️ heroal Skripte")
    .addItem("🔄 1. Artikel-Bilder synchronisieren (Drive ➔ Tabelle)", "syncImagesFromDrive")
    .addItem("🎨 2. Dummy-Bilder erneuern (Farben)", "updateFarbenFormulas")
    .addToUi();
}