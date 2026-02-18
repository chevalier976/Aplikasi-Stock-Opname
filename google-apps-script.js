// Google Apps Script for Stock Opname Backend
// Deploy this as a Web App with "Anyone" access

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function generateShortId(prefix, length) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var result = prefix;
  for (var i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatTimestamp(isoString) {
  var date = new Date(isoString);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd MMM yyyy HH:mm");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLocation(value) {
  return normalizeText(value).toUpperCase();
}

function getOperatorName(email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      return String(data[i][1]).trim().split(" ")[0];
    }
  }
  return email;
}

// ──────────────────────────────────────────────────────────────
// LOCKING — reduced timeout, fail fast for concurrent users
// ──────────────────────────────────────────────────────────────

function withScriptLock(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, message: "Server sibuk, coba lagi dalam beberapa detik" };
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

// ──────────────────────────────────────────────────────────────
// CACHE LAYER
// ──────────────────────────────────────────────────────────────

var CACHE_TTL = 30;

function cacheVersion() {
  return PropertiesService.getScriptProperties().getProperty("CV") || "1";
}

function bumpCacheVersion() {
  PropertiesService.getScriptProperties().setProperty("CV", String(Date.now()));
}

function cacheKey(prefix, q) {
  return prefix + ":" + cacheVersion() + ":" + Utilities.base64EncodeWebSafe(String(q || "")).slice(0, 100);
}

function cacheGet(key) {
  var raw = CacheService.getScriptCache().get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function cachePut(key, obj, ttl) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(obj), ttl || CACHE_TTL);
  } catch (e) { /* non-critical */ }
}

// ──────────────────────────────────────────────────────────────
// MASTER DATA — single read helper
// ──────────────────────────────────────────────────────────────

function readMasterData() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data").getDataRange().getValues();
}

// ──────────────────────────────────────────────────────────────
// ROUTER
// ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result;

    switch (action) {
      case "login":           result = login(data.email, data.password); break;
      case "getProducts":     result = getProducts(data.locationCode); break;
      case "saveStockOpname": result = saveStockOpname(data); break;
      case "getHistory":      result = getHistory(data.operator, data.filter); break;
      case "updateEntry":     result = updateEntry(data); break;
      case "deleteProduct":   result = deleteProduct(data.locationCode, data.sku); break;
      case "deleteEntry":     result = deleteEntry(data.rowId); break;
      case "lookupBarcode":   result = lookupBarcode(data.barcode); break;
      case "searchProducts":  result = searchProducts(data.query); break;
      case "searchLocations": result = searchLocations(data.query); break;
      case "warmupCache":     result = warmupCache(data); break;
      default:                result = { success: false, message: "Unknown action" };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ──────────────────────────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────────────────────────

function login(email, password) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email && data[i][2] === password) {
      return { success: true, user: { email: data[i][0], name: data[i][1], role: data[i][3] } };
    }
  }
  return { success: false, message: "Email atau password salah" };
}

// ──────────────────────────────────────────────────────────────
// READ — no lock needed, cached where beneficial
// ──────────────────────────────────────────────────────────────

function lookupBarcode(barcode) {
  var data = readMasterData();
  var target = normalizeText(barcode);
  for (var i = 1; i < data.length; i++) {
    if (normalizeText(data[i][4]) === target) {
      return { success: true, product: { productName: data[i][1], sku: data[i][2], batch: data[i][3], barcode: data[i][4] } };
    }
  }
  return { success: false, message: "Produk tidak ditemukan untuk barcode: " + barcode };
}

function getProducts(locationCode) {
  var ck = cacheKey("gp", locationCode);
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = readMasterData();
  var products = [];
  var target = normalizeLocation(locationCode);
  for (var i = 1; i < data.length; i++) {
    if (normalizeLocation(data[i][0]) === target) {
      products.push({ productName: data[i][1], sku: data[i][2], batch: data[i][3], barcode: data[i][4] || "" });
    }
  }
  var resp = products.length > 0
    ? { success: true, products: products }
    : { success: false, message: "Lokasi tidak ditemukan" };
  if (products.length > 0) cachePut(ck, resp, CACHE_TTL);
  return resp;
}

