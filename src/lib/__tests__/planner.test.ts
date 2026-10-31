import { describe, expect, it } from "vitest";
import type { ExamDate, Topic, UserProgress } from "@/lib/database.types";
import { suggestPlan } from "@/lib/planner";

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
