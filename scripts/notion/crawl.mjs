// Stáhne veřejný Notion strom (Maturita) přes veřejné API notion.site a převede ho na Markdown.
// Výstup: scripts/notion/out.json  –  [{ id, title, path: [...], markdown, children: [ids] }]
// Spuštění: node scripts/notion/crawl.mjs <rootPageId>

import { writeFile } from "node:fs/promises";

const BASE = "https://closed-cucumber-021.notion.site/api/v3";
const ROOT = process.argv[2] ?? "10e4522ba7ee8047a8d5e679fe58af00";
const toId = (s) => s.replace(/-/g, "").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
/** id obrázkového bloku → zdroj (URL nebo attachment:…) */
const images = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(endpoint, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`${endpoint} failed`);
}

const unwrap = (rec) => rec?.value?.value ?? rec?.value;

/** Všechny bloky stránky (stránkování přes cursor). */
async function loadPage(pageId) {
  const blocks = {};
  let cursor = { stack: [] };
  for (let chunk = 0; chunk < 50; chunk++) {
    const j = await post("loadCachedPageChunkV2", { page: { id: pageId }, limit: 100, cursor, verticalColumns: false });
    for (const [id, rec] of Object.entries(j.recordMap?.block ?? {})) {
      const v = unwrap(rec);
      if (v) blocks[id] = v;
    }
    cursor = j.cursors?.[0] ?? j.cursor;
    if (!cursor?.stack?.length) break;
  }
  // Doplnit bloky, které v chunku nepřišly.
  for (let round = 0; round < 5; round++) {
    const missing = new Set();
    for (const b of Object.values(blocks)) for (const c of b.content ?? []) if (!blocks[c]) missing.add(c);
    // Podstránky nenačítat (budou mít vlastní průchod) – stačí jejich titulek, ten se dotáhne níž.
    if (!missing.size) break;
    const ids = [...missing].slice(0, 200);
    const j = await post("syncRecordValuesMain", {
      requests: ids.map((id) => ({ pointer: { table: "block", id }, version: -1 })),
    });
    for (const [id, rec] of Object.entries(j.recordMap?.block ?? {})) {
      const v = unwrap(rec);
      if (v) blocks[id] = v;
    }
    if (ids.length === missing.size && round > 2) break;
  }
  return blocks;
}

/** Notion rich text → Markdown. */
function rich(title) {
  if (!title) return "";
  return title
    .map(([text, ann]) => {
      let t = text;
      if (t === "⁍") {
        const eq = ann?.find((a) => a[0] === "e");
        return eq ? `\\(${eq[1].trim()}\\)` : ""; // inline vzorec jako \( … \) – „$“ se v IT poznámkách plete s proměnnými
      }
      for (const a of ann ?? []) {
        if (a[0] === "b") t = `**${t}**`;
        else if (a[0] === "i") t = `*${t}*`;
        else if (a[0] === "c") t = `\`${t}\``;
        else if (a[0] === "a") t = `[${t}](${a[1]})`;
      }
      return t;
    })
    .join("");
}

function toMarkdown(pageId, blocks, childPages) {
  const lines = [];
  const walk = (ids, depth) => {
    let n = 0;
    for (const id of ids ?? []) {
      const b = blocks[id];
      if (!b || b.alive === false) continue;
      const text = rich(b.properties?.title);
      const ind = "  ".repeat(depth);
      switch (b.type) {
        case "page":
          childPages.push(id);
          lines.push(`${ind}- 📄 ${text}`);
          continue; // obsah podstránky se zpracuje zvlášť
        case "header":
          lines.push("", `## ${text}`);
          break;
        case "sub_header":
          lines.push("", `### ${text}`);
          break;
        case "sub_sub_header":
          lines.push("", `#### ${text}`);
          break;
        case "bulleted_list":
          lines.push(`${ind}- ${text}`);
          break;
        case "numbered_list":
          lines.push(`${ind}${++n}. ${text}`);
          break;
        case "to_do":
          lines.push(`${ind}- [${b.properties?.checked?.[0]?.[0] === "Yes" ? "x" : " "}] ${text}`);
          break;
        case "toggle":
          lines.push(`${ind}- **${text}**`);
          break;
        case "quote":
          lines.push(`${ind}> ${text}`);
          break;
        case "callout":
          lines.push(`${ind}> ${b.format?.page_icon && !b.format.page_icon.startsWith("http") ? b.format.page_icon + " " : ""}${text}`);
          break;
        case "code":
          lines.push("```", b.properties?.title?.map((t) => t[0]).join("") ?? "", "```");
          break;
        case "equation":
          lines.push(`$$${b.properties?.title?.[0]?.[0] ?? ""}$$`);
          break;
        case "image": {
          const src = b.properties?.source?.[0]?.[0] ?? b.format?.display_source;
          if (src) {
            images[id] = src;
            lines.push("", `${ind}![${text.replace(/[[\]]/g, "")}](notion-img:${id})`, "");
          }
          break;
        }
        case "file":
        case "pdf":
          lines.push(`${ind}[soubor: ${text || b.properties?.source?.[0]?.[0] || ""}]`);
          break;
        case "bookmark":
          { const l = b.properties?.link?.[0]?.[0]; if (l) lines.push(`${ind}[${rich(b.properties?.title) || l}](${l})`); }
          break;
        case "divider":
          lines.push("", "---");
          break;
        case "table": {
          const order = b.format?.table_block_column_order ?? [];
          for (const rowId of b.content ?? []) {
            const row = blocks[rowId];
            if (!row) continue;
            lines.push(`| ${order.map((c) => rich(row.properties?.[c]).replace(/\|/g, "/")).join(" | ")} |`);
          }
          continue;
        }
        case "column_list":
        case "column":
          walk(b.content, depth);
          continue;
        case "text":
        default:
          if (text) lines.push(`${ind}${text}`);
          else if (b.type === "text") lines.push("");
      }
      if (b.content?.length) walk(b.content, b.type === "header" || b.type?.endsWith("header") ? depth : depth + 1);
    }
  };
  walk(blocks[pageId]?.content, 0);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const out = [];
const seen = new Set();
const queue = [{ id: toId(ROOT), path: [] }];
while (queue.length) {
  const { id, path } = queue.shift();
  if (seen.has(id)) continue;
  seen.add(id);
  const blocks = await loadPage(id);
  const page = blocks[id];
  const title = rich(page?.properties?.title).trim() || "(bez názvu)";
  const childPages = [];
  const markdown = toMarkdown(id, blocks, childPages);
  out.push({ id, title, path, markdown, children: childPages });
  process.stdout.write(`${"  ".repeat(path.length)}${title} (${markdown.length} zn., ${childPages.length} podstránek)\n`);
  for (const c of childPages) queue.push({ id: c, path: [...path, title] });
  await sleep(150);
}

await writeFile(new URL("./out.json", import.meta.url), JSON.stringify(out, null, 1));
await writeFile(new URL("./images.json", import.meta.url), JSON.stringify(images, null, 1));
console.log(`\nHotovo: ${out.length} stránek, ${out.reduce((a, p) => a + p.markdown.length, 0)} znaků`);
