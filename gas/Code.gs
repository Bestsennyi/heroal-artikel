/**
 * heroal Artikel — photo upload Web App
 *
 * Deploy: Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Script properties (Project Settings → Script properties):
 *   DRIVE_FOLDER_ID  — Google Drive folder that receives photos
 *   SPREADSHEET_ID   — optional; defaults to the bound spreadsheet
 *
 * Sheet names / headers expected:
 *   "heroal-artikel - Artikel"  key column artnr or art_nr
 *     columns: img_url, img_1, img_2, img_3, img_4
 *   "heroal-artikel - Farben"   key column code
 *     column: echtes_foto
 *
 * Drive filenames (stable, overwritten on replace):
 *   Artikel img_url → {artnr}.jpg
 *   Artikel img_1–img_4 → {artnr}_1.jpg … {artnr}_4.jpg
 *   Farben echtes_foto → {code}.jpg
 *
 * The PWA POSTs text/plain JSON (avoids a CORS preflight):
 *   { action, target, recordId, field, fileName, fileData, mimeType }
 */
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var body = raw ? JSON.parse(raw) : {};
    if (body.action !== "uploadPhoto") {
      return jsonOut_({ success: false, error: "unknown action" });
    }
    var target = String(body.target || "");
    var recordId = String(body.recordId || "").trim();
    var field = String(body.field || "").trim();
    var fileName = String(body.fileName || "photo.jpg").trim();
    var fileData = String(body.fileData || "");
    var mimeType = String(body.mimeType || "image/jpeg");
    if (!recordId || !field || !fileData) {
      return jsonOut_({ success: false, error: "missing fields" });
    }

    var comma = fileData.indexOf(",");
    var b64 = comma >= 0 ? fileData.slice(comma + 1) : fileData;
    var blob = Utilities.newBlob(
      Utilities.base64Decode(b64),
      mimeType,
      fileName,
    );

    var folderId = PropertiesService.getScriptProperties().getProperty(
      "DRIVE_FOLDER_ID",
    );
    var folder = folderId
      ? DriveApp.getFolderById(folderId)
      : DriveApp.getRootFolder();
    var existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId = file.getId();
    var fileUrl = "https://lh3.googleusercontent.com/d/" + fileId + "=w1600";

    writeSheetCell_(target, recordId, field, fileUrl);
    return jsonOut_({ success: true, fileUrl: fileUrl, fileId: fileId });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut_({ ok: true, service: "heroal-photo-upload" });
}

function writeSheetCell_(target, recordId, field, fileUrl) {
  var ss = openSpreadsheet_();
  var sheetName =
    target === "farben" ? "heroal-artikel - Farben" : "heroal-artikel - Artikel";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("sheet not found: " + sheetName);

  var values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error("empty sheet");
  var headers = values[0].map(function (h) {
    return String(h || "").trim();
  });
  var col = headerIndex_(headers, field);
  if (col < 0) throw new Error("column not found: " + field);

  var keyNames =
    target === "farben" ? ["code"] : ["artnr", "art_nr", "art-nr"];
  var keyCol = -1;
  for (var k = 0; k < keyNames.length; k++) {
    keyCol = headerIndex_(headers, keyNames[k]);
    if (keyCol >= 0) break;
  }
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
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
