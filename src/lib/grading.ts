// Automatické hodnocení uzavřených otázek + výpočet zvládnutí tématu z historie.

import type { Attempt, Flashcard, Question } from "@/lib/database.types";
import { retrievability } from "@/lib/srs";

/** „3,5“ i „3.5“ i „ 1 000 “ → číslo. */
export function parseNumber(input: string) {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(normalized)) return null;
  return Number(normalized);
}

/** Vrací skóre 0–1, nebo null, když otázku nejde ohodnotit automaticky (otevřená/ústní). */
export function autoGrade(q: Pick<Question, "kind" | "correct_option" | "numeric_answer" | "tolerance">, answer: string) {
  if (q.kind === "choice") return Number(answer) === q.correct_option ? 1 : 0;
  if (q.kind === "numeric") {
    const value = parseNumber(answer);
    if (value === null || q.numeric_answer === null) return 0;
    const tol = Math.max(q.tolerance, 1e-9);
    return Math.abs(value - q.numeric_answer) <= tol ? 1 : 0;
  }
  return null;
}

const DAY = 86_400_000;

/**
 * Zvládnutí tématu 0–1.
 * - Pokusy (testy, sebehodnocení): vážený průměr posledních 20, novější váží víc (polovina váhy po 14 dnech).
 *   Hodnocení s nízkou jistotou se lehce penalizuje.
 * - Kartičky: průměrná aktuální pravděpodobnost vybavení (nové kartičky = 0).
 * Když jsou obojí, pokusy 70 %, kartičky 30 %.
 */
export function computeMastery(
  attempts: Pick<Attempt, "score" | "confidence" | "created_at">[],
  cards: Pick<Flashcard, "stability" | "last_review_at" | "reps">[],
  now = new Date(),
) {
  const scored = attempts
    .filter((a) => a.score !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);

  let attemptScore: number | null = null;
  if (scored.length) {
    let sum = 0;
    let weights = 0;
    for (const a of scored) {
      const ageDays = (now.getTime() - new Date(a.created_at).getTime()) / DAY;
      const w = Math.pow(0.5, ageDays / 14);
      const confidencePenalty = a.confidence && a.confidence <= 2 ? 0.85 : 1;
      sum += (a.score ?? 0) * confidencePenalty * w;
      weights += w;
    }
    attemptScore = weights ? sum / weights : 0;
  }

  let cardScore: number | null = null;
  if (cards.length) {
    const total = cards.reduce((acc, c) => {
      if (!c.reps || !c.last_review_at) return acc;
      const elapsed = (now.getTime() - new Date(c.last_review_at).getTime()) / DAY;
      return acc + retrievability(elapsed, c.stability);
    }, 0);
    cardScore = total / cards.length;
  }

  if (attemptScore !== null && cardScore !== null) return attemptScore * 0.7 + cardScore * 0.3;
  return attemptScore ?? cardScore ?? 0;
}

/** Interval dalšího opakování tématu – čím lepší zvládnutí, tím delší (1–21 dní). */
export function topicReviewIntervalDays(mastery: number) {
  return Math.max(1, Math.round(1 + mastery * mastery * 20));
}
