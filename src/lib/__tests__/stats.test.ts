import { describe, expect, it } from "vitest";
import { currentStreak, dailyMinutes, requiredPace, reviewRetention } from "@/lib/stats";

describe("dailyMinutes", () => {
  it("sečte sezení po dnech (pražský čas) a doplní prázdné dny", () => {
    const days = dailyMinutes(
      [
        { started_at: "2026-10-30T10:00:00Z", minutes: 25 },
        { started_at: "2026-10-30T23:30:00Z", minutes: 10 }, // v Praze už 31. 10.
      ],
      Array.from({ length: 12 }, () => ({ reviewed_at: "2026-10-29T10:00:00Z" })), // 12 × 10 s = 2 min
      "2026-10-31",
      4,
    );
    expect(days).toEqual([
      { date: "2026-10-28", minutes: 0 },
      { date: "2026-10-29", minutes: 2 },
      { date: "2026-10-30", minutes: 25 },
      { date: "2026-10-31", minutes: 10 },
    ]);
  });
});

describe("currentStreak", () => {
  const d = (m: number[]) => m.map((minutes, i) => ({ date: `2026-10-${10 + i}`, minutes }));
  it("počítá dny v řadě až do dneška", () => expect(currentStreak(d([0, 5, 10, 20]))).toBe(3));
  it("dnešní nula řadu nepřeruší", () => expect(currentStreak(d([5, 10, 0]))).toBe(2));
  it("včerejší nula ji přeruší", () => expect(currentStreak(d([5, 0, 0]))).toBe(0));
});

describe("reviewRetention / requiredPace", () => {
  it("úspěšnost bez dat je null", () => expect(reviewRetention([])).toBeNull());
  it("„Znovu“ je neúspěch", () => expect(reviewRetention([{ rating: 1 }, { rating: 3 }, { rating: 4 }, { rating: 2 }])).toBe(0.75));
  it("tempo: 14 témat za 14 dní = 7 týdně", () => expect(requiredPace(14, 14)).toBe(7));
  it("bez zkoušky žádné tempo", () => expect(requiredPace(5, null)).toBeNull());
});
