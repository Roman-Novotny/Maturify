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
