const sharp = require('sharp');
const path = require('path');

// Icon sizes for PWA
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// ── BLP letter paths (font-independent, rendered as filled shapes) ──
// Coordinate system: each letter 100 units tall; fill-rule="evenodd" for holes
const LETTERS = {
  B: {
    width: 62,
    // Outer: left stem, top-right bump, waist, bottom-right bump (wider)
    // Holes: top counter, bottom counter
    d: [
      'M0,0 H36 C50,0 60,8 60,20 C60,32 54,38 44,42',
      'C56,46 64,54 64,70 C64,88 52,100 36,100 H0 Z',
      'M17,16 H32 C40,16 44,20 44,26 C44,32 40,36 32,36 H17 Z',
      'M17,56 H34 C44,56 48,62 48,70 C48,80 44,84 34,84 H17 Z',
    ].join(' '),
  },
  L: {
    width: 48,
    d: 'M0,0 H17 V82 H48 V100 H0 Z',
  },
  P: {
    width: 58,
    // Outer: stem + bowl; Hole: counter
    d: [
      'M0,0 H36 C52,0 58,10 58,26 C58,44 52,54 36,54 H17 V100 H0 Z',
      'M17,16 H32 C42,16 44,22 44,28 C44,36 42,38 32,38 H17 Z',
    ].join(' '),
  },
};

function createLogoSvg(size) {
  const pad = Math.round(size * 0.06);
  const r = Math.round(size * 0.18);
  const inner = size - pad * 2;

  // ── Scale & position BLP letters ──
  const letterH = size * 0.28;        // letter height in px
  const sc = letterH / 100;           // path→px scale factor
  const gap = size * 0.025;           // spacing between letters
  const bW = LETTERS.B.width * sc;
  const lW = LETTERS.L.width * sc;
  const pW = LETTERS.P.width * sc;
  const totalW = bW + lW + pW + gap * 2;
  const startX = (size - totalW) / 2;
  const startY = size * 0.26;         // vertical top of BLP

  const bX = startX;
  const lX = bX + bW + gap;
  const pX = lX + lW + gap;

  // ── Divider line ──
  const lineY = startY + letterH + size * 0.06;
  const lineW = totalW * 0.85;
  const lineX = (size - lineW) / 2;

  // ── Subtitle positions ──
  const sub1Y = lineY + size * 0.10;
  const sub1Size = Math.max(5, Math.round(size * 0.070));
  const sub2Y = sub1Y + size * 0.08;
  const sub2Size = Math.max(4, Math.round(size * 0.058));

  // Only show subtitles when icon is large enough to read them
  const showSub1 = size >= 128;
  const showSub2 = size >= 192;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3e3e3e"/>
      <stop offset="100%" stop-color="#1e1e1e"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b5c49a"/>
      <stop offset="100%" stop-color="#8a9e6c"/>
    </linearGradient>
  </defs>

  <!-- Dark rounded background -->
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" ry="${r}" fill="url(#bg)"/>

  <!-- BLP letters (vector paths — no font dependency) -->
  <g fill="url(#fg)" fill-rule="evenodd">
    <g transform="translate(${bX.toFixed(2)},${startY.toFixed(2)}) scale(${sc.toFixed(4)})">
      <path d="${LETTERS.B.d}"/>
    </g>
    <g transform="translate(${lX.toFixed(2)},${startY.toFixed(2)}) scale(${sc.toFixed(4)})">
      <path d="${LETTERS.L.d}"/>
    </g>
    <g transform="translate(${pX.toFixed(2)},${startY.toFixed(2)}) scale(${sc.toFixed(4)})">
      <path d="${LETTERS.P.d}"/>
    </g>
  </g>

  <!-- Divider -->
  <line x1="${lineX.toFixed(1)}" y1="${lineY.toFixed(1)}" x2="${(lineX + lineW).toFixed(1)}" y2="${lineY.toFixed(1)}"
        stroke="rgba(255,255,255,0.45)" stroke-width="${Math.max(1, Math.round(size * 0.005))}"/>

  ${showSub1 ? `<!-- Stock Opname -->
  <text x="${size / 2}" y="${sub1Y.toFixed(1)}" text-anchor="middle"
        font-family="sans-serif" font-weight="600" font-size="${sub1Size}"
        fill="white" letter-spacing="${(size * 0.01).toFixed(1)}">Stock Opname</text>` : ''}

  ${showSub2 ? `<!-- Warehouse Central -->
  <text x="${size / 2}" y="${sub2Y.toFixed(1)}" text-anchor="middle"
        font-family="sans-serif" font-weight="400" font-size="${sub2Size}"
        fill="rgba(255,255,255,0.75)">Warehouse Central</text>` : ''}
</svg>`;
}

// ── Generate all PWA icons ──
async function generateIcons() {
  const outDir = path.join(__dirname, '..', 'public', 'icons');

  for (const size of sizes) {
    const svg = createLogoSvg(size);
    const outPath = path.join(outDir, `icon-${size}x${size}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log(`  ✓ icon-${size}x${size}.png`);
  }

  // Also generate 32px favicon
  const favSvg = createLogoSvg(32);
  await sharp(Buffer.from(favSvg)).png().toFile(
    path.join(__dirname, '..', 'public', 'favicon.png')
  );
  console.log('  ✓ favicon.png');

  console.log('\nAll icons generated!');
}

generateIcons().catch(console.error);
