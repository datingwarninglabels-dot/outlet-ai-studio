// One-off generator for placeholder PWA icons — a simple gradient
// monogram matching the app's existing accent-purple/blue/teal theme
// (see globals.css and the primary-button gradient used throughout the
// UI). This is NOT final brand design (Section 3 asks for original
// branding/interface design, which is a design task, not something to
// fake here) — it exists so the manifest has real, valid icon files
// rather than none at all. Run with: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

function svgIcon({ size, padding }) {
  const r = size * 0.22;
  const inner = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const fontSize = inner * 0.52;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6" />
      <stop offset="50%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#2dd4bf" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="#0b0c10" />
  <circle cx="${cx}" cy="${cy}" r="${inner / 2}" fill="none" stroke="url(#g)" stroke-width="${inner * 0.14}" />
  <text x="${cx}" y="${cy}" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="url(#g)" text-anchor="middle" dominant-baseline="central">O</text>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { name: "icon-192.png", size: 192, padding: 0 },
    { name: "icon-512.png", size: 512, padding: 0 },
    // Maskable icons need extra padding so platform-applied masks (circle,
    // squircle, etc.) don't clip the logo — the "safe zone" convention.
    { name: "icon-maskable-512.png", size: 512, padding: 512 * 0.1 },
    { name: "apple-touch-icon.png", size: 180, padding: 0 },
  ];

  for (const t of targets) {
    const svg = svgIcon(t);
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    await writeFile(path.join(OUT_DIR, t.name), buffer);
    console.log(`wrote ${t.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
