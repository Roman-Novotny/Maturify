// Vygeneruje PNG ikony pro PWA z public/icon.svg. Spuštění: node scripts/generate-icons.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icon.svg", import.meta.url));
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

for (const size of [192, 512]) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(out(`icon-${size}.png`));
}
await sharp(svg, { density: 512 }).resize(180, 180).png().toFile(out("apple-touch-icon.png"));

// Maskable: logo v bezpečné zóně (80 %) na plném pozadí, ať ho Android může oříznout do kruhu.
const inner = await sharp(svg, { density: 512 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#101218" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(out("maskable-512.png"));

console.log("ikony hotové");
