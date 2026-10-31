"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "./actions";
import type { SubjectId } from "@/lib/database.types";
import { requireUser } from "@/lib/dal";
import { autoGrade } from "@/lib/grading";
import { processMaterial } from "@/lib/materials";
import { recomputeTopicProgress } from "@/lib/progress";
import { schedule, type Rating } from "@/lib/srs";

const uuid = z.uuid();
const subjectId = z.enum(["cj", "en", "it", "ma"]);

function fail(error: unknown): ActionState {
  console.error(error);
  return { error: "Něco se nepovedlo. Zkus to znovu." };
}

async function topicPath(topicId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("topics").select("subject_id").eq("id", topicId).single();
  return data ? `/subjects/${data.subject_id}/topics/${topicId}` : "/subjects";
}

// ---------------------------------------------------------------------------
// Otázky
// ---------------------------------------------------------------------------
const questionBase = z.object({
  topic_id: uuid,
  prompt: z.string().trim().min(1, "Zadej znění otázky.").max(5000),
  kind: z.enum(["open", "choice", "numeric", "oral"]),
  difficulty: z.coerce.number().int().min(1).max(5).default(3),
  source: z.string().trim().max(200).optional().transform((v) => v || null),
  reference: z.string().trim().max(20000).optional().transform((v) => v || null),
  options: z.string().optional(),
  numeric_answer: z.string().optional(),
  tolerance: z.string().optional(),
});

