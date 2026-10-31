import { describe, expect, it } from "vitest";
import type { ExamDate, Topic, UserProgress } from "@/lib/database.types";
import { minutesForDate, planRange, suggestPlan } from "@/lib/planner";

const now = new Date("2026-11-01T10:00:00Z");
const topic = (id: string, difficulty = 3): Topic => ({
  id, user_id: "u", subject_id: "it", title: id, description: null, difficulty, sort: 0,
  created_at: "", updated_at: "",
});
const prog = (topic_id: string, mastery: number): UserProgress => ({
  user_id: "u", topic_id, mastery, stability: 1, attempts_count: 1,
  last_studied_at: null, next_review_at: "2027-01-01T00:00:00Z", updated_at: "",
});

describe("suggestPlan", () => {
  it("nejslabší téma je první a plán se vejde do času", () => {
    const topics = [topic("silne"), topic("slabe"), topic("stredni")];
    const progress = [prog("silne", 0.9), prog("slabe", 0.1), prog("stredni", 0.5)];
    const plan = suggestPlan(topics, progress, [] as ExamDate[], 60, now);
    expect(plan[0].topic.id).toBe("slabe");
    expect(plan.reduce((a, p) => a + p.minutes, 0)).toBeLessThanOrEqual(60);
  });
  it("bez času žádný plán", () => {
    expect(suggestPlan([topic("a")], [], [], 5, now)).toHaveLength(0);
  });
});

describe("minutesForDate / planRange", () => {
  it("bere minuty podle dne v týdnu (pondělí = index 0)", () => {
    const week = [10, 20, 30, 40, 50, 60, 70];
    expect(minutesForDate(week, "2026-11-02")).toBe(10); // pondělí
    expect(minutesForDate(week, "2026-11-08")).toBe(70); // neděle
  });

  it("simulace rozloží neprobraná témata do dalších dnů místo opakování stejného", () => {
    const topics = ["a", "b", "c", "d"].map((id) => topic(id));
    const days = planRange(topics, [], [], [25, 25, 25, 25, 25, 25, 25], "2026-11-02", 4);
    const firstDays = days.map((d) => d.items[0]?.topic.id);
    expect(new Set(firstDays).size).toBe(4);
  });

  it("blízká zkouška s mnoha neprobranými tématy je dá dopředu", () => {
    const fresh = ["n1", "n2", "n3", "n4", "n5", "n6"].map((id) => topic(id));
    const known = topic("zname", 5);
    const exam: ExamDate = {
      id: "e", user_id: "u", subject_id: "it", kind: "oral", label: "Ústní", exam_at: "2026-11-05T08:00:00Z", created_at: "",
    };
    const ranked = suggestPlan([known, ...fresh], [prog("zname", 0.2)], [exam], 30, now);
    expect(ranked[0].topic.id).toMatch(/^n/);
    expect(ranked[0].reason).toContain("Nestihneš");
  });
});
