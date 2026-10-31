// Plánování opakování kartiček podle FSRS (Free Spaced Repetition Scheduler, v5, výchozí váhy).
// Čistá funkce: dostane stav kartičky + hodnocení, vrátí nový stav. Bez I/O.

import type { Flashcard } from "@/lib/database.types";

export type Rating = 1 | 2 | 3 | 4; // Znovu, Těžké, Dobré, Snadné
export const RATING_LABELS: Record<Rating, string> = { 1: "Znovu", 2: "Těžké", 3: "Dobře", 4: "Snadné" };

const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const TARGET_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 365;
const MINUTE = 60_000;
const DAY = 86_400_000;

type CardState = Pick<Flashcard, "stability" | "difficulty" | "reps" | "lapses" | "state" | "last_review_at" | "due_at">;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pravděpodobnost vybavení po t dnech při stabilitě S. */
export function retrievability(elapsedDays: number, stability: number) {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function nextInterval(stability: number) {
  const days = (stability / FACTOR) * (Math.pow(TARGET_RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(days), 1, MAX_INTERVAL_DAYS);
}

const initStability = (g: Rating) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g: Rating) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d: number, g: Rating) {
  const delta = -W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 1, 10);
}

function recallStability(d: number, s: number, r: number, g: Rating) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
}

function forgetStability(d: number, s: number, r: number) {
  const f = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
  return Math.min(f, s);
}

const shortTermStability = (s: number, g: Rating) => s * Math.exp(W[17] * (g - 3 + W[18]));

export function schedule(card: CardState, g: Rating, now = new Date()) {
  const t = now.getTime();
  let { stability: s, difficulty: d, lapses, state } = card;
  let dueMs: number;

  if (state === "new") {
    s = initStability(g);
    d = initDifficulty(g);
    if (g === 1) { state = "learning"; dueMs = MINUTE; }
    else if (g === 2) { state = "learning"; dueMs = 6 * MINUTE; }
    else { state = "review"; dueMs = nextInterval(s) * DAY; }
  } else if (state === "learning" || state === "relearning") {
    s = shortTermStability(s, g);
    d = nextDifficulty(d, g);
    if (g === 1) dueMs = 5 * MINUTE;
    else if (g === 2) dueMs = 10 * MINUTE;
    else { state = "review"; dueMs = nextInterval(s) * DAY; }
  } else {
    const elapsed = card.last_review_at ? Math.max(0, (t - new Date(card.last_review_at).getTime()) / DAY) : 0;
    const r = retrievability(elapsed, s);
    d = nextDifficulty(d, g);
    if (g === 1) {
      s = forgetStability(d, s, r);
      lapses += 1;
      state = "relearning";
      dueMs = 10 * MINUTE;
    } else {
      s = recallStability(card.difficulty, s, r, g);
      dueMs = nextInterval(s) * DAY;
    }
  }

  return {
    stability: s,
    difficulty: d,
    reps: card.reps + 1,
    lapses,
    state,
    last_review_at: now.toISOString(),
    due_at: new Date(t + dueMs).toISOString(),
  };
}

/** Lidsky čitelný interval pro tlačítka („10 min“, „3 d“, „2 měs.“). */
export function previewInterval(card: CardState, g: Rating, now = new Date()) {
  const ms = new Date(schedule(card, g, now).due_at).getTime() - now.getTime();
  if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))} h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days} d`;
  return `${Math.round(days / 30)} měs.`;
}
