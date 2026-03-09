#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function createIconSVG(size) {
  const r = size * 0.35;
  const cx = size / 2;
  const cy = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#0f6cbd"/>
  <text x="${cx}" y="${cy + size * 0.12}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="${size * 0.45}" fill="white">R</text>
</svg>`;
}

for (const size of [16, 48, 128]) {
  const svg = createIconSVG(size);
  fs.writeFileSync(path.join(__dirname, `icon${size}.svg`), svg);
}

console.log("SVG icons generated. Convert to PNG for the extension manifest.");
console.log("For development, rename .svg to .png or use a converter.");
