import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Subject, Topic, UserProgress } from "@/lib/database.types";
import { computeReadiness, minutesForDate, suggestPlan } from "@/lib/planner";
import { todayISO } from "@/lib/utils";

type Db = SupabaseClient<Database>;
type StudyTaskInsert = Database["public"]["Tables"]["study_tasks"]["Insert"];

/**
 * Sestaví (nebo přeplánuje) dnešní plán. Nesplněné úkoly z minulých dnů se nepřenáší
 * a nehromadí; dnešní hotové a vlastní úkoly zůstanou, automatické nehotové se nahradí.
 */
export async function buildTodayPlan(supabase: Db) {
  const date = todayISO();
  const now = new Date();
  const [topicsRes, progressRes, examsRes, profileRes, dueRes, existingRes] = await Promise.all([
    supabase.from("topics").select("*"),
    supabase.from("user_progress").select("*"),
    supabase.from("exam_dates").select("*"),
    supabase.from("profiles").select("minutes_by_weekday").single(),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).lte("due_at", now.toISOString()),
    supabase.from("study_tasks").select("*").eq("due_date", date),
  ]);
  const topics = topicsRes.data ?? [];
  const existing = existingRes.data ?? [];
  const dueCards = dueRes.count ?? 0;
  const budget = minutesForDate(profileRes.data?.minutes_by_weekday ?? [90, 90, 90, 90, 90, 120, 120], date);

  const doneMinutes = existing.filter((t) => t.done_at).reduce((a, t) => a + t.minutes, 0);
  const manualMinutes = existing.filter((t) => !t.done_at && t.kind === "custom").reduce((a, t) => a + t.minutes, 0);
  const doneTopicIds = new Set(existing.filter((t) => t.done_at && t.topic_id).map((t) => t.topic_id));

  // Kartičky na řadě mají přednost – opakování je levné a zabraňuje zapomínání.
  const cardsDoneToday = existing.some((t) => t.done_at && t.kind === "review" && !t.topic_id);
  const cardMinutes = dueCards > 0 && !cardsDoneToday ? Math.min(30, Math.max(5, Math.ceil(dueCards * 0.4))) : 0;
  const available = Math.max(0, budget - doneMinutes - manualMinutes - cardMinutes);
  const suggestions = suggestPlan(
    topics.filter((t) => !doneTopicIds.has(t.id)),
    progressRes.data ?? [],
    examsRes.data ?? [],
    available,
    now,
  );

  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .upsert({ plan_date: date, minutes_available: budget }, { onConflict: "user_id,plan_date" })
    .select()
    .single();
  if (planError) throw planError;

  const { error: delError } = await supabase
    .from("study_tasks")
    .delete()
    .eq("due_date", date)
    .is("done_at", null)
    .neq("kind", "custom");
  if (delError) throw delError;

  const rows: StudyTaskInsert[] = suggestions.map((s) => ({
    plan_id: plan.id,
    topic_id: s.topic.id,
    subject_id: s.topic.subject_id,
    title: `${s.kind === "review" ? "Opakuj" : "Nauč se"}: ${s.topic.title}`,
    kind: s.kind,
    minutes: s.minutes,
    due_date: date,
  }));
  if (cardMinutes) {
    rows.unshift({
      plan_id: plan.id,
      topic_id: null,
      subject_id: null,
      title: `Opakuj kartičky (${dueCards})`,
      kind: "review",
      minutes: cardMinutes,
      due_date: date,
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("study_tasks").insert(rows);
    // 23505 = plán mezitím sestavil souběžný požadavek (unikátní index study_tasks_auto_uniq).
    if (error && error.code !== "23505") throw error;
  }
}

/**
 * Automatický denní plán: sestaví se sám, když na dnešek nejsou žádné úkoly (první návštěva dne,
 * nebo když student přidal první témata až po otevření appky). Jakmile úkoly jsou, nechá je být.
 */
export async function ensureTodayPlan(supabase: Db, hasTopics: boolean) {
  if (!hasTopics) return false;
  const { count } = await supabase
    .from("study_tasks")
    .select("id", { count: "exact", head: true })
    .eq("due_date", todayISO());
  if (count) return false;
  await buildTodayPlan(supabase);
  return true;
}

/** Uloží dnešní připravenost (jeden řádek na den, přepisuje se) – pro graf vývoje. */
export async function recordReadinessSnapshot(supabase: Db, subjects: Subject[], topics: Topic[], progress: UserProgress[]) {
  if (!topics.length) return;
  const { overall, perSubject } = computeReadiness(subjects, topics, progress);
  const by_subject = Object.fromEntries(perSubject.filter((s) => s.topicCount > 0).map((s) => [s.subject.id, s.readiness]));
  const { error } = await supabase
    .from("readiness_snapshots")
    .upsert({ snap_date: todayISO(), overall, by_subject }, { onConflict: "user_id,snap_date" });
  if (error) console.error("readiness snapshot", error);
}
