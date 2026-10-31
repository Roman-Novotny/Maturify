"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { buildTodayPlan } from "@/lib/plan-service";
import { recomputeTopicProgress } from "@/lib/progress";
import { todayISO } from "@/lib/utils";

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
  const { data: task, error } = await supabase
    .from("study_tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id, minutes, subject_id, topic_id")
    .single();
  if (error) throw error;

  // Splněný úkol = odučený čas (pro statistiky); odškrtnutí ho zase odebere.
  if (done) {
    await supabase
      .from("study_sessions")
      .upsert(
        { task_id: task.id, source: "task", minutes: task.minutes, subject_id: task.subject_id, topic_id: task.topic_id },
        { onConflict: "task_id", ignoreDuplicates: true },
      );
  } else {
    await supabase.from("study_sessions").delete().eq("task_id", task.id).eq("source", "task");
  }
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

/** Konec časovače u úkolu: zapíše skutečně odučené minuty a úkol označí jako hotový. */
export async function finishTimedTask(taskId: string, minutes: number) {
  const id = uuid.parse(taskId);
  const mins = z.number().int().min(1).max(600).parse(Math.round(minutes));
  const { supabase } = await requireUser();
  const { data: task, error } = await supabase
    .from("study_tasks")
    .update({ done_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, subject_id, topic_id")
    .single();
  if (error) throw error;
  await supabase.from("study_sessions").delete().eq("task_id", id);
  const { error: sErr } = await supabase
    .from("study_sessions")
    .insert({ task_id: id, source: "timer", minutes: mins, subject_id: task.subject_id, topic_id: task.topic_id });
  if (sErr) throw sErr;
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

/** Ruční přeplánování dneška (automaticky se plán sestaví sám při první návštěvě dne). */
export async function generateTodayPlan() {
  const { supabase } = await requireUser();
  await buildTodayPlan(supabase);
  revalidatePath("/plan");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

// ---------------------------------------------------------------------------
// Nastavení
// ---------------------------------------------------------------------------
const minutes = z.coerce.number().int().min(0, "Minuty nemůžou být záporné.").max(720, "Max. 720 minut denně.");
const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Zadej jméno.").max(60),
  m0: minutes,
  m1: minutes,
  m2: minutes,
  m3: minutes,
  m4: minutes,
  m5: minutes,
  m6: minutes,
  theme: z.enum(["dark", "light", "system"]),
  ai_enabled: z.preprocess((v) => v === "on", z.boolean()),
  ai_daily_limit_usd: z.coerce.number().min(0, "Limit nemůže být záporný.").max(100, "Limit max. 100 $."),
});

export async function saveProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { m0, m1, m2, m3, m4, m5, m6, ...rest } = parsed.data;
  const week = [m0, m1, m2, m3, m4, m5, m6];
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({
      ...rest,
      minutes_by_weekday: week,
      // Průměr pro starší místa, která pracují s jedním číslem.
      daily_minutes: Math.round(week.reduce((a, b) => a + b, 0) / 7),
    })
    .eq("id", user.id);
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
