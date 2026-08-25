// Text overlay compositing via sharp — free (no provider call), so it's
// safe to re-run on every headline edit. Note: sharp 0.35.x has had
// reported Vercel deployment issues (missing @img/sharp-libvips-linux-x64
// in some builds) — if this starts failing only in production, check that
// first before assuming the overlay logic itself is wrong.
import sharp from "sharp";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines;
}

export async function overlayHeadline(
  baseImage: Buffer,
  headlineText: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const resized = sharp(baseImage).resize(width, height, { fit: "cover" });

  const trimmed = headlineText.trim();
  if (!trimmed) {
    return resized.png().toBuffer();
  }

  const fontSize = Math.round(width * 0.075);
  const lineHeight = fontSize * 1.15;
  // 90% of width usable (5% margin each side), ~0.75em average glyph width
  // for bold Arial — measured empirically against real render output, not
  // just estimated, after an initial pass overflowed the right edge.
  const availableWidth = width * 0.9;
  const maxCharsPerLine = Math.floor(availableWidth / (fontSize * 0.75));
  const lines = wrapLines(trimmed, maxCharsPerLine, 3);

  const barHeight = lineHeight * lines.length + fontSize * 0.8;
  const barY = height - barHeight;
  const textStartY = barY + fontSize * 1.1;

  const tspans = lines
    .map((line, i) => `<tspan x="${width * 0.05}" y="${textStartY + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${barY}" width="${width}" height="${barHeight}" fill="black" fill-opacity="0.55" />
      <text
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="900"
        fill="white"
        stroke="black"
        stroke-width="${fontSize * 0.05}"
        paint-order="stroke"
      >${tspans}</text>
    </svg>`;

  return resized
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
