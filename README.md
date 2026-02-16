# Aplikasi Stock Opname (Inventory Count)

Aplikasi Stock Opname lengkap menggunakan Next.js 14 (App Router), TypeScript, Tailwind CSS, dan Google Apps Script sebagai backend. Aplikasi ini mobile-friendly dan terhubung dengan Google Sheets.

## 🚀 Fitur

- ✅ **Autentikasi** - Login dengan email dan password
- 📱 **Mobile-Friendly** - Responsif dan optimized untuk mobile
- 📷 **Barcode Scanner** - Scan barcode lokasi menggunakan kamera
- 📝 **Input Manual** - Input kode lokasi secara manual
- 📦 **Input Quantity** - Input quantity untuk setiap produk di lokasi
- 📋 **Riwayat** - Lihat dan edit riwayat stock opname
- 🎨 **UI Modern** - Design dengan Tailwind CSS dan color scheme yang konsisten

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **UI Library**: react-hot-toast untuk notifikasi
- **Barcode**: react-qr-barcode-scanner
- **Backend**: Google Apps Script + Google Sheets
- **Font**: Inter (Google Fonts)

## 📁 Struktur Folder

```
src/
├── app/
│   ├── layout.tsx          # Root layout (Inter font, Tailwind, Toast, AuthProvider)
│   ├── globals.css         # Tailwind + custom theme CSS variables
│   ├── page.tsx            # Root page - redirect ke /login atau /scan
│   ├── login/
│   │   └── page.tsx        # Halaman login
│   ├── scan/
│   │   └── page.tsx        # Halaman scan lokasi (barcode + manual input)
│   ├── input/
│   │   └── page.tsx        # Halaman input quantity per produk
│   └── history/
│       └── page.tsx        # Halaman riwayat stock opname
├── components/
│   ├── AuthProvider.tsx    # Context provider untuk autentikasi
│   ├── BottomNav.tsx       # Bottom navigation
│   ├── BarcodeScanner.tsx  # Scanner barcode
│   ├── ProductCard.tsx     # Kartu produk dengan input quantity
│   ├── EditModal.tsx       # Modal edit quantity di halaman history
│   └── LoadingSpinner.tsx  # Spinner loading component
└── lib/
    ├── api.ts              # Fungsi-fungsi API ke Google Apps Script
    ├── auth.ts             # Fungsi helper login/logout
    └── types.ts            # TypeScript type definitions
```

## 🔧 Setup dan Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/chevalier976/Aplikasi-Stock-Opname.git
cd Aplikasi-Stock-Opname
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables

Buat file `.env.local` dari template `.env.local.example`:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` dan tambahkan URL Google Apps Script:

```
NEXT_PUBLIC_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### 4. Setup Google Apps Script Backend

#### A. Buat Google Sheets

1. Buat Google Sheets baru dengan 3 sheet:
   - **Users** - untuk data user (columns: email, name, password, role)
   - **Products** - untuk data produk (columns: location, productName, sku, batch)
   - **StockOpname** - untuk data stock opname (columns: sessionId, rowId, timestamp, operator, location, productName, sku, batch, qty, edited, editTimestamp)

#### B. Setup Google Apps Script

1. Buka Google Sheets yang sudah dibuat
2. Klik **Extensions** > **Apps Script**
3. Hapus kode default dan copy-paste kode berikut:

```javascript
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
```

4. **Deploy**:
   - Klik **Deploy** > **New deployment**
   - Pilih type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**
   - Copy **Web app URL** dan masukkan ke `.env.local`

### 5. Jalankan Development Server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

### 6. Build untuk Production

```bash
npm run build
npm start
```

## 🎨 Color Scheme

Aplikasi menggunakan custom color scheme yang didefinisikan di `src/app/globals.css`:

- **Primary**: `#4a5d3e` (Hijau tua)
- **Primary Light**: `#5c7a4a` (Hijau terang)
- **Primary Pale**: `#f5f7f3` (Hijau sangat pucat)
- **Primary BG**: `#e8ece6` (Background hijau)
- **Error**: `#d32f2f` (Merah)
- **Warning**: `#fff3cd` (Kuning)
- **Warning Text**: `#856404` (Coklat)
- **Text Primary**: `#333333` (Hitam)
- **Text Secondary**: `#888888` (Abu-abu)
- **Border**: `#cccccc` (Abu-abu terang)

## 📱 Fitur Aplikasi

### 1. Login
- Login dengan email dan password
- Session disimpan di localStorage
- Auto redirect ke /scan jika sudah login

### 2. Scan Lokasi
- Scan barcode lokasi menggunakan kamera
- Input manual kode lokasi
- Validasi lokasi dari backend

### 3. Input Quantity
- List semua produk di lokasi
- Input quantity per produk
- Increment/decrement dengan button
- Simpan stock opname ke backend

### 4. Riwayat
- List semua stock opname yang sudah dilakukan
- Filter by: All, Today, This Week, This Month
- Edit quantity per entry
- Group by session

### 5. Bottom Navigation
- Scan: Ke halaman scan
- Riwayat: Ke halaman history
- Logout: Logout dan clear session

## 🔒 Security Notes

⚠️ **PENTING**: Aplikasi ini menggunakan localStorage untuk session management. Untuk production, sebaiknya menggunakan proper authentication dengan JWT dan secure HTTP-only cookies.

## 📄 License

ISC

## 👤 Author

chevalier976

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## ⭐ Show your support

Give a ⭐️ if this project helped you!