/** Možnosti: jedna na řádek, správná začíná hvězdičkou. */
function parseOptions(raw: string | undefined) {
  const lines = (raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const correct = lines.findIndex((l) => l.startsWith("*"));
  return { options: lines.map((l) => l.replace(/^\*\s*/, "")), correct };
}

function buildQuestion(input: z.infer<typeof questionBase>) {
  const base = {
    topic_id: input.topic_id,
    prompt: input.prompt,
    kind: input.kind,
    difficulty: input.difficulty,
    source: input.source,
    options: null as string[] | null,
    correct_option: null as number | null,
    numeric_answer: null as number | null,
    tolerance: 0,
  };

  if (input.kind === "choice") {
    const { options, correct } = parseOptions(input.options);
    if (options.length < 2) return { error: "Zadej aspoň dvě možnosti (každou na nový řádek)." } as const;
    if (correct < 0) return { error: "Označ správnou možnost hvězdičkou na začátku řádku (*)." } as const;
    return { data: { ...base, options, correct_option: correct } } as const;
  }

  if (input.kind === "numeric") {
    const value = Number((input.numeric_answer ?? "").replace(",", "."));
    const tol = Number((input.tolerance ?? "0").replace(",", ".") || 0);
    if (!input.numeric_answer || Number.isNaN(value)) return { error: "Zadej správný číselný výsledek." } as const;
    if (Number.isNaN(tol) || tol < 0) return { error: "Tolerance musí být nezáporné číslo." } as const;
    return { data: { ...base, numeric_answer: value, tolerance: tol } } as const;
  }

  return { data: base } as const;
}

export async function saveQuestion(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = questionBase.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const built = buildQuestion(parsed.data);
  if ("error" in built) return { error: built.error };

  const id = formData.get("id") ? uuid.safeParse(formData.get("id")) : null;
  if (id && !id.success) return { error: "Neplatná otázka." };

  const { supabase } = await requireUser();
  let questionId: string;
  if (id) {
    const { error } = await supabase.from("questions").update(built.data).eq("id", id.data);
    if (error) return fail(error);
    questionId = id.data;
  } else {
    const { data, error } = await supabase.from("questions").insert(built.data).select("id").single();
    if (error) return fail(error);
    questionId = data.id;
  }

  // Vzorová odpověď / vysvětlení – jedna referenční odpověď na otázku.
  const { data: existing } = await supabase
    .from("answers")
    .select("id")
    .eq("question_id", questionId)
    .eq("is_reference", true)
    .maybeSingle();
  if (parsed.data.reference) {
    const { error } = existing
      ? await supabase.from("answers").update({ body: parsed.data.reference }).eq("id", existing.id)
      : await supabase.from("answers").insert({ question_id: questionId, body: parsed.data.reference });
    if (error) return fail(error);
  } else if (existing) {
    await supabase.from("answers").delete().eq("id", existing.id);
  }

  revalidatePath(await topicPath(parsed.data.topic_id));
  return { ok: true };
}

/** Hromadný import: „otázka | vzorová odpověď“ na řádek (odpověď je volitelná). */
export async function importQuestions(_: ActionState, formData: FormData): Promise<ActionState> {
  const topicId = uuid.safeParse(formData.get("topic_id"));
  if (!topicId.success) return { error: "Neplatné téma." };
  const kind = formData.get("kind") === "oral" ? "oral" : "open";

  const rows = String(formData.get("lines") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 300)
    .map((line) => {
      const [prompt, ...rest] = line.split("|");
      return { prompt: prompt.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim(), reference: rest.join("|").trim() };
    })
    .filter((r) => r.prompt);
  if (!rows.length) return { error: "Vlož aspoň jednu otázku." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("questions")
    .insert(rows.map((r) => ({ topic_id: topicId.data, prompt: r.prompt, kind })))
    .select("id");
  if (error) return fail(error);

  const answers = data.flatMap((q, i) => (rows[i].reference ? [{ question_id: q.id, body: rows[i].reference }] : []));
  if (answers.length) {
    const { error: aErr } = await supabase.from("answers").insert(answers);
    if (aErr) return fail(aErr);
  }

  revalidatePath(await topicPath(topicId.data));
  return { ok: true };
}

export async function deleteQuestion(formData: FormData) {
  const id = uuid.parse(formData.get("id"));
  const topicId = uuid.parse(formData.get("topic_id"));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) throw error;
  revalidatePath(await topicPath(topicId));
}

// ---------------------------------------------------------------------------
// Kartičky
// ---------------------------------------------------------------------------
const cardSchema = z.object({
  topic_id: uuid,
  front: z.string().trim().min(1, "Vyplň přední stranu.").max(2000),
  back: z.string().trim().min(1, "Vyplň zadní stranu.").max(5000),
});

export async function saveFlashcard(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const id = formData.get("id") ? uuid.safeParse(formData.get("id")) : null;
  if (id && !id.success) return { error: "Neplatná kartička." };

  const { supabase } = await requireUser();
  const { error } = id
    ? await supabase.from("flashcards").update({ front: parsed.data.front, back: parsed.data.back }).eq("id", id.data)
    : await supabase.from("flashcards").insert(parsed.data);
  if (error) return fail(error);

  revalidatePath(await topicPath(parsed.data.topic_id));
  return { ok: true };
}

/** Hromadný import: „přední ; zadní“ (nebo tabulátor, např. zkopírované z Excelu/Quizletu). */
export async function importFlashcards(_: ActionState, formData: FormData): Promise<ActionState> {
  const topicId = uuid.safeParse(formData.get("topic_id"));
  if (!topicId.success) return { error: "Neplatné téma." };

  const rows = String(formData.get("lines") ?? "")
    .split(/\r?\n/)
    .map((l) => l.split(/\t|\s;\s|;/))
    .filter((parts) => parts.length >= 2 && parts[0].trim() && parts.slice(1).join(";").trim())
    .slice(0, 500)
    .map((parts) => ({ topic_id: topicId.data, front: parts[0].trim(), back: parts.slice(1).join(";").trim() }));
  if (!rows.length) return { error: "Žádný řádek neobsahuje „přední ; zadní“." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) return fail(error);

  revalidatePath(await topicPath(topicId.data));
  return { ok: true };
}

/** Z otevřených otázek se vzorovou odpovědí udělá kartičky (bez duplicit podle přední strany). */
export async function flashcardsFromQuestions(formData: FormData) {
  const topicId = uuid.parse(formData.get("topic_id"));
  const { supabase } = await requireUser();

  const [{ data: questions }, { data: cards }] = await Promise.all([
    supabase.from("questions").select("id, prompt, kind, answers(body, is_reference)").eq("topic_id", topicId),
    supabase.from("flashcards").select("front").eq("topic_id", topicId),
  ]);
  const existing = new Set((cards ?? []).map((c) => c.front.trim()));
  const rows = (questions ?? []).flatMap((q) => {
    const ref = (q.answers as { body: string; is_reference: boolean }[] | null)?.find((a) => a.is_reference);
    if (!ref || existing.has(q.prompt.trim()) || q.kind === "choice" || q.kind === "numeric") return [];
    return [{ topic_id: topicId, front: q.prompt, back: ref.body }];
  });
  if (rows.length) {
    const { error } = await supabase.from("flashcards").insert(rows);
    if (error) throw error;
  }
  revalidatePath(await topicPath(topicId));
}

export async function deleteFlashcard(formData: FormData) {
  const id = uuid.parse(formData.get("id"));
  const topicId = uuid.parse(formData.get("topic_id"));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  if (error) throw error;
  await recomputeTopicProgress(supabase, user.id, topicId);
  revalidatePath(await topicPath(topicId));
}

/** Ohodnocení kartičky při opakování. Stav se čte z DB, klientovi se nevěří. */
const ratingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

/** Jedno ohodnocení kartičky. Stav se čte z DB, klientovi se nevěří; `now` = čas skutečného opakování. */
async function applyReview(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], id: string, g: Rating, now: Date) {
  const { data: card, error } = await supabase.from("flashcards").select("*").eq("id", id).single();
  if (error) throw error;

  const next = schedule(card, g, now);
  const [{ error: upErr }, { error: logErr }] = await Promise.all([
    supabase.from("flashcards").update(next).eq("id", id),
    supabase
      .from("flashcard_reviews")
      .insert({ flashcard_id: id, topic_id: card.topic_id, rating: g, reviewed_at: now.toISOString() }),
  ]);
  if (upErr) throw upErr;
  if (logErr) console.error("flashcard_reviews insert", logErr);
  return { topicId: card.topic_id, due_at: next.due_at };
}

