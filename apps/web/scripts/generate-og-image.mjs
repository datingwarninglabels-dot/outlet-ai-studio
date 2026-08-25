// Original OG/share image — a text composition in the marketing brand's
// warm palette, not a screenshot of anything. Placeholder until a real
// designed share image exists. Run with: node scripts/generate-og-image.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public");
const WIDTH = 1200;
const HEIGHT = 630;

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#15110d" />
      <stop offset="100%" stop-color="#1c1712" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e08a3c" />
      <stop offset="100%" stop-color="#c76a24" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect x="80" y="80" width="120" height="6" rx="3" fill="url(#accent)" />
  <text x="80" y="220" font-family="Arial, sans-serif" font-weight="700" font-size="72" fill="#f5efe5">Outlet AI Studio</text>
  <text x="80" y="290" font-family="Arial, sans-serif" font-weight="400" font-size="34" fill="#a89a86">Your idea. Your voice. Your outlet.</text>
  <text x="80" y="380" font-family="Arial, sans-serif" font-weight="400" font-size="26" fill="#e08a3c">One studio. Every part of the story.</text>
</svg>`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(OUT_DIR, "og-image.png"), buffer);
  console.log("wrote og-image.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
