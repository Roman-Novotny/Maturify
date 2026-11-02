// Stáhne obrázky z Notionu (images.json z crawl.mjs) přes veřejný obrázkový proxy notion.site
// a uloží je zmenšené jako WebP do scripts/notion/img/<blockId>.webp. Spuštění: node scripts/notion/images.mjs

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BASE = "https://closed-cucumber-021.notion.site";
const images = JSON.parse(await readFile(new URL("./images.json", import.meta.url), "utf8"));
const dir = new URL("./img/", import.meta.url);
await mkdir(dir, { recursive: true });

const entries = Object.entries(images);
let ok = 0, skipped = 0;
const failed = [];
async function one([id, src]) {
  const file = new URL(`${id}.webp`, dir);
  if (await stat(file).catch(() => null)) return void skipped++;
  const proxied = `${BASE}/image/${encodeURIComponent(src)}?table=block&id=${id}&cache=v2`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt));
      // Lichý pokus: přímo z původní adresy (externí obrázky), jinak přes proxy notion.site.
      const url = attempt % 2 && src.startsWith("http") ? src : proxied;
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const webp = await sharp(buf, { animated: true }).rotate().resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      await writeFile(file, webp);
      ok++;
      return;
    } catch (e) {
      if (attempt === 3) failed.push(`${id} ${e.message}`);
    }
  }
}
for (let i = 0; i < entries.length; i += 2) await Promise.all(entries.slice(i, i + 2).map(one));
console.log(`staženo ${ok}, přeskočeno ${skipped}, chyby ${failed.length}`);
if (failed.length) console.log(failed.join("\n"));
