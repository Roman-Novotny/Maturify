import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { computeMastery, topicReviewIntervalDays } from "@/lib/grading";

const DAY = 86_400_000;

/** Přepočítá user_progress tématu z celé historie (pokusy + kartičky). Jediné místo, kde se zvládnutí zapisuje. */
export async function recomputeTopicProgress(supabase: SupabaseClient<Database>, userId: string, topicId: string) {
  const [attemptsRes, cardsRes] = await Promise.all([
    supabase
      .from("attempts")
      .select("score, confidence, created_at")
      .eq("topic_id", topicId)
      .not("score", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("flashcards").select("stability, last_review_at, reps, due_at").eq("topic_id", topicId),
  ]);
  if (attemptsRes.error) throw attemptsRes.error;
  if (cardsRes.error) throw cardsRes.error;

  const attempts = attemptsRes.data;
  const cards = cardsRes.data;
  const now = new Date();
  const mastery = computeMastery(attempts, cards, now);

  const lastAttempt = attempts[0]?.created_at ?? null;
  const lastCard = cards.map((c) => c.last_review_at).filter(Boolean).sort().at(-1) ?? null;
  const lastStudied = [lastAttempt, lastCard].filter(Boolean).sort().at(-1) ?? null;

  const interval = topicReviewIntervalDays(mastery);
  const fromStudy = lastStudied ? new Date(new Date(lastStudied).getTime() + interval * DAY).toISOString() : null;
  const earliestCardDue = cards.filter((c) => c.reps > 0).map((c) => c.due_at).sort()[0] ?? null;
  const nextReview = [fromStudy, earliestCardDue].filter(Boolean).sort()[0] ?? null;

  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topicId);

  const { error } = await supabase.from("user_progress").upsert({
    user_id: userId,
    topic_id: topicId,
    mastery,
    stability: interval,
    attempts_count: (count ?? 0) + cards.reduce((a, c) => a + c.reps, 0),
    last_studied_at: lastStudied,
    next_review_at: nextReview,
  });
  if (error) throw error;
  return mastery;
}
