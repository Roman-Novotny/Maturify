import { describe, expect, it } from "vitest";
import { retrievability, schedule } from "@/lib/srs";

const now = new Date("2026-11-01T10:00:00Z");
const fresh = { stability: 0, difficulty: 5, reps: 0, lapses: 0, state: "new" as const, last_review_at: null, due_at: now.toISOString() };
const days = (iso: string) => (new Date(iso).getTime() - now.getTime()) / 86_400_000;

describe("FSRS schedule", () => {
  it("nová karta: Znovu → za minutu, learning", () => {
    const r = schedule(fresh, 1, now);
    expect(r.state).toBe("learning");
    expect(days(r.due_at) * 1440).toBeCloseTo(1);
  });

  it("nová karta: Dobře → review, Snadné dává delší interval než Dobře", () => {
    const good = schedule(fresh, 3, now);
    const easy = schedule(fresh, 4, now);
    expect(good.state).toBe("review");
    expect(days(easy.due_at)).toBeGreaterThan(days(good.due_at));
    expect(easy.difficulty).toBeLessThan(good.difficulty);
  });

  it("úspěšné opakování v čase prodlužuje interval", () => {
    const first = schedule(fresh, 3, now);
    const later = new Date(first.due_at);
    const second = schedule(first, 3, later);
    const gap = (new Date(second.due_at).getTime() - later.getTime()) / 86_400_000;
    expect(gap).toBeGreaterThan(days(first.due_at));
  });

  it("zapomenutí v review → relearning, lapse a nižší stabilita", () => {
    const first = schedule(fresh, 3, now);
    const lapse = schedule(first, 1, new Date(first.due_at));
    expect(lapse.state).toBe("relearning");
    expect(lapse.lapses).toBe(1);
    expect(lapse.stability).toBeLessThanOrEqual(first.stability);
  });

  it("obtížnost zůstává v rozsahu 1–10", () => {
    let card = schedule(fresh, 1, now);
    for (let i = 0; i < 20; i++) card = { ...schedule(card, 1, now) };
    expect(card.difficulty).toBeLessThanOrEqual(10);
    expect(card.difficulty).toBeGreaterThanOrEqual(1);
  });

  it("retrievability = 0.9 po uplynutí stability", () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 2);
  });
});