function searchProducts(query, preloadedData) {
  var q = normalizeText(query).toLowerCase();
  if (!q) return { success: true, products: [] };

  var ck = cacheKey("sp", q);
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = preloadedData || readMasterData();
  var results = [];
  var seen = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][1]).toLowerCase();
    var sku = String(data[i][2]);
    if (name.indexOf(q) !== -1 && !seen[sku]) {
      seen[sku] = true;
      results.push({ productName: data[i][1], sku: data[i][2], batch: data[i][3], barcode: data[i][4] || "" });
      if (results.length >= 10) break;
    }
  }
  var resp = { success: true, products: results };
  cachePut(ck, resp, CACHE_TTL);
  return resp;
}

function searchLocations(query, preloadedData) {
  var q = normalizeText(query).toLowerCase();
  if (!q) return { success: true, locations: [] };

  var ck = cacheKey("sl", q);
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = preloadedData || readMasterData();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var loc = String(data[i][0]).trim();
    if (loc) map[loc] = (map[loc] || 0) + 1;
  }
  var results = [];
  var keys = Object.keys(map).sort();
  for (var j = 0; j < keys.length; j++) {
    if (keys[j].toLowerCase().indexOf(q) !== -1) {
      results.push({ locationCode: keys[j], productCount: map[keys[j]] });
      if (results.length >= 15) break;
    }
  }
  var resp = { success: true, locations: results };
  cachePut(ck, resp, CACHE_TTL);
  return resp;
}

function getHistory(operator, filter) {
  var ck = cacheKey("gh", operator + "|" + (filter || "all"));
  var cached = cacheGet(ck);
  if (cached) return cached;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
  var data = sheet.getDataRange().getValues();
  var history = [];
  var operatorName = getOperatorName(operator);
  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (data[i][3] !== operatorName) continue;
    var ts = new Date(data[i][2]);
    var valid = !isNaN(ts.getTime());
    if (valid) {
      if (filter === "today" && ts.toDateString() !== now.toDateString()) continue;
      if (filter === "week" && ts < new Date(now.getTime() - 7 * 86400000)) continue;
      if (filter === "month" && ts < new Date(now.getTime() - 30 * 86400000)) continue;
    }
    history.push({
      sessionId: data[i][0], rowId: data[i][1], timestamp: data[i][2],
      operator: data[i][3], location: data[i][4], productName: data[i][5],
      sku: data[i][6], batch: data[i][7], qty: data[i][8],
      edited: data[i][9], editTimestamp: data[i][10], formula: data[i][11] || ""
    });
  }
  var resp = { success: true, history: history };
  cachePut(ck, resp, 10);
  return resp;
}

// ──────────────────────────────────────────────────────────────
// WARMUP — reads Master Data ONCE, passes to search helpers
// ──────────────────────────────────────────────────────────────

function warmupCache(payload) {
  try {
    payload = payload || {};
    var seedLoc = normalizeText(payload.locationQuery || "").toLowerCase();
    var seedProd = normalizeText(payload.productQuery || "").toLowerCase();

    var data = readMasterData();

    var qLoc = [], qProd = [];

    if (seedLoc) {
      for (var a = 1; a <= Math.min(3, seedLoc.length); a++) qLoc.push(seedLoc.slice(0, a));
    }
    if (seedProd) {
      for (var b = 1; b <= Math.min(3, seedProd.length); b++) qProd.push(seedProd.slice(0, b));
    }

    if (qLoc.length === 0 || qProd.length === 0) {
      var seenL = {}, seenP = {};
      for (var c = 1; c < data.length && (qLoc.length < 4 || qProd.length < 4); c++) {
        var l = normalizeText(data[c][0]).toLowerCase();
        if (l && !seenL[l] && qLoc.length < 4) { seenL[l] = 1; qLoc.push(l.slice(0, 2)); }
        var p = normalizeText(data[c][1]).toLowerCase();
        if (p && !seenP[p] && qProd.length < 4) { seenP[p] = 1; qProd.push(p.slice(0, 2)); }
      }
    }

    var uL = {}, uP = {};
    for (var d = 0; d < qLoc.length; d++) {
      var ql = qLoc[d]; if (!ql || uL[ql]) continue; uL[ql] = 1;
      searchLocations(ql, data);
    }
    for (var f = 0; f < qProd.length; f++) {
      var qp = qProd[f]; if (!qp || uP[qp]) continue; uP[qp] = 1;
      searchProducts(qp, data);
    }

    return { success: true, warmed: { locations: Object.keys(uL).length, products: Object.keys(uP).length } };
  } catch (error) {
    return { success: false, message: "Warmup gagal: " + error };
  }
}

