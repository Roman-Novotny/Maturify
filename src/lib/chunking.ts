// Dělení textu materiálů na úseky pro vyhledávání (RAG). Čistá funkce – testovatelná.

const TARGET = 1200; // znaků na úsek (~300 tokenů)
const MAX = 1800;
const OVERLAP = 150;

/** Normalizuje bílé znaky z PDF (zalomené řádky, rozdělená slova se spojovníkem). */
export function normalizeText(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2") // „inform-\nace“ → „informace“
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Rozdělí text na úseky ~TARGET znaků po odstavcích (příp. větách), s malým překryvem,
 * aby se souvislost na hranici úseků neztratila.
 */
export function chunkText(raw: string): string[] {
  const text = normalizeText(raw);
  if (!text) return [];
  if (text.length <= MAX) return [text];

  // Odstavce; příliš dlouhé odstavce rozdělit po větách.
  const parts = text.split(/\n{2,}/).flatMap((p) => {
    if (p.length <= MAX) return [p];
    return p.match(/[^.!?\n]+[.!?]*\s*/g) ?? [p];
  });

  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if (current && current.length + piece.length + 2 > TARGET) {
      chunks.push(current);
      const tail = current.slice(-OVERLAP);
      const cut = tail.indexOf(" ");
      current = (cut >= 0 ? tail.slice(cut + 1) : tail) + "\n" + piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
    // Pojistka pro extrémně dlouhé „věty“ (tabulky, kód bez interpunkce).
    while (current.length > MAX) {
      chunks.push(current.slice(0, TARGET));
      current = current.slice(TARGET - OVERLAP);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
