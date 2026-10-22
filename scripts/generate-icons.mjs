// Generates the app icons from one card glyph: a white index card with the red header rule
// and faint ruled lines, on ink. Run: node scripts/generate-icons.mjs
// Outputs: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png,
//          app/icon.svg, app/apple-icon.png, app/favicon.ico
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const INK = "#111111";
const CARD = "#ffffff";
const RED = "#c8331f";
const LINES = "#dfe6f3";

/**
 * @param {object} o
 * @param {number} o.cardWidth card width in a 512 box (3:4 card)
 * @param {number} o.radius background corner radius (0 = full bleed)
 * @param {boolean} o.lines draw ruled lines (skip for tiny sizes)
 */
function iconSvg({ cardWidth, radius, lines }) {
  const S = 512;
  const w = cardWidth;
  const h = Math.round((w * 4) / 3);
  const x = (S - w) / 2;
  const y = (S - h) / 2;
  const r = Math.max(4, Math.round(w * 0.04));
  const ruleY = y + Math.round(h * 0.22);
  const ruleH = Math.max(8, Math.round(h * 0.035));
  const ruled = [];
  if (lines) {
    const gap = Math.round(h * 0.13);
    for (let ly = ruleY + ruleH + gap; ly < y + h - gap * 0.9; ly += gap) {
      ruled.push(`<rect x="${x}" y="${ly}" width="${w}" height="${Math.max(3, Math.round(h * 0.01))}" fill="${LINES}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${radius}" fill="${INK}"/>
  <clipPath id="card"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  <g clip-path="url(#card)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CARD}"/>
    ${ruled.join("\n    ")}
    <rect x="${x}" y="${ruleY}" width="${w}" height="${ruleH}" fill="${RED}"/>
  </g>
</svg>
`;
}

// "any" icons: rounded tile, larger card. Maskable/Apple: full bleed, card inside the 80% safe circle.
const anySvg = iconSvg({ cardWidth: 264, radius: 112, lines: true });
const bleedSvg = iconSvg({ cardWidth: 228, radius: 0, lines: true });
const faviconSvg = iconSvg({ cardWidth: 300, radius: 96, lines: false });

async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 512) * 2 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO container with PNG-compressed images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  const out = (p) => path.join(root, p);
  await mkdir(out("public/icons"), { recursive: true });

  const files = {
    "public/icons/icon-192.png": await png(anySvg, 192),
    "public/icons/icon-512.png": await png(anySvg, 512),
    "public/icons/maskable-512.png": await png(bleedSvg, 512),
    "public/icons/apple-touch-icon.png": await png(bleedSvg, 180),
    "app/apple-icon.png": await png(bleedSvg, 180),
    "app/icon.svg": Buffer.from(faviconSvg),
    "app/favicon.ico": ico(
      await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(faviconSvg, size) }))),
    ),
  };

  for (const [file, data] of Object.entries(files)) {
    await writeFile(out(file), data);
    console.log(`${file}  ${(data.length / 1024).toFixed(1)} KB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