/** Ohodnocení kartičky při opakování. */
export async function reviewFlashcard(cardId: string, rating: Rating) {
  const id = uuid.parse(cardId);
  const g = ratingSchema.parse(rating);
  const { supabase, user } = await requireUser();
  const res = await applyReview(supabase, id, g, new Date());
  await recomputeTopicProgress(supabase, user.id, res.topicId);
  // Záměrně bez revalidatePath: obnovení /review by uprostřed sezení přenačetlo frontu
  // (a zahodilo karty vrácené přes „Znovu“). Ostatní stránky jsou dynamické a načtou se čerstvé.
  return { due_at: res.due_at };
}

// ---------------------------------------------------------------------------
// Offline opakování (PWA)
// ---------------------------------------------------------------------------
export type OfflineCard = {
  id: string;
  front: string;
  back: string;
  topicTitle: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review" | "relearning";
  last_review_at: string | null;
  due_at: string;
};

/** Balíček kartiček splatných do 7 dní – uloží se do zařízení pro opakování bez internetu. */
export async function getOfflineDeck(): Promise<OfflineCard[]> {
  const { supabase } = await requireUser();
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("flashcards")
    .select("id, front, back, stability, difficulty, reps, lapses, state, last_review_at, due_at, topics(title)")
    .lte("due_at", until)
    .order("due_at")
    .limit(300);
  if (error) throw error;
  return data.map(({ topics, ...c }) => ({ ...c, topicTitle: (topics as unknown as { title: string } | null)?.title ?? "" }));
}

const offlineSchema = z
  .array(z.object({ cardId: uuid, rating: ratingSchema, reviewedAt: z.iso.datetime() }))
  .max(1000);

/**
 * Dorovná hodnocení udělaná offline – v pořadí, jak proběhla, s jejich skutečným časem.
 * Neexistující (mezitím smazané) kartičky se přeskočí. Vrací počet zapsaných.
 */
export async function syncOfflineReviews(input: z.input<typeof offlineSchema>) {
  const items = offlineSchema.parse(input).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const { supabase, user } = await requireUser();
  const topics = new Set<string>();
  let synced = 0;
  for (const it of items) {
    // Budoucí čas (posunuté hodiny v zařízení) nepřijmout.
    const at = new Date(Math.min(new Date(it.reviewedAt).getTime(), Date.now()));
    try {
      const res = await applyReview(supabase, it.cardId, it.rating, at);
      topics.add(res.topicId);
      synced++;
    } catch (e) {
      console.error("offline review skipped", it.cardId, e);
    }
  }
  for (const t of topics) await recomputeTopicProgress(supabase, user.id, t);
  return synced;
}

// ---------------------------------------------------------------------------
// Materiály
// ---------------------------------------------------------------------------
const noteSchema = z.object({
  topic_id: uuid,
  title: z.string().trim().min(1, "Zadej název.").max(200),
  content: z.string().trim().min(1, "Poznámka je prázdná.").max(200_000),
});

export async function saveNote(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const id = formData.get("id") ? uuid.safeParse(formData.get("id")) : null;
  if (id && !id.success) return { error: "Neplatný materiál." };

  const { supabase } = await requireUser();
  const { data: topic } = await supabase.from("topics").select("subject_id").eq("id", parsed.data.topic_id).single();
  const row = { ...parsed.data, subject_id: topic?.subject_id ?? null, kind: "note" as const, status: "ready" as const };
  const { data: saved, error } = id
    ? await supabase.from("materials").update(row).eq("id", id.data).select("id").single()
    : await supabase.from("materials").insert(row).select("id").single();
  if (error) return fail(error);
  // Rozdělení na úseky pro AI vyhledávání; selhání nesmí zmařit uložení poznámky.
  await processMaterial(supabase, saved.id).catch((e) => console.error("processMaterial", e));

  revalidatePath(await topicPath(parsed.data.topic_id));
  return { ok: true };
}

