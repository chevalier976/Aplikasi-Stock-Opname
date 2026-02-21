const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Icon sizes needed for PWA
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// SVG that matches the BLP Stock Opname Warehouse Central logo
// Dark rounded background, olive-green "BLP", white text underneath
function createLogoSvg(size) {
  const pad = Math.round(size * 0.08);
  const radius = Math.round(size * 0.18);
  const blpSize = Math.round(size * 0.28);
  const subSize = Math.round(size * 0.075);
  const subSize2 = Math.round(size * 0.065);
  const lineY = Math.round(size * 0.68);
  const lineW = Math.round(size * 0.45);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a3a3a"/>
      <stop offset="100%" stop-color="#1a1a1a"/>
    </linearGradient>
    <linearGradient id="blp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a8b88c"/>
      <stop offset="100%" stop-color="#7a8f5e"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect x="${pad}" y="${pad}" width="${size - pad*2}" height="${size - pad*2}" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <!-- BLP text -->
  <text x="${size/2}" y="${size * 0.46}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${blpSize}" fill="url(#blp)" letter-spacing="${Math.round(size*0.02)}">BLP</text>
  <!-- Divider line -->
  <line x1="${(size - lineW)/2}" y1="${lineY}" x2="${(size + lineW)/2}" y2="${lineY}" stroke="white" stroke-width="${Math.max(1, Math.round(size*0.005))}" opacity="0.6"/>
  <!-- Stock Opname -->
  <text x="${size/2}" y="${size * 0.77}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="${subSize}" fill="white" letter-spacing="${Math.round(size*0.01)}">Stock Opname</text>
  <!-- Warehouse Central -->
  <text x="${size/2}" y="${size * 0.86}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="400" font-size="${subSize2}" fill="white" opacity="0.85">Warehouse Central</text>
</svg>`;
}

async function generateIcons() {
  const outDir = path.join(__dirname, '..', 'public', 'icons');

  for (const size of sizes) {
    const svg = createLogoSvg(size);
    const outPath = path.join(outDir, `icon-${size}x${size}.png`);
    
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outPath);
    
    console.log(`Generated: icon-${size}x${size}.png`);
  }

  console.log('All icons generated!');
}

generateIcons().catch(console.error);
