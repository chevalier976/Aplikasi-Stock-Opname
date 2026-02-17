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
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4]).trim() === String(barcode).trim()) {
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
  const seen = {};
  const q = String(query).toLowerCase().trim();
  
  if (!q) return { success: true, locations: [] };
  
  for (let i = 1; i < data.length; i++) {
    const location = String(data[i][0]).trim();
    const locationLower = location.toLowerCase();
    
    if (locationLower.indexOf(q) !== -1 && !seen[location]) {
      seen[location] = true;
      
      // Count products in this location
      let productCount = 0;
      for (let j = 1; j < data.length; j++) {
        if (String(data[j][0]).trim() === location) productCount++;
      }
      
      results.push({
        locationCode: location,
        productCount: productCount
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
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === locationCode) {
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === locationCode && data[i][2] === sku) {
      sheet.deleteRow(i + 1);
      return { success: true, message: "Produk berhasil dihapus dari lokasi" };
    }
  }
  
  return { success: false, message: "Produk tidak ditemukan di lokasi tersebut" };
}

/**
 * Save stock opname data and sync Master Data
 */
function saveStockOpname(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
  
  // Generate shorter session ID
  const sessionId = generateShortId("SO-", 6);
  
  // Format timestamp: dd MMM yyyy HH:mm
  const timestamp = formatTimestamp(data.timestamp);
  
  // Get operator first name
  const operatorName = getOperatorName(data.operator);
  
  data.items.forEach(item => {
    const rowId = generateShortId("R-", 6);
    sheet.appendRow([
      sessionId,
      rowId,
      timestamp,
      operatorName,
      data.location,
      item.productName,
      item.sku,
      item.batch,
      item.qty,
      "No",  // edited
      ""     // editTimestamp
    ]);
  });
  
  // Sync Master Data after saving stock opname
  syncMasterData(data.location, data.items);
  
  return { success: true, message: "Stock opname berhasil disimpan" };
}

/**
 * Synchronize Master Data based on stock opname results
 * - Add new products (isNew: true)
 * - Remove products not in the items list (qty = 0 or deleted)
 */
function syncMasterData(locationCode, items) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  const data = sheet.getDataRange().getValues();
  
  // Create a map of items to save (sku -> item)
  const itemsMap = {};
  items.forEach(item => {
    itemsMap[item.sku] = item;
  });
  
  // Track rows to delete (from bottom to top to avoid index shifting)
  const rowsToDelete = [];
  
  // Check existing products in Master Data for this location
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === locationCode) {
      const sku = data[i][2];
      
      // If product is not in the items list, mark for deletion
      if (!itemsMap[sku]) {
        rowsToDelete.push(i + 1); // +1 because row index is 1-based
      } else {
        // Remove from map as it already exists in Master Data
        delete itemsMap[sku];
      }
    }
  }
  
  // Delete rows that are not in the items list
  rowsToDelete.forEach(rowIndex => {
    sheet.deleteRow(rowIndex);
  });
  
  // Add new products to Master Data
  Object.keys(itemsMap).forEach(sku => {
    const item = itemsMap[sku];
    if (item.isNew === true) {
      sheet.appendRow([
        locationCode,
        item.productName,
        item.sku,
        item.batch,
        item.barcode || ""  // barcode column E
      ]);
    }
  });
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
  const values = sheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === data.rowId) {
      // Update productName if provided
      if (data.productName !== undefined) {
        sheet.getRange(i + 1, 6).setValue(data.productName);  // col F
      }
      // Update sku if provided
      if (data.sku !== undefined) {
        sheet.getRange(i + 1, 7).setValue(data.sku);          // col G
      }
      // Update batch if provided
      if (data.batch !== undefined) {
        sheet.getRange(i + 1, 8).setValue(data.batch);        // col H
      }
      // Update qty
      sheet.getRange(i + 1, 9).setValue(data.newQty);         // col I
      sheet.getRange(i + 1, 10).setValue("Yes");              // edited
      sheet.getRange(i + 1, 11).setValue(formatTimestamp(data.editTimestamp)); // editTimestamp
      return { success: true, message: "Entry berhasil diupdate" };
    }
  }
  
  return { success: false, message: "Entry tidak ditemukan" };
}

/**
 * Delete a specific entry from Stock Opname Results by rowId
 * Also removes the corresponding product from Master Data
 */
function deleteEntry(rowId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
  const values = sheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === rowId) {
      // Get location and SKU before deleting
      const location = values[i][4];
      const sku = values[i][6];
      
      // Delete from Stock Opname Results
      sheet.deleteRow(i + 1);
      
      // Also delete from Master Data
      if (location && sku) {
        deleteProduct(location, sku);
      }
      
      return { success: true, message: "Entry dan Master Data berhasil dihapus" };
    }
  }
  
  return { success: false, message: "Entry tidak ditemukan" };
}
