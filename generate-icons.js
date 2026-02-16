// Script to generate PWA icon PNGs (no external dependencies)
// Run with: node generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'public', 'icons');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePNG(size) {
  // Colors
  const bg = { r: 74, g: 93, b: 62 };      // #4a5d3e
  const fg = { r: 255, g: 255, b: 255 };    // white
  const accent = { r: 92, g: 122, b: 74 };  // #5c7a4a lighter green
  
  // Build raw pixel data (RGBA)
  const rawData = [];
  const radius = Math.round(size * 0.15);
  const borderW = Math.max(2, Math.round(size * 0.03));
  const innerPad = Math.round(size * 0.2);
  
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte: none
    for (let x = 0; x < size; x++) {
      // Check if pixel is in rounded rect
      const inRoundedRect = isInRoundedRect(x, y, 0, 0, size, size, radius);
      
      if (!inRoundedRect) {
        // Transparent
        rawData.push(0, 0, 0, 0);
        continue;
      }
      
      // Inner box border
      const onBorder = isOnRoundedRectBorder(x, y, innerPad, innerPad, size - innerPad * 2, size - innerPad * 2, Math.round(size * 0.08), borderW);
      
      // Center area - draw "SO" text pattern
      const cx = size / 2;
      const cy = size / 2;
      const letterH = Math.round(size * 0.22);
      const letterW = Math.round(size * 0.12);
      const gap = Math.round(size * 0.03);
      
      // S letter (left of center)
      const sX = cx - letterW - gap / 2;
      const sY = cy - letterH / 2;
      const inS = drawS(x, y, sX, sY, letterW, letterH, Math.max(2, Math.round(size * 0.025)));
      
      // O letter (right of center)  
      const oX = cx + gap / 2;
      const oY = cy - letterH / 2;
      const inO = drawO(x, y, oX, oY, letterW, letterH, Math.max(2, Math.round(size * 0.025)));
      
      if (inS || inO) {
        rawData.push(fg.r, fg.g, fg.b, 255);
      } else if (onBorder) {
        rawData.push(fg.r, fg.g, fg.b, 200);
      } else {
        // Subtle gradient
        const t = y / size;
        const r = Math.round(bg.r * (1 - t * 0.15) + accent.r * t * 0.15);
        const g = Math.round(bg.g * (1 - t * 0.15) + accent.g * t * 0.15);
        const b = Math.round(bg.b * (1 - t * 0.15) + accent.b * t * 0.15);
        rawData.push(r, g, b, 255);
      }
    }
  }
  
  const raw = Buffer.from(rawData);
  const compressed = zlib.deflateSync(raw);
  
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  // IEND
  const iend = Buffer.alloc(0);
  
  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', iend)
  ]);
}

function isInRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  // Check corners
  const corners = [
    [x + r, y + r],
    [x + w - r, y + r],
    [x + r, y + h - r],
    [x + w - r, y + h - r]
  ];
  for (const [cx, cy] of corners) {
    const dx = Math.abs(px - cx);
    const dy = Math.abs(py - cy);
    if (dx > r || dy > r) continue;
    if (px < x + r && py < y + r && dx * dx + dy * dy > r * r) return false;
    if (px >= x + w - r && py < y + r && dx * dx + dy * dy > r * r) return false;
    if (px < x + r && py >= y + h - r && dx * dx + dy * dy > r * r) return false;
    if (px >= x + w - r && py >= y + h - r && dx * dx + dy * dy > r * r) return false;
  }
  return true;
}

function isOnRoundedRectBorder(px, py, x, y, w, h, r, bw) {
  const outer = isInRoundedRect(px, py, x, y, w, h, r);
  const inner = isInRoundedRect(px, py, x + bw, y + bw, w - bw * 2, h - bw * 2, Math.max(0, r - bw));
  return outer && !inner;
}

// Draw S shape
function drawS(px, py, x, y, w, h, t) {
  const segH = h / 3;
  // Top horizontal
  if (px >= x && px < x + w && py >= y && py < y + t) return true;
  // Middle horizontal
  if (px >= x && px < x + w && py >= y + segH - t/2 && py < y + segH + t/2) return true;
  // Also second middle
  if (px >= x && px < x + w && py >= y + segH*2 - t/2 && py < y + segH*2 + t/2) return true;
  // Bottom horizontal
  if (px >= x && px < x + w && py >= y + h - t && py < y + h) return true;
  // Left vertical top half
  if (px >= x && px < x + t && py >= y && py < y + segH) return true;
  // Right vertical middle
  if (px >= x + w - t && px < x + w && py >= y + segH && py < y + segH * 2) return true;
  // Left vertical bottom half
  if (px >= x && px < x + t && py >= y + segH * 2 && py < y + h) return true;
  return false;
}

// Draw O shape
function drawO(px, py, x, y, w, h, t) {
  if (px >= x && px < x + w && py >= y && py < y + t) return true;     // top
  if (px >= x && px < x + w && py >= y + h - t && py < y + h) return true; // bottom
  if (px >= x && px < x + t && py >= y && py < y + h) return true;     // left
  if (px >= x + w - t && px < x + w && py >= y && py < y + h) return true; // right
  return false;
}

// Generate all sizes
sizes.forEach(size => {
  const png = generatePNG(size);
  const filePath = path.join(iconsDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated icon-${size}x${size}.png (${png.length} bytes)`);
});

console.log('\nDone! All PWA icons generated.');
