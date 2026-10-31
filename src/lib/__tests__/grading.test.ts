import { describe, expect, it } from "vitest";
import { autoGrade, computeMastery, parseNumber } from "@/lib/grading";

describe("parseNumber", () => {
  it("bere desetinnou čárku i mezery", () => {
    expect(parseNumber("3,5")).toBe(3.5);
    expect(parseNumber(" 1 000 ")).toBe(1000);
    expect(parseNumber("-0.25")).toBe(-0.25);
  });
  it("odmítne nesmysl", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1,2,3")).toBeNull();
  });
});

describe("autoGrade", () => {
  it("výběr z možností", () => {
    const q = { kind: "choice" as const, correct_option: 2, numeric_answer: null, tolerance: 0 };
    expect(autoGrade(q, "2")).toBe(1);
    expect(autoGrade(q, "0")).toBe(0);
  });
  it("číselná s tolerancí", () => {
    const q = { kind: "numeric" as const, correct_option: null, numeric_answer: 3.14, tolerance: 0.01 };
    expect(autoGrade(q, "3,14")).toBe(1);
    expect(autoGrade(q, "3.15")).toBe(1);
    expect(autoGrade(q, "3.2")).toBe(0);
  });
  it("otevřená se automaticky nehodnotí", () => {
    expect(autoGrade({ kind: "open", correct_option: null, numeric_answer: null, tolerance: 0 }, "x")).toBeNull();
  });
});

describe("computeMastery", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  it("bez dat = 0", () => {
    expect(computeMastery([], [], now)).toBe(0);
  });
  it("novější pokusy váží víc", () => {
    const old = { score: 0, confidence: 3, created_at: "2026-09-01T10:00:00Z" };
    const recent = { score: 1, confidence: 3, created_at: "2026-11-01T09:00:00Z" };
    expect(computeMastery([old, recent], [], now)).toBeGreaterThan(0.9);
  });
  it("nové kartičky stahují zvládnutí dolů", () => {
    const a = [{ score: 1, confidence: 5, created_at: "2026-11-01T09:00:00Z" }];
    const cards = [{ stability: 0, last_review_at: null, reps: 0 }];
    expect(computeMastery(a, cards, now)).toBeCloseTo(0.7);
  });
});