const fileSchema = z.object({
  topic_id: uuid,
  title: z.string().trim().min(1).max(200),
  storage_path: z.string().min(1).max(500),
  mime_type: z.string().max(100),
  size_bytes: z.number().int().min(0).max(20 * 1024 * 1024),
});

/** Soubor nahrává prohlížeč přímo do Storage; tady se jen zaeviduje (a ověří, že je ve vlastní složce). */
export async function registerUploadedFile(input: z.input<typeof fileSchema>): Promise<ActionState> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return { error: "Neplatný soubor." };

  const { supabase, user } = await requireUser();
  if (!parsed.data.storage_path.startsWith(`${user.id}/`)) return { error: "Neplatná cesta souboru." };

  const { data: topic } = await supabase.from("topics").select("subject_id").eq("id", parsed.data.topic_id).single();
  const kind = parsed.data.mime_type === "application/pdf" ? "pdf" : parsed.data.mime_type.startsWith("image/") ? "image" : "note";
  const { data: saved, error } = await supabase
    .from("materials")
    .insert({
      ...parsed.data,
      subject_id: topic?.subject_id ?? null,
      kind,
      status: "processing",
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from("materials").remove([parsed.data.storage_path]);
    return fail(error);
  }
  // Text z PDF/textových souborů hned (bez AI); obrázky a skeny čekají na „Přepsat pomocí AI“.
  await processMaterial(supabase, saved.id).catch((e) => console.error("processMaterial", e));

  revalidatePath(await topicPath(parsed.data.topic_id));
  return { ok: true };
}

export async function deleteMaterial(formData: FormData) {
  const id = uuid.parse(formData.get("id"));
  const { supabase } = await requireUser();
  const { data: material, error } = await supabase.from("materials").select("storage_path, topic_id").eq("id", id).single();
  if (error) throw error;
  if (material.storage_path) await supabase.storage.from("materials").remove([material.storage_path]);
  const { error: delErr } = await supabase.from("materials").delete().eq("id", id);
  if (delErr) throw delErr;
  if (material.topic_id) revalidatePath(await topicPath(material.topic_id));
}

// ---------------------------------------------------------------------------
// Testy
// ---------------------------------------------------------------------------
const startSchema = z.object({
  topic_id: z.union([uuid, z.literal("")]).optional(),
  subject_id: z.union([subjectId, z.literal("")]).optional(),
  count: z.coerce.number().int().min(1).max(50).default(10),
  mode: z.enum(["practice", "timed"]).default("practice"),
  minutes: z.coerce.number().int().min(1).max(240).optional(),
});

/** Vybere otázky (přednost mají neprocvičené a ty s horším skóre) a založí test. */
export async function startTest(formData: FormData) {
  const input = startSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();

  let topicIds: string[];
  let subject: SubjectId | null = input.subject_id || null;
  if (input.topic_id) {
    topicIds = [input.topic_id];
    const { data } = await supabase.from("topics").select("subject_id").eq("id", input.topic_id).single();
    subject = data?.subject_id ?? null;
  } else {
    let q = supabase.from("topics").select("id");
    if (subject) q = q.eq("subject_id", subject);
    const { data } = await q;
    topicIds = (data ?? []).map((t) => t.id);
  }
  if (!topicIds.length) redirect(input.topic_id ? "/subjects" : `/subjects/${subject ?? ""}`);

  const { data: questions, error } = await supabase.from("questions").select("id").in("topic_id", topicIds);
  if (error) throw error;
  if (!questions.length) redirect(`/subjects/${subject ?? ""}?empty=1`);

  const { data: history } = await supabase
    .from("attempts")
    .select("question_id, score, created_at")
    .in("question_id", questions.map((q) => q.id))
    .order("created_at", { ascending: false });
  const lastScore = new Map<string, number>();
  for (const a of history ?? []) {
    if (a.question_id && !lastScore.has(a.question_id)) lastScore.set(a.question_id, a.score ?? 0);
  }

  // Priorita: neprocvičené (1.0) > špatně zodpovězené > dobře zodpovězené, s trochou náhody.
  const picked = questions
    .map((q) => ({ id: q.id, p: (lastScore.has(q.id) ? 1 - (lastScore.get(q.id) ?? 0) : 1) + Math.random() * 0.35 }))
    .sort((a, b) => b.p - a.p)
    .slice(0, input.count)
    .map((q) => q.id)
    .sort(() => Math.random() - 0.5);

  const { data: run, error: runErr } = await supabase
    .from("test_runs")
    .insert({
      topic_id: input.topic_id || null,
      subject_id: subject,
      mode: input.mode,
      question_ids: picked,
      time_limit_sec: input.mode === "timed" ? (input.minutes ?? Math.max(5, picked.length * 2)) * 60 : null,
    })
    .select("id")
    .single();
  if (runErr) throw runErr;

  redirect(`/test/${run.id}`);
}

