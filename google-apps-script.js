// Google Apps Script for Stock Opname Backend
// Deploy this as a Web App with "Anyone" access

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
 * Get all products for a specific location
 */
function getProducts(locationCode) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  const data = sheet.getDataRange().getValues();
  const products = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === locationCode) {
      products.push({
        productName: data[i][1],
        sku: data[i][2],
        batch: data[i][3]
      });
    }
  }
  
  if (products.length === 0) {
    return { success: false, message: "Lokasi tidak ditemukan" };
  }
  
  return { success: true, products: products };
}

/**
 * Save stock opname data
 */
function saveStockOpname(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("StockOpname");
  
  data.items.forEach(item => {
    const rowId = Utilities.getUuid();
    sheet.appendRow([
      data.sessionId,
      rowId,
      data.timestamp,
      data.operator,
      data.location,
      item.productName,
      item.sku,
      item.batch,
      item.qty,
      "No",  // edited
      ""     // editTimestamp
    ]);
  });
  
  return { success: true, message: "Stock opname berhasil disimpan" };
}

/**
 * Get stock opname history for a specific operator with optional filter
 */
function getHistory(operator, filter) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("StockOpname");
  const data = sheet.getDataRange().getValues();
  const history = [];
  
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === operator) {
      const timestamp = new Date(data[i][2]);
      
      // Apply filter
      if (filter === "today") {
        if (timestamp.toDateString() !== now.toDateString()) continue;
      } else if (filter === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (timestamp < weekAgo) continue;
      } else if (filter === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (timestamp < monthAgo) continue;
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
 * Update a specific entry's quantity
 */
function updateEntry(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("StockOpname");
  const values = sheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === data.rowId) {
      sheet.getRange(i + 1, 9).setValue(data.newQty);         // qty
      sheet.getRange(i + 1, 10).setValue("Yes");              // edited
      sheet.getRange(i + 1, 11).setValue(data.editTimestamp); // editTimestamp
      return { success: true, message: "Entry berhasil diupdate" };
    }
  }
  
  return { success: false, message: "Entry tidak ditemukan" };
}
