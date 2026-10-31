// Čistá logika připravenosti a denního plánu – bez I/O, ať jde snadno testovat.
// Fáze 1: jednoduchá heuristika. Ve Fázi 4 ji nahradí plánovač nad FSRS.

import type { ExamDate, Subject, SubjectId, Topic, UserProgress } from "@/lib/database.types";

export type SubjectReadiness = {
  subject: Subject;
  readiness: number; // 0–1
  topicCount: number;
  studiedCount: number;
};

export function computeReadiness(subjects: Subject[], topics: Topic[], progress: UserProgress[]) {
  const mastery = new Map(progress.map((p) => [p.topic_id, p]));

  const perSubject: SubjectReadiness[] = subjects.map((subject) => {
    const own = topics.filter((t) => t.subject_id === subject.id);
    const sum = own.reduce((acc, t) => acc + (mastery.get(t.id)?.mastery ?? 0), 0);
    return {
      subject,
      readiness: own.length ? sum / own.length : 0,
      topicCount: own.length,
      studiedCount: own.filter((t) => (mastery.get(t.id)?.attempts_count ?? 0) > 0).length,
    };
  });

  const withTopics = perSubject.filter((s) => s.topicCount > 0);
  const overall = withTopics.length ? withTopics.reduce((a, s) => a + s.readiness, 0) / withTopics.length : 0;

  return { overall, perSubject };
}

export type Suggestion = {
  topic: Topic;
  minutes: number;
  kind: "study" | "review";
  score: number;
  reason: string;
};

const DAY = 86_400_000;

/** Nejbližší budoucí zkouška pro předmět (nebo obecná, bez předmětu). */
export function nearestExam(exams: ExamDate[], subjectId: SubjectId | null, now = new Date()) {
  return exams
    .filter((e) => new Date(e.exam_at) > now && (e.subject_id === subjectId || e.subject_id === null))
    .sort((a, b) => a.exam_at.localeCompare(b.exam_at))[0];
}

export function rankTopics(topics: Topic[], progress: UserProgress[], exams: ExamDate[], now = new Date()) {
  const byTopic = new Map(progress.map((p) => [p.topic_id, p]));
  const isNew = (t: Topic) => (byTopic.get(t.id)?.attempts_count ?? 0) === 0;

  // Kolik témat předmětu ještě nikdy nebylo procvičeno – čím víc jich zbývá na málo dní, tím větší tlak.
  const unstudiedBySubject = new Map<SubjectId, number>();
  for (const t of topics) if (isNew(t)) unstudiedBySubject.set(t.subject_id, (unstudiedBySubject.get(t.subject_id) ?? 0) + 1);

  return topics
    .map((topic) => {
      const p = byTopic.get(topic.id);
      const mastery = p?.mastery ?? 0;
      const weakness = 1 - mastery;
      const difficulty = topic.difficulty / 5;
      const exam = nearestExam(exams, topic.subject_id, now);
      const daysToExam = exam ? (new Date(exam.exam_at).getTime() - now.getTime()) / DAY : 180;
      const urgency = 1 / (1 + daysToExam / 30);
      const reviewDue = p?.next_review_at ? new Date(p.next_review_at) <= now : false;
      const coverage = isNew(topic)
        ? Math.min(1, (unstudiedBySubject.get(topic.subject_id) ?? 0) / Math.max(daysToExam, 1))
        : 0;

      const score = weakness * 0.5 + difficulty * 0.15 + urgency * 0.2 + (reviewDue ? 0.15 : 0) + coverage * 0.3;

      let reason: string;
      if (coverage >= 0.5) reason = "Nestihneš probrat vše – začni hned";
      else if (!p || p.attempts_count === 0) reason = "Zatím neprocvičeno";
      else if (reviewDue) reason = "Je čas na opakování";
      else if (mastery < 0.5) reason = "Slabá oblast";
      else reason = "Udržování znalostí";

      return { topic, score, mastery, reviewDue, reason };
    })
    .sort((a, b) => b.score - a.score);
}

/** Rozdělí dostupné minuty mezi nejprioritnější témata (max. 1 blok na téma). */
export function suggestPlan(
  topics: Topic[],
  progress: UserProgress[],
  exams: ExamDate[],
  minutesAvailable: number,
  now = new Date(),
): Suggestion[] {
  const plan: Suggestion[] = [];
  let left = minutesAvailable;

  for (const r of rankTopics(topics, progress, exams, now)) {
    if (left < 10) break;
    const kind = r.reviewDue && r.mastery >= 0.5 ? "review" : "study";
    const wanted = kind === "review" ? 15 : r.mastery < 0.3 ? 35 : 25;
    const minutes = Math.min(wanted, left);
    plan.push({ topic: r.topic, minutes, kind, score: r.score, reason: r.reason });
    left -= minutes;
  }

  return plan;
}

/** Dostupné minuty pro datum (YYYY-MM-DD) podle dne v týdnu; index 0 = pondělí. */
export function minutesForDate(minutesByWeekday: number[], isoDate: string) {
  const weekday = (new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7;
  return minutesByWeekday[weekday] ?? 90;
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DayPlan = { date: string; minutes: number; items: Suggestion[] };

/**
 * Náhled plánu na další dny: každý den se sestaví z aktuálních priorit a pak se „předstírá“,
 * že ho student splnil (zvládnutí roste, opakování se posune). Plán se neukládá – při každém
 * zobrazení se přepočítá z reálného stavu, takže nesplněné dny nic nehromadí.
 */
export function planRange(
  topics: Topic[],
  progress: UserProgress[],
  exams: ExamDate[],
  minutesByWeekday: number[],
  startDate: string,
  days: number,
): DayPlan[] {
  const sim = new Map(progress.map((p) => [p.topic_id, { ...p }]));
  const out: DayPlan[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const now = new Date(`${date}T08:00:00Z`);
    const minutes = minutesForDate(minutesByWeekday, date);
    const items = suggestPlan(topics, [...sim.values()], exams, minutes, now);
    out.push({ date, minutes, items });

    for (const it of items) {
      const prev = sim.get(it.topic.id);
      const mastery = prev?.mastery ?? 0;
      const gained = it.kind === "review" ? mastery + (1 - mastery) * 0.1 : mastery + (1 - mastery) * 0.35;
      const interval = Math.max(1, Math.round(1 + gained * gained * 20));
      sim.set(it.topic.id, {
        user_id: prev?.user_id ?? "",
        topic_id: it.topic.id,
        mastery: gained,
        stability: interval,
        attempts_count: (prev?.attempts_count ?? 0) + 1,
        last_studied_at: now.toISOString(),
        next_review_at: new Date(now.getTime() + interval * DAY).toISOString(),
        updated_at: now.toISOString(),
      });
    }
  }
  return out;
}