export type AnswerResult = {
  score: number;
  correct_option?: number | null;
  numeric_answer?: number | null;
  reference?: string | null;
  error?: string;
};

const answerSchema = z.object({
  run_id: uuid,
  question_id: uuid,
  answer: z.string().max(20000).default(""),
  self_score: z.number().min(0).max(1).optional(),
  /** Skóre navrhla AI (student ho mohl upravit) – jen pro evidenci. */
  ai_graded: z.boolean().optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  duration_sec: z.number().int().min(0).max(24 * 3600).optional(),
});

export async function submitAnswer(input: z.input<typeof answerSchema>): Promise<AnswerResult> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { score: 0, error: "Neplatná odpověď." };
  const a = parsed.data;
  const { supabase } = await requireUser();

  const { data: run } = await supabase.from("test_runs").select("*").eq("id", a.run_id).single();
  if (!run || !run.question_ids.includes(a.question_id)) return { score: 0, error: "Otázka do testu nepatří." };
  if (run.finished_at) return { score: 0, error: "Test už je ukončený." };

  const { data: q, error } = await supabase
    .from("questions")
    .select("*, answers(body, is_reference)")
    .eq("id", a.question_id)
    .single();
  if (error) return { score: 0, error: "Otázka nenalezena." };

  const auto = autoGrade(q, a.answer);
  const score = auto ?? a.self_score;
  if (score === undefined) return { score: 0, error: "Ohodnoť svou odpověď." };

  const { error: insErr } = await supabase.from("attempts").insert({
    test_run_id: run.id,
    topic_id: q.topic_id,
    question_id: q.id,
    answer: a.answer || null,
    score,
    confidence: a.confidence ?? null,
    duration_sec: a.duration_sec ?? null,
    graded_by: auto !== null ? "auto" : a.ai_graded ? "ai" : "self",
  });
  // 23505 = už zodpovězeno (dvojklik / obnovení stránky) – vrátíme výsledek bez nového zápisu.
  if (insErr && insErr.code !== "23505") return { score: 0, error: "Uložení odpovědi selhalo." };

  const reference = (q.answers as { body: string; is_reference: boolean }[] | null)?.find((x) => x.is_reference)?.body ?? null;
  return { score, correct_option: q.correct_option, numeric_answer: q.numeric_answer, reference };
}

export async function finishTest(runId: string) {
  const id = uuid.parse(runId);
  const { supabase, user } = await requireUser();

  const { data: run } = await supabase.from("test_runs").select("*").eq("id", id).single();
  if (!run) redirect("/dashboard");

  if (!run.finished_at) {
    const { data: attempts } = await supabase.from("attempts").select("score, topic_id").eq("test_run_id", id);
    // Nezodpovězené otázky se počítají jako 0.
    const total = run.question_ids.length || 1;
    const score = (attempts ?? []).reduce((acc, x) => acc + (x.score ?? 0), 0) / total;
    const finishedAt = new Date();
    const { error } = await supabase
      .from("test_runs")
      .update({ finished_at: finishedAt.toISOString(), score })
      .eq("id", id);
    if (error) throw error;

    // Odučený čas (max. 3 h – rozdělaný test přes noc by statistiky zkreslil).
    const minutes = Math.min(180, Math.max(1, Math.round((finishedAt.getTime() - new Date(run.started_at).getTime()) / 60000)));
    await supabase.from("study_sessions").upsert(
      {
        test_run_id: run.id,
        source: "test",
        minutes,
        subject_id: run.subject_id,
        topic_id: run.topic_id,
        started_at: run.started_at,
      },
      { onConflict: "test_run_id", ignoreDuplicates: true },
    );

    const topics = new Set((attempts ?? []).map((x) => x.topic_id).filter((t): t is string => !!t));
    for (const t of topics) await recomputeTopicProgress(supabase, user.id, t);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/test/${id}`);
  redirect(`/test/${id}`);
}
