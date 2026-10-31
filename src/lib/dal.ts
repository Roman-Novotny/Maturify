import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SubjectId } from "@/lib/database.types";

/** Ověřený uživatel pro aktuální request (jinak přesměrování na login). */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
});

export const getProfile = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
});

export const getSubjects = cache(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("subjects").select("*").order("sort");
  if (error) throw error;
  return data;
});

export async function getSubject(id: string) {
  const subjects = await getSubjects();
  return subjects.find((s) => s.id === id) ?? null;
}

export const getTopics = cache(async (subjectId?: SubjectId) => {
  const { supabase } = await requireUser();
  let q = supabase.from("topics").select("*").order("sort").order("created_at");
  if (subjectId) q = q.eq("subject_id", subjectId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
});

export const getProgress = cache(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("user_progress").select("*");
  if (error) throw error;
  return data;
});

export const getExamDates = cache(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("exam_dates").select("*").order("exam_at");
  if (error) throw error;
  return data;
});

export async function getTasksForDate(date: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("study_tasks")
    .select("*")
    .eq("due_date", date)
    .order("done_at", { nullsFirst: true })
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function getRecentAttempts(limit = 5) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Fáze 2 – studijní systém
// ---------------------------------------------------------------------------
export async function getTopic(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("topics").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function getQuestions(topicId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("questions")
    .select("*, answers(id, body, is_reference)")
    .eq("topic_id", topicId)
    .order("created_at");
  if (error) throw error;
  return data.map(({ answers, ...q }) => ({
    ...q,
    reference: answers.find((a) => a.is_reference)?.body ?? null,
  }));
}

export async function getFlashcards(topicId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("flashcards").select("*").eq("topic_id", topicId).order("created_at");
  if (error) throw error;
  return data;
}

export async function getMaterials(topicId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const paths = data.map((m) => m.storage_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("materials").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return data.map((m) => ({ ...m, url: m.storage_path ? (urls.get(m.storage_path) ?? null) : null }));
}

export async function getTopicAttempts(topicId: string, limit = 30) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getTestRuns({ topicId, limit = 10 }: { topicId?: string; limit?: number } = {}) {
  const { supabase } = await requireUser();
  let q = supabase
    .from("test_runs")
    .select("*")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(limit);
  if (topicId) q = q.eq("topic_id", topicId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getDueFlashcards({ topicId, limit = 100 }: { topicId?: string; limit?: number } = {}) {
  const { supabase } = await requireUser();
  let q = supabase
    .from("flashcards")
    .select("*")
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(limit);
  if (topicId) q = q.eq("topic_id", topicId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export const countDueFlashcards = cache(async () => {
  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .lte("due_at", new Date().toISOString());
  return count ?? 0;
});

export async function getTopicCounts() {
  const { supabase } = await requireUser();
  const [q, c, m] = await Promise.all([
    supabase.from("questions").select("topic_id"),
    supabase.from("flashcards").select("topic_id"),
    supabase.from("materials").select("topic_id"),
  ]);
  const count = (rows: { topic_id: string | null }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) if (r.topic_id) map.set(r.topic_id, (map.get(r.topic_id) ?? 0) + 1);
    return map;
  };
  return { questions: count(q.data), cards: count(c.data), materials: count(m.data) };
}
