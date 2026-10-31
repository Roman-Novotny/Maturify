import { describe, expect, it } from "vitest";
import { chunkText, normalizeText } from "@/lib/chunking";

describe("normalizeText", () => {
  it("spojí slova rozdělená spojovníkem na konci řádku a srazí mezery", () => {
    expect(normalizeText("infor-\nmace   a\t\tdata\n\n\n\nkonec")).toBe("informace a data\n\nkonec");
  });
});

describe("chunkText", () => {
  it("prázdný text = žádné úseky", () => {
    expect(chunkText("   \n ")).toEqual([]);
  });

  it("krátký text je jeden úsek", () => {
    expect(chunkText("Model ISO/OSI má 7 vrstev.")).toEqual(["Model ISO/OSI má 7 vrstev."]);
  });

  it("dlouhý text rozdělí na úseky rozumné délky bez ztráty obsahu", () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Odstavec ${i}. ` + "Lorem ipsum dolor sit amet. ".repeat(6));
    const chunks = chunkText(paragraphs.join("\n\n"));
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1800);
    for (let i = 0; i < 30; i++) expect(chunks.some((c) => c.includes(`Odstavec ${i}.`))).toBe(true);
  });

  it("rozseká i text bez odstavců a interpunkce", () => {
    const chunks = chunkText("slovo ".repeat(2000));
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1800);
  });
});
