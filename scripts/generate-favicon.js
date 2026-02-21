const sharp = require('sharp');

const size = 32;
const pad = 2;
const radius = 6;
const blpSize = 14;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
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
  <rect x="${pad}" y="${pad}" width="${size-pad*2}" height="${size-pad*2}" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <text x="${size/2}" y="${size*0.65}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${blpSize}" fill="url(#blp)">BLP</text>
</svg>`;

sharp(Buffer.from(svg)).resize(32, 32).png().toFile('public/favicon.png')
  .then(() => console.log('favicon.png generated'))
  .catch(e => console.error(e));
