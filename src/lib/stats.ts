// Výpočty pro statistiky – čisté funkce nad řádky z DB.

import { addDays } from "@/lib/planner";

/** Kartička se v průměru opakuje ~10 s – tolik se jí připočte do odučeného času. */
const SECONDS_PER_REVIEW = 10;

const pragueDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date(iso));

export type DayMinutes = { date: string; minutes: number };

/** Odučené minuty po dnech (posledních `days` dní končících `endDate`, vč. dní s nulou). */
export function dailyMinutes(
  sessions: { started_at: string; minutes: number }[],
  reviews: { reviewed_at: string }[],
  endDate: string,
  days: number,
): DayMinutes[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const d = pragueDate(s.started_at);
    map.set(d, (map.get(d) ?? 0) + s.minutes);
  }
  for (const r of reviews) {
    const d = pragueDate(r.reviewed_at);
    map.set(d, (map.get(d) ?? 0) + SECONDS_PER_REVIEW / 60);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(endDate, i - days + 1);
    return { date, minutes: Math.round(map.get(date) ?? 0) };
  });
}

/** Počet dní v řadě s aspoň minutou učení; dnešek se nepočítá jako přerušení, dokud neskončí. */
export function currentStreak(days: DayMinutes[]) {
  let i = days.length - 1;
  if (i >= 0 && days[i].minutes === 0) i--; // dnes ještě nic → řada platí od včerejška
  let streak = 0;
  for (; i >= 0 && days[i].minutes > 0; i--) streak++;
  return streak;
}

/** Úspěšnost opakování kartiček = podíl hodnocení jiných než „Znovu“. */
export function reviewRetention(reviews: { rating: number }[]) {
  if (!reviews.length) return null;
  return reviews.filter((r) => r.rating > 1).length / reviews.length;
}

export function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Potřebné tempo do zkoušky: kolik dosud neprocvičených témat je třeba zvládnout týdně.
 * Vrací null, když zkouška není nebo už proběhla.
 */
export function requiredPace(unstudiedTopics: number, daysToExam: number | null) {
  if (daysToExam === null || daysToExam <= 0) return null;
  return (unstudiedTopics / daysToExam) * 7;
}
