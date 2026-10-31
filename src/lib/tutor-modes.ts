import { BookOpenCheck, GraduationCap, MessageCircleQuestion, PenLine } from "lucide-react";
import type { TutorMode } from "@/lib/database.types";

// Sdílené pro server i klient – nesmí být v souboru s "use client", jinak by server dostal jen referenci.
export const MODE_INFO: Record<TutorMode, { label: string; text: string; icon: typeof PenLine; placeholder: string; starter?: string }> = {
  explain: {
    label: "Vysvětli mi",
    text: "Vysvětlí látku jednoduše, postupně a na příkladech.",
    icon: MessageCircleQuestion,
    placeholder: "Co ti mám vysvětlit?",
  },
  quiz: {
    label: "Vyzkoušej mě",
    text: "Pokládá otázky a čeká na tvoje odpovědi.",
    icon: BookOpenCheck,
    placeholder: "Odpověz…",
    starter: "Vyzkoušej mě z tohoto tématu.",
  },
  exam: {
    label: "Zkoušení jako u maturity",
    text: "Simulace ústní zkoušky s doplňujícími otázkami.",
    icon: GraduationCap,
    placeholder: "Mluv jako u maturity… (napiš „konec“ pro hodnocení)",
    starter: "Jsem připraven/a, můžeme začít zkoušení.",
  },
  correct: {
    label: "Oprav mou odpověď",
    text: "Vyhodnotí odpověď podle vzorové odpovědi a vysvětlí chyby.",
    icon: PenLine,
    placeholder: "Vlož otázku a svou odpověď…",
  },
};