// ──────────────────────────────────────────────────────────────
// WRITE — uses lock, minimal hold time
// ──────────────────────────────────────────────────────────────

function deleteProduct(locationCode, sku) {
  return withScriptLock(function() { return deleteProductInternal(locationCode, sku); });
}

function deleteProductInternal(locationCode, sku) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  var data = sheet.getDataRange().getValues();
  var tLoc = normalizeLocation(locationCode);
  var tSku = normalizeText(sku);

  var count = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (normalizeLocation(data[i][0]) === tLoc && normalizeText(data[i][2]) === tSku) {
      sheet.deleteRow(i + 1);
      count++;
    }
  }
  if (count === 0) return { success: false, message: "Produk tidak ditemukan di lokasi tersebut" };
  bumpCacheVersion();
  return { success: true, message: "Produk berhasil dihapus dari lokasi" };
}

function saveStockOpname(data) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return { success: false, message: "Tidak ada item untuk disimpan" };
    }

    var sessionId = generateShortId("SO-", 6);
    var timestamp = formatTimestamp(data.timestamp);
    var operatorName = getOperatorName(data.operator);
    var loc = normalizeLocation(data.location);

    var rows = data.items.map(function(item) {
      return [sessionId, generateShortId("R-", 6), timestamp, operatorName, loc,
              item.productName, item.sku, item.batch, item.qty, "No", "", item.formula || ""];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 12).setValues(rows);
    syncMasterDataInternal(loc, data.items);
    bumpCacheVersion();
    return { success: true, message: "Stock opname berhasil disimpan" };
  });
}

function syncMasterData(locationCode, items) {
  return withScriptLock(function() { return syncMasterDataInternal(locationCode, items); });
}

function syncMasterDataInternal(locationCode, items) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  var data = sheet.getDataRange().getValues();
  var loc = normalizeLocation(locationCode);

  var existing = {};
  for (var i = 1; i < data.length; i++) {
    if (normalizeLocation(data[i][0]) === loc) existing[normalizeText(data[i][2])] = true;
  }

  var newRows = [];
  var seen = {};
  (items || []).forEach(function(item) {
    var sku = normalizeText(item.sku);
    if (!sku || existing[sku] || seen[sku]) return;
    seen[sku] = true;
    newRows.push([loc, item.productName || "", sku, item.batch || "", item.barcode || ""]);
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
    bumpCacheVersion();
  }
}

function updateEntry(data) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    var values = sheet.getDataRange().getValues();

    for (var i = 1; i < values.length; i++) {
      if (values[i][1] === data.rowId) {
        var row = values[i].slice();
        if (data.productName !== undefined) row[5] = data.productName;
        if (data.sku !== undefined) row[6] = data.sku;
        if (data.batch !== undefined) row[7] = data.batch;
        row[8] = data.newQty;
        row[9] = "Yes";
        row[10] = formatTimestamp(data.editTimestamp);
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        bumpCacheVersion();
        return { success: true, message: "Entry berhasil diupdate" };
      }
    }
    return { success: false, message: "Entry tidak ditemukan" };
  });
}

function deleteEntry(rowId) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    var values = sheet.getDataRange().getValues();

    for (var i = 1; i < values.length; i++) {
      if (values[i][1] === rowId) {
        var location = values[i][4];
        var sku = values[i][6];
        sheet.deleteRow(i + 1);
        if (location && sku) deleteProductInternal(location, sku);
        bumpCacheVersion();
        return { success: true, message: "Entry dan Master Data berhasil dihapus" };
      }
    }
    return { success: false, message: "Entry tidak ditemukan" };
  });
}
