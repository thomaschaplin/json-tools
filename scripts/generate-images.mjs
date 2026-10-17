// Generates the app icons, favicon and per-page social cards into public/.
// Run with: npm run images   (requires the dev dependency `sharp`)
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const root = new URL("../", import.meta.url);
const pub = (p) => new URL(`public/${p}`, root).pathname;

// Load the page table through Vite so the TypeScript source stays the single source of truth.
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
const { PAGES, SITE_URL } = await vite.ssrLoadModule("/src/seo/pages.ts");
await vite.close();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ icon */

function iconSvg({ size = 512, padding = 0, radius = 112, bg = true } = {}) {
  const inner = size - padding * 2;
  const s = inner / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7a6bff"/>
      <stop offset="0.55" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${bg ? `<rect width="${size}" height="${size}" fill="url(#g)" ${padding ? "" : `rx="${radius}"`}/>` : ""}
  ${bg && !padding ? `<rect width="${size}" height="${size}" rx="${radius}" fill="url(#shine)"/>` : ""}
  <g transform="translate(${padding} ${padding}) scale(${s})" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
    <path d="M196 116h-18a44 44 0 0 0-44 44v52a44 44 0 0 1-44 44 44 44 0 0 1 44 44v52a44 44 0 0 0 44 44h18"/>
    <path d="M316 116h18a44 44 0 0 1 44 44v52a44 44 0 0 0 44 44 44 44 0 0 0-44 44v52a44 44 0 0 1-44 44h-18"/>
    <circle cx="256" cy="256" r="22" fill="#fff" stroke="none"/>
  </g>
</svg>`;
}

/* ------------------------------------------------------------ social card */

const CODE = [
  [["{", "p"]],
  [["  ", ""], ['"name"', "k"], [": ", "p"], ['"JSON Tools"', "s"], [",", "p"]],
  [["  ", ""], ['"private"', "k"], [": ", "p"], ["true", "b"], [",", "p"]],
  [["  ", ""], ['"offline"', "k"], [": ", "p"], ["true", "b"], [",", "p"]],
  [["  ", ""], ['"id"', "k"], [": ", "p"], ["9007199254740993", "n"], [",", "p"]],
  [["  ", ""], ['"tools"', "k"], [": ", "p"], ["[", "p"]],
  [["    ", ""], ['"format"', "s"], [", ", "p"], ['"query"', "s"], [",", "p"]],
  [["    ", ""], ['"diff"', "s"], [", ", "p"], ['"convert"', "s"]],
  [["  ", ""], ["],", "p"]],
  [["  ", ""], ['"upload"', "k"], [": ", "p"], ["null", "z"]],
  [["}", "p"]],
];
const COLORS = { k: "#b9abff", s: "#7fe0a7", n: "#ffb86c", b: "#f592e3", z: "#7f8999", p: "#8a93a3", "": "#e7eaf0" };

function wrap(text, max) {
  const words = text.split(" ");
  const lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + " " + w).trim().length > max && cur) lines.push(w);
    else lines[lines.length - 1] = (cur + " " + w).trim();
  }
  return lines;
}

function cardSvg(page) {
  const [title, sub] = page.card;
  const titleLines = wrap(title, 16);
  const titleSize = titleLines.length > 1 ? 74 : 84;
  const titleY = titleLines.length > 1 ? 262 : 300;
  const code = CODE.map((line, i) => {
    let x = 0;
    const spans = line
      .map(([t, c]) => {
        const out = `<tspan fill="${COLORS[c]}">${esc(t)}</tspan>`;
        x += t.length;
        return out;
      })
      .join("");
    return `<text x="760" y="${190 + i * 33}" font-family="DejaVu Sans Mono, monospace" font-size="21" xml:space="preserve">${spans}</text>`;
  }).join("\n");
  const host = SITE_URL.replace(/^https?:\/\//, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow1" cx="0.15" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#5b4cff" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#5b4cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.95" cy="1" r="0.6">
      <stop offset="0" stop-color="#2563eb" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#2563eb" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.045" stroke-width="1"/>
    </pattern>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7a6bff"/><stop offset="0.55" stop-color="#4f46e5"/><stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#151920"/><stop offset="1" stop-color="#11141a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0d12"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow1)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>

  <g transform="translate(72 64)">
    <rect width="56" height="56" rx="15" fill="url(#g)"/>
    <g transform="translate(6 6) scale(0.0859)" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round">
      <path d="M196 116h-18a44 44 0 0 0-44 44v52a44 44 0 0 1-44 44 44 44 0 0 1 44 44v52a44 44 0 0 0 44 44h18"/>
      <path d="M316 116h18a44 44 0 0 1 44 44v52a44 44 0 0 0 44 44 44 44 0 0 0-44 44v52a44 44 0 0 1-44 44h-18"/>
    </g>
    <text x="74" y="38" font-family="Inter" font-weight="700" font-size="28" fill="#e7eaf0" letter-spacing="-0.5">JSON Tools</text>
  </g>

  ${titleLines.map((l, i) => `<text x="72" y="${titleY + i * (titleSize + 6)}" font-family="Inter Display, Inter" font-weight="800" font-size="${titleSize}" fill="#ffffff" letter-spacing="-2.5">${esc(l)}</text>`).join("\n  ")}
  ${wrap(sub, 42).map((l, i) => `<text x="74" y="${titleY + titleLines.length * (titleSize + 6) + 26 + i * 40}" font-family="Inter" font-weight="500" font-size="30" fill="#9aa4b5">${esc(l)}</text>`).join("\n  ")}

  <g>
    <rect x="730" y="120" width="410" height="420" rx="18" fill="url(#fade)" stroke="#2a313d"/>
    <circle cx="756" cy="146" r="6" fill="#ff5f57"/><circle cx="776" cy="146" r="6" fill="#febc2e"/><circle cx="796" cy="146" r="6" fill="#28c840"/>
    ${code}
    <rect x="1000" y="490" width="118" height="32" rx="16" fill="#3ddc84" fill-opacity="0.14"/>
    <text x="1059" y="512" text-anchor="middle" font-family="Inter" font-weight="600" font-size="16" fill="#3ddc84">✓ Valid JSON</text>
  </g>

  <text x="72" y="570" font-family="Inter" font-weight="500" font-size="22" fill="#6b7586">${esc(host)}  ·  Free  ·  Private  ·  Works offline</text>
</svg>`;
}

/* -------------------------------------------------------------- favicon.ico */

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
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
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

await mkdir(pub("og"), { recursive: true });

const svg = iconSvg();
await writeFile(pub("favicon.svg"), svg);
await sharp(Buffer.from(svg)).resize(192, 192).png().toFile(pub("pwa-192x192.png"));
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(pub("pwa-512x512.png"));
// Maskable: full-bleed background with the glyph inside the 80% safe zone.
await sharp(Buffer.from(iconSvg({ padding: 72 }))).resize(512, 512).png().toFile(pub("pwa-maskable-512x512.png"));
// Apple touch icons are masked by iOS, so render without rounded corners.
await sharp(Buffer.from(iconSvg({ radius: 0 }))).resize(180, 180).png().toFile(pub("apple-touch-icon.png"));
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(async (size) => ({ size, data: await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer() })));
await writeFile(pub("favicon.ico"), ico(pngs));

for (const page of PAGES) {
  const name = page.slug || "home";
  await sharp(Buffer.from(cardSvg(page))).png({ compressionLevel: 9 }).toFile(pub(`og/${name}.png`));
}
console.log(`Generated icons and ${PAGES.length} social cards.`);
