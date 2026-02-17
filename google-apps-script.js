// Google Apps Script for Stock Opname Backend
// Deploy this as a Web App with "Anyone" access

/**
 * Generate short random ID with prefix
 * e.g. generateShortId("SO-", 6) => "SO-A3K9X2"
 */
function generateShortId(prefix, length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = prefix;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Format date to "dd MMM yyyy HH:mm"
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd MMM yyyy HH:mm");
}

/**
 * Get operator first name from email
 */
function getOperatorName(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      const fullName = String(data[i][1]).trim();
      return fullName.split(" ")[0]; // First name only
    }
  }
  return email; // fallback if not found
}

/**
 * Normalize text for safer comparison
 */
function normalizeText(value) {
  return String(value || "").trim();
}

/**
 * Normalize location code for consistent matching
 */
function normalizeLocation(value) {
  return normalizeText(value).toUpperCase();
}

/**
 * Execute a write operation with script lock to avoid race conditions
 */
function withScriptLock(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Main entry point for POST requests
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    switch (action) {
      case "login":
        return ContentService.createTextOutput(JSON.stringify(login(data.email, data.password)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "getProducts":
        return ContentService.createTextOutput(JSON.stringify(getProducts(data.locationCode)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "saveStockOpname":
        return ContentService.createTextOutput(JSON.stringify(saveStockOpname(data)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "getHistory":
        return ContentService.createTextOutput(JSON.stringify(getHistory(data.operator, data.filter)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "updateEntry":
        return ContentService.createTextOutput(JSON.stringify(updateEntry(data)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "deleteProduct":
        return ContentService.createTextOutput(JSON.stringify(deleteProduct(data.locationCode, data.sku)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "deleteEntry":
        return ContentService.createTextOutput(JSON.stringify(deleteEntry(data.rowId)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "lookupBarcode":
        return ContentService.createTextOutput(JSON.stringify(lookupBarcode(data.barcode)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "searchProducts":
        return ContentService.createTextOutput(JSON.stringify(searchProducts(data.query)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case "searchLocations":
        return ContentService.createTextOutput(JSON.stringify(searchLocations(data.query)))
          .setMimeType(ContentService.MimeType.JSON);
      
      default:
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Unknown action" }))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Authenticate user with email and password
 */
function login(email, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email && data[i][2] === password) {
      return {
        success: true,
        user: {
          email: data[i][0],
          name: data[i][1],
          role: data[i][3]
        }
      };
    }
  }
  
  return { success: false, message: "Email atau password salah" };
}

/**
 * Lookup product by barcode from Master Data
 * Master Data columns: A=location, B=productName, C=sku, D=batch, E=barcode
 */
function lookupBarcode(barcode) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  const targetBarcode = normalizeText(barcode);
  
  for (let i = 1; i < data.length; i++) {
    if (normalizeText(data[i][4]) === targetBarcode) {
      return {
        success: true,
        product: {
          productName: data[i][1],
          sku: data[i][2],
          batch: data[i][3],
          barcode: data[i][4]
        }
      };
    }
  }
  
  return { success: false, message: "Produk tidak ditemukan untuk barcode: " + barcode };
}

/**
 * Search products by name across all locations in Master Data
 * Returns unique products matching the query (max 10)
 */
function searchProducts(query) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  const results = [];
  const seen = {}; // deduplicate by SKU
  const q = String(query).toLowerCase().trim();
  
  if (!q) return { success: true, products: [] };
  
  for (let i = 1; i < data.length; i++) {
    const productName = String(data[i][1]).toLowerCase();
    const sku = String(data[i][2]);
    
    if (productName.indexOf(q) !== -1 && !seen[sku]) {
      seen[sku] = true;
      results.push({
        productName: data[i][1],
        sku: data[i][2],
        batch: data[i][3],
        barcode: data[i][4] || ""
      });
      if (results.length >= 10) break;
    }
  }
  
  return { success: true, products: results };
}

/**
 * Search locations by partial match from Master Data
 * Returns unique locations matching the query (max 15)
 */
function searchLocations(query) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  const results = [];
  const q = String(query).toLowerCase().trim();
  
  if (!q) return { success: true, locations: [] };

  // Build location -> productCount map in one pass (O(n))
  const locationCountMap = {};
  for (let i = 1; i < data.length; i++) {
    const location = String(data[i][0]).trim();
    if (!location) continue;
    locationCountMap[location] = (locationCountMap[location] || 0) + 1;
  }

  const locations = Object.keys(locationCountMap).sort();
  
  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    const locationLower = location.toLowerCase();
    
    if (locationLower.indexOf(q) !== -1) {
      results.push({
        locationCode: location,
        productCount: locationCountMap[location]
      });
      if (results.length >= 15) break;
    }
  }
  
  return { success: true, locations: results };
}

/**
 * Get all products for a specific location
 * Master Data columns: A=location, B=productName, C=sku, D=batch, E=barcode
 */
function getProducts(locationCode) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  const products = [];
  const targetLocation = normalizeLocation(locationCode);
  
  for (let i = 1; i < data.length; i++) {
    if (normalizeLocation(data[i][0]) === targetLocation) {
      products.push({
        productName: data[i][1],
        sku: data[i][2],
        batch: data[i][3],
        barcode: data[i][4] || ""
      });
    }
  }
  
  if (products.length === 0) {
    return { success: false, message: "Lokasi tidak ditemukan" };
  }
  
  return { success: true, products: products };
}

/**
 * Delete a product from Master Data by location and SKU
 */
function deleteProduct(locationCode, sku) {
  return withScriptLock(() => deleteProductInternal(locationCode, sku));
}

/**
 * Internal delete product (no lock). Use via deleteProduct or from already-locked flow.
 */
function deleteProductInternal(locationCode, sku) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  const targetLocation = normalizeLocation(locationCode);
  const targetSku = normalizeText(sku);

  const header = data[0] || ["location", "productName", "sku", "batch", "barcode"];
  const keptRows = [];
  let deleted = false;

  for (let i = 1; i < data.length; i++) {
    const rowLocation = normalizeLocation(data[i][0]);
    const rowSku = normalizeText(data[i][2]);
    if (rowLocation === targetLocation && rowSku === targetSku) {
      deleted = true;
      continue;
    }
    keptRows.push([data[i][0], data[i][1], data[i][2], data[i][3], data[i][4] || ""]);
  }

  if (!deleted) {
    return { success: false, message: "Produk tidak ditemukan di lokasi tersebut" };
  }

  const totalRows = sheet.getLastRow();
  if (totalRows > 1) {
    sheet.getRange(2, 1, totalRows - 1, 5).clearContent();
  }

  if (keptRows.length > 0) {
    sheet.getRange(2, 1, keptRows.length, 5).setValues(keptRows);
  }

  // Ensure header is always present
  sheet.getRange(1, 1, 1, 5).setValues([header.slice(0, 5)]);
  return { success: true, message: "Produk berhasil dihapus dari lokasi" };
}

/**
 * Save stock opname data and sync Master Data
 */
function saveStockOpname(data) {
  return withScriptLock(() => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return { success: false, message: "Tidak ada item untuk disimpan" };
    }

    // Generate shorter session ID
    const sessionId = generateShortId("SO-", 6);

    // Format timestamp: dd MMM yyyy HH:mm
    const timestamp = formatTimestamp(data.timestamp);

    // Get operator first name
    const operatorName = getOperatorName(data.operator);

    // Batch build rows for faster writes
    const rows = data.items.map(item => [
      sessionId,
      generateShortId("R-", 6),
      timestamp,
      operatorName,
      normalizeLocation(data.location),
      item.productName,
      item.sku,
      item.batch,
      item.qty,
      "No",  // edited
      ""     // editTimestamp
    ]);

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, 11).setValues(rows);

    // Sync Master Data after saving stock opname
    syncMasterDataInternal(normalizeLocation(data.location), data.items);

    return { success: true, message: "Stock opname berhasil disimpan" };
  });
}

/**
 * Synchronize Master Data based on stock opname results
 * - Add new products (isNew: true)
 * - Remove products not in the items list (qty = 0 or deleted)
 */
function syncMasterData(locationCode, items) {
  return withScriptLock(() => syncMasterDataInternal(locationCode, items));
}

/**
 * Internal sync Master Data (no lock). Use via syncMasterData or from already-locked flow.
 */
function syncMasterDataInternal(locationCode, items) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  const normalizedLocation = normalizeLocation(locationCode);

  // Keep only rows from other locations
  const keptRows = [];
  for (let i = 1; i < data.length; i++) {
    const rowLocation = normalizeLocation(data[i][0]);
    if (rowLocation !== normalizedLocation) {
      keptRows.push([data[i][0], data[i][1], data[i][2], data[i][3], data[i][4] || ""]);
    }
  }

  // Build current location rows from latest opname items
  const itemMapBySku = {};
  (items || []).forEach(item => {
    const sku = normalizeText(item.sku);
    if (!sku) return;
    itemMapBySku[sku] = item;
  });

  const locationRows = Object.keys(itemMapBySku).map(sku => {
    const item = itemMapBySku[sku];
    return [
      normalizedLocation,
      item.productName || "",
      sku,
      item.batch || "",
      item.barcode || ""
    ];
  });

  const allRows = keptRows.concat(locationRows);
  const header = data[0] || ["location", "productName", "sku", "batch", "barcode"];

  // Clear previous data rows, then write fresh rows in batch
  const totalRows = sheet.getLastRow();
  if (totalRows > 1) {
    sheet.getRange(2, 1, totalRows - 1, 5).clearContent();
  }

  // Ensure header remains
  sheet.getRange(1, 1, 1, 5).setValues([header.slice(0, 5)]);

  if (allRows.length > 0) {
    sheet.getRange(2, 1, allRows.length, 5).setValues(allRows);
  }
}

/**
 * Get stock opname history for a specific operator with optional filter
 */
function getHistory(operator, filter) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
  const data = sheet.getDataRange().getValues();
  const history = [];
  
  // Resolve email to first name for matching
  const operatorName = getOperatorName(operator);
  
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === operatorName) {
      const timestamp = new Date(data[i][2]);
      
      // Apply filter (skip if timestamp is invalid)
      if (isNaN(timestamp.getTime())) {
        // If date can't be parsed, include it anyway
      } else {
        if (filter === "today") {
          if (timestamp.toDateString() !== now.toDateString()) continue;
        } else if (filter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (timestamp < weekAgo) continue;
        } else if (filter === "month") {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (timestamp < monthAgo) continue;
        }
      }
      
      history.push({
        sessionId: data[i][0],
        rowId: data[i][1],
        timestamp: data[i][2],
        operator: data[i][3],
        location: data[i][4],
        productName: data[i][5],
        sku: data[i][6],
        batch: data[i][7],
        qty: data[i][8],
        edited: data[i][9],
        editTimestamp: data[i][10]
      });
    }
  }
  
  return { success: true, history: history };
}

/**
 * Update a specific entry (qty, productName, sku, batch)
 */
function updateEntry(data) {
  return withScriptLock(() => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][1] === data.rowId) {
        const row = values[i].slice();

        // Update productName if provided (col F index 5)
        if (data.productName !== undefined) row[5] = data.productName;
        // Update sku if provided (col G index 6)
        if (data.sku !== undefined) row[6] = data.sku;
        // Update batch if provided (col H index 7)
        if (data.batch !== undefined) row[7] = data.batch;

        // Update qty, edited, and edit timestamp
        row[8] = data.newQty;
        row[9] = "Yes";
        row[10] = formatTimestamp(data.editTimestamp);

        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return { success: true, message: "Entry berhasil diupdate" };
      }
    }

    return { success: false, message: "Entry tidak ditemukan" };
  });
}

/**
 * Delete a specific entry from Stock Opname Results by rowId
 * Also removes the corresponding product from Master Data
 */
function deleteEntry(rowId) {
  return withScriptLock(() => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][1] === rowId) {
        // Get location and SKU before deleting
        const location = values[i][4];
        const sku = values[i][6];

        // Delete from Stock Opname Results
        sheet.deleteRow(i + 1);

        // Also delete from Master Data (internal no-lock because already locked)
        if (location && sku) {
          deleteProductInternal(location, sku);
        }

        return { success: true, message: "Entry dan Master Data berhasil dihapus" };
      }
    }

    return { success: false, message: "Entry tidak ditemukan" };
  });
}
