import type { SubjectId } from "@/lib/database.types";

// Statický popis modulů jednotlivých předmětů (UI texty, ne data uživatele).
export const SUBJECT_MODULES: Record<SubjectId, { tagline: string; modules: string[]; topicHint: string }> = {
  cj: {
    tagline: "Literatura + jazyk",
    modules: ["Povinná četba", "Autoři a literární směry", "Rozbory děl", "Jazykové prostředky", "Ústní rozbor díla"],
    topicHint: "Např. „Romeo a Julie – W. Shakespeare“ nebo literární okruh ze seznamu školy.",
  },
  en: {
    tagline: "Language trainer",
    modules: ["Slovní zásoba", "Gramatika", "Maturitní konverzační témata", "Speaking", "Hodnocení plynulosti"],
    topicHint: "Např. „Travelling“, „My hometown“, „Environment“…",
  },
  it: {
    tagline: "Technical lab",
    modules: ["Maturitní otázky", "Algoritmy krok za krokem", "SQL a databáze", "Sítě a protokoly", "Programovací úlohy"],
    topicHint: "Např. „Počítačové sítě – model ISO/OSI“.",
  },
  ma: {
    tagline: "Problem solver",
    modules: ["Databáze vzorců", "Typové příklady", "Postupné řešení", "Funkce, rovnice, geometrie", "Testy na čas"],
    topicHint: "Např. „Kvadratické rovnice a nerovnice“.",
  },
};

export const DIFFICULTY_LABELS = ["", "Velmi lehké", "Lehké", "Střední", "Těžké", "Velmi těžké"] as const;
