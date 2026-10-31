// Z out.json (crawl.mjs) připraví items.json pro import do Maturify: témata + materiál (poznámka)
// + úseky pro RAG + jedna ústní otázka se vzorovou odpovědí. Spuštění: node scripts/notion/build-items.ts

import { readFile, writeFile } from "node:fs/promises";
import { chunkText } from "../../src/lib/chunking.ts";

type Page = { id: string; title: string; path: string[]; markdown: string; children: string[] };

const pages: Page[] = JSON.parse(await readFile(new URL("./out.json", import.meta.url), "utf8"));
const byTitle = (prefix: string) => pages.find((p) => p.title.trim().startsWith(prefix))!;

/** Úklid Markdownu z Notionu: osamocené odkazy „‣“ (zmínky) a vícenásobné prázdné řádky. */
const clean = (md: string) =>
  md
    .split("\n")
    .filter((l) => l.trim() !== "‣")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

type Item = {
  subject: "it" | "cj";
  title: string;
  description: string;
  sort: number;
  markdown: string;
  question: string;
};

const items: Item[] = [];

function addSection(rootPrefix: string, subject: Item["subject"], label: string, description: string, sortBase: number, question: (t: string) => string) {
  const root = byTitle(rootPrefix);
  root.children.forEach((childId, i) => {
    const p = pages.find((x) => x.id === childId);
    if (!p || !p.markdown.trim()) return;
    const t = oneLine(p.title).replace(/^(\d+)\.\s*/, "$1. ");
    items.push({
      subject,
      title: label ? `${label} ${t}` : t,
      description,
      sort: sortBase + i,
      markdown: clean(p.markdown),
      question: question(oneLine(p.title).replace(/^\d+\.\s*/, "")),
    });
  });
}

// Informatika
addSection("Soubor předmětů z informatiky", "it", "SPI", "Soubor předmětů z informatiky (SPI) – ústní maturita", 0, (t) => `Maturitní otázka SPI: ${t}. Pohovoř o tématu.`);
addSection("Počítačové systémy a sítě", "it", "PSS", "Počítačové systémy a sítě (PSS) – ústní maturita", 100, (t) => `Maturitní otázka PSS: ${t}. Pohovoř o tématu.`);
addSection("AVT - praktická maturita", "it", "AVT praktická –", "AVT – praktická maturita (úloha)", 200, (t) => `Praktická maturita AVT: popiš postup řešení úlohy „${t}“.`);
{
  const ops = byTitle("OPS/PSS - praktická maturita");
  items.push({
    subject: "it",
    title: "OPS/PSS praktická – odkazy a zdroje",
    description: "OPS/PSS – praktická maturita",
    sort: 300,
    markdown: clean(ops.markdown),
    question: "Praktická maturita OPS/PSS: jaké zdroje a postupy použiješ?",
  });
}

// Čeština – kategorie (epocha) podle nadpisu, pod kterým je dílo v rozcestníku.
{
  const root = byTitle("Literatura, čeština");
  let category = "";
  const categoryOf = new Map<string, string>();
  for (const line of root.markdown.split("\n")) {
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) category = h[1].trim();
    const pageLine = line.match(/^- 📄 (.*)$/);
    if (pageLine) categoryOf.set(pageLine[1].trim(), category);
  }
  root.children.forEach((childId, i) => {
    const p = pages.find((x) => x.id === childId);
    if (!p || !p.markdown.trim()) return;
    const cat = categoryOf.get(p.title.trim()) ?? "";
    const isTheory = cat === "Ostatní";
    items.push({
      subject: "cj",
      title: oneLine(p.title),
      description: isTheory ? "Teorie literatury a slohu" : `Rozbor díla – ${cat}`,
      sort: isTheory ? 100 + i : i,
      markdown: clean(p.markdown),
      question: isTheory
        ? `Vysvětli pojmy z oblasti: ${oneLine(p.title)}.`
        : `Ústní maturita ČJL: rozbor díla „${oneLine(p.title)}“ (autor, kontext, téma, kompozice, postavy, jazyk).`,
    });
  });
}

// Výstup pro importní stránku v appce (/dev-import): témata s předpočítanými úseky.
const payload = items.map((it) => ({ ...it, chunks: chunkText(it.markdown) }));
await writeFile(new URL("./items.json", import.meta.url), JSON.stringify(payload));
console.log(
  `Témat: ${items.length} (IT ${items.filter((x) => x.subject === "it").length}, ČJ ${items.filter((x) => x.subject === "cj").length}),`,
  `úseků: ${payload.reduce((a, p) => a + p.chunks.length, 0)}`,
);
