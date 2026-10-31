"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { countDueFlashcards, getExamDates, getProfile, getProgress, getTopics, requireUser } from "@/lib/dal";
import { suggestPlan } from "@/lib/planner";
import { recomputeTopicProgress } from "@/lib/progress";
import { todayISO } from "@/lib/utils";

type StudyTaskInsert = Database["public"]["Tables"]["study_tasks"]["Insert"];

export type ActionState = { error?: string; ok?: boolean } | undefined;

const subjectId = z.enum(["cj", "en", "it", "ma"]);
const uuid = z.uuid();

function fail(error: unknown): ActionState {
  console.error(error);
  return { error: "Něco se nepovedlo. Zkus to znovu." };
}

// ---------------------------------------------------------------------------
// Témata
// ---------------------------------------------------------------------------
const topicSchema = z.object({
  subject_id: subjectId,
  title: z.string().trim().min(1, "Zadej název tématu.").max(200),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  difficulty: z.coerce.number().int().min(1).max(5).default(3),
});

export async function addTopic(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = topicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("topics")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", parsed.data.subject_id);
  const { error } = await supabase.from("topics").insert({ ...parsed.data, sort: count ?? 0 });
  if (error) return fail(error);

  revalidatePath(`/subjects/${parsed.data.subject_id}`);
  return { ok: true };
}

/** Hromadné vložení – jedno téma na řádek (např. zkopírovaný seznam otázek od učitele). */
export async function importTopics(_: ActionState, formData: FormData): Promise<ActionState> {
  const sid = subjectId.safeParse(formData.get("subject_id"));
  if (!sid.success) return { error: "Neplatný předmět." };

  const titles = String(formData.get("lines") ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 200);
  if (!titles.length) return { error: "Vlož aspoň jeden řádek." };
  if (titles.some((t) => t.length > 200)) return { error: "Některý řádek je delší než 200 znaků." };

  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("topics")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", sid.data);
  const start = count ?? 0;
  const { error } = await supabase
    .from("topics")
    .insert(titles.map((title, i) => ({ subject_id: sid.data, title, sort: start + i })));
  if (error) return fail(error);

  revalidatePath(`/subjects/${sid.data}`);
  return { ok: true };
}

export async function updateTopic(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = uuid.safeParse(formData.get("id"));
  const parsed = topicSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success) return { error: parsed.error?.issues[0]?.message ?? "Neplatné údaje." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("topics").update(parsed.data).eq("id", id.data);
  if (error) return fail(error);

  revalidatePath(`/subjects/${parsed.data.subject_id}`);
  return { ok: true };
}

export async function deleteTopic(formData: FormData) {
  const id = uuid.parse(formData.get("id"));
  const sid = subjectId.parse(formData.get("subject_id"));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("topics").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(`/subjects/${sid}`);
  revalidatePath("/dashboard");
}

/** Rychlé sebehodnocení tématu (0–5) → zápis pokusu + aktualizace zvládnutí. */
export async function rateTopic(formData: FormData) {
  const id = uuid.parse(formData.get("topic_id"));
  const rating = z.coerce.number().int().min(0).max(5).parse(formData.get("rating"));
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("attempts")
    .insert({ topic_id: id, score: rating / 5, confidence: Math.max(1, rating), graded_by: "self" });
  if (error) throw error;
  await recomputeTopicProgress(supabase, user.id, id);

  revalidatePath("/subjects", "layout");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Denní plán
// ---------------------------------------------------------------------------
const taskSchema = z.object({
  title: z.string().trim().min(1, "Zadej úkol.").max(200),
  minutes: z.coerce.number().int().min(1).max(600).default(25),
  subject_id: z.union([subjectId, z.literal("")]).transform((v) => v || null).optional(),
});

export async function addTask(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("study_tasks")
    .insert({ ...parsed.data, kind: "custom", due_date: todayISO() });
  if (error) return fail(error);

  revalidatePath("/plan");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleTask(formData: FormData) {
  const id = uuid.parse(formData.get("id"));
  const done = formData.get("done") === "true";
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("study_tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

export async function deleteTask(formData: FormData) {
  const id = uuid.parse(formData.get("id"));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("study_tasks").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

/**
 * Vygeneruje dnešní plán. Nehotové úkoly z minulých dnů se nepřenáší a nehromadí –
 * plán se vždy skládá znovu z aktuálních priorit (jen nehotové automatické úkoly dneška se nahradí).
 */
export async function generateTodayPlan() {
  const { supabase } = await requireUser();
  const [topics, progress, exams, profile, dueCards] = await Promise.all([
    getTopics(),
    getProgress(),
    getExamDates(),
    getProfile(),
    countDueFlashcards(),
  ]);
  const date = todayISO();

  const { data: existing } = await supabase.from("study_tasks").select("*").eq("due_date", date);
  const doneMinutes = (existing ?? []).filter((t) => t.done_at).reduce((a, t) => a + t.minutes, 0);
  const keptManual = (existing ?? []).filter((t) => !t.done_at && t.kind === "custom");
  const manualMinutes = keptManual.reduce((a, t) => a + t.minutes, 0);
  const doneTopicIds = new Set((existing ?? []).filter((t) => t.done_at && t.topic_id).map((t) => t.topic_id));

  // Kartičky na řadě mají přednost – opakování je levné a zabraňuje zapomínání.
  const cardsDoneToday = (existing ?? []).some((t) => t.done_at && t.kind === "review" && !t.topic_id);
  const cardMinutes = dueCards > 0 && !cardsDoneToday ? Math.min(30, Math.max(5, Math.ceil(dueCards * 0.4))) : 0;
  const available = Math.max(0, (profile?.daily_minutes ?? 90) - doneMinutes - manualMinutes - cardMinutes);
  const suggestions = suggestPlan(
    topics.filter((t) => !doneTopicIds.has(t.id)),
    progress,
    exams,
    available,
  );

  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .upsert({ plan_date: date, minutes_available: profile?.daily_minutes ?? 90 }, { onConflict: "user_id,plan_date" })
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
    if (error) throw error;
  }

  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Nastavení
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Zadej jméno.").max(60),
  daily_minutes: z.coerce.number().int().min(0).max(720),
  theme: z.enum(["dark", "light", "system"]),
  ai_enabled: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return fail(error);

  revalidatePath("/", "layout");
  return { ok: true };
}

const examSchema = z.object({
  label: z.string().trim().min(1, "Zadej název zkoušky.").max(120),
  kind: z.enum(["written", "oral", "other"]),
  subject_id: z.union([subjectId, z.literal("")]).transform((v) => v || null),
  exam_at: z.iso.date("Zadej datum."),
});

export async function addExam(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = examSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { supabase } = await requireUser();
  // 8:00 pražského času – maturitní zkoušky obvykle začínají ráno.
  const { error } = await supabase
    .from("exam_dates")
    .insert({ ...parsed.data, exam_at: `${parsed.data.exam_at}T08:00:00+02:00` });
  if (error) return fail(error);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExam(formData: FormData) {
  const id = uuid.parse(formData.get("id"));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("exam_dates").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
