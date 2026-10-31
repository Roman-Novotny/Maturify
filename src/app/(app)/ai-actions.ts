"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiErrorMessage } from "@/lib/ai/client";
import { buildStudyContext, formatContext } from "@/lib/ai/context";
import { GENERATE_SYSTEM, GRADING_SYSTEM } from "@/lib/ai/prompts";
import { recordUsage, requireAi } from "@/lib/ai/usage";
import { requireUser } from "@/lib/dal";
import { MaterialError, transcribeMaterial } from "@/lib/materials";

const uuid = z.uuid();

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function topicPath(topicId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("topics").select("subject_id").eq("id", topicId).single();
  return data ? `/subjects/${data.subject_id}/topics/${topicId}` : "/subjects";
}

// ---------------------------------------------------------------------------
// Hodnocení otevřené odpovědi – AI navrhne, student potvrdí nebo upraví
// ---------------------------------------------------------------------------
const GradeSchema = z.object({
  score: z.number().describe("0 až 1"),
  feedback: z.string(),
  missing: z.array(z.string()),
});
export type AiGrade = z.infer<typeof GradeSchema>;

export async function gradeAnswerWithAI(input: { runId: string; questionId: string; answer: string }): Promise<Result<AiGrade>> {
  try {
    const runId = uuid.parse(input.runId);
    const questionId = uuid.parse(input.questionId);
    const answer = z.string().max(20000).parse(input.answer).trim();
    if (!answer) return { ok: false, error: "Nejdřív napiš odpověď." };

    const { supabase, user } = await requireUser();
    const { data: run } = await supabase.from("test_runs").select("question_ids, finished_at").eq("id", runId).single();
    if (!run || !run.question_ids.includes(questionId) || run.finished_at) return { ok: false, error: "Neplatný test." };

    const { data: q, error } = await supabase
      .from("questions")
      .select("prompt, topic_id, answers(body, is_reference)")
      .eq("id", questionId)
      .single();
    if (error) return { ok: false, error: "Otázka nenalezena." };
    const reference = (q.answers as { body: string; is_reference: boolean }[]).find((a) => a.is_reference)?.body;

    const ai = await requireAi(supabase, user.id);
    // Bez vzorové odpovědi pomůžou aspoň materiály k tématu.
    const ctx = reference ? null : await buildStudyContext(supabase, { query: q.prompt, topicId: q.topic_id });

    const response = await ai.json({
      schema: GradeSchema,
      effort: "medium",
      system: GRADING_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `<otazka>${q.prompt}</otazka>`,
            reference ? `<vzorova_odpoved>${reference}</vzorova_odpoved>` : "<vzorova_odpoved>(chybí)</vzorova_odpoved>",
            ctx?.chunks.length ? `<materialy>${ctx.chunks.map((c) => c.content).join("\n---\n")}</materialy>` : "",
            `<odpoved_studenta>${answer}</odpoved_studenta>`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    await recordUsage(supabase, "grade", response.model, response.usage);
    const grade = response.data;
    if (!grade) return { ok: false, error: "AI vrátila nečitelné hodnocení. Zkus to znovu." };

    return { ok: true, data: { ...grade, score: Math.max(0, Math.min(1, grade.score)) } };
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Generování kartiček / otázek z materiálů – vrací návrhy ke schválení
// ---------------------------------------------------------------------------
const CardsSchema = z.object({ items: z.array(z.object({ front: z.string(), back: z.string() })) });
const QuestionsSchema = z.object({
  items: z.array(z.object({ prompt: z.string(), reference: z.string(), kind: z.enum(["open", "oral"]) })),
});
export type CardDraft = z.infer<typeof CardsSchema>["items"][number];
export type QuestionDraft = z.infer<typeof QuestionsSchema>["items"][number];

export async function generateDrafts(input: {
  topicId: string;
  kind: "cards" | "questions";
  count: number;
  focus?: string;
}): Promise<Result<CardDraft[] | QuestionDraft[]>> {
  try {
    const topicId = uuid.parse(input.topicId);
    const count = z.number().int().min(1).max(30).parse(input.count);
    const focus = z.string().max(500).optional().parse(input.focus)?.trim();

    const { supabase, user } = await requireUser();
    const { data: topic } = await supabase.from("topics").select("title, subject_id").eq("id", topicId).single();
    if (!topic) return { ok: false, error: "Téma nenalezeno." };

    // Všechny úseky materiálů tématu (pořadí jako v dokumentu), rozumně omezené.
    const { data: chunks } = await supabase
      .from("material_chunks")
      .select("content, material_id, idx")
      .eq("topic_id", topicId)
      .order("material_id")
      .order("idx")
      .limit(120);
    const ctx = await buildStudyContext(supabase, { query: focus || topic.title, topicId });
    if (!chunks?.length && !ctx.questions.some((q) => q.reference)) {
      return { ok: false, error: "Téma nemá žádné zpracované materiály ani vzorové odpovědi, ze kterých by šlo generovat." };
    }

    const existing =
      input.kind === "cards"
        ? (await supabase.from("flashcards").select("front").eq("topic_id", topicId)).data?.map((c) => c.front) ?? []
        : ctx.questions.map((q) => q.prompt);

    const ai = await requireAi(supabase, user.id);
    const task =
      input.kind === "cards"
        ? `Vytvoř ${count} studijních kartiček (front = krátká otázka nebo pojem, back = stručná přesná odpověď, max. 2–3 věty).`
        : `Vytvoř ${count} maturitních otázek k ústnímu zkoušení nebo k písemnému vysvětlení (prompt = otázka, reference = vzorová odpověď v bodech, kind = "oral" pro otázky k mluvení, jinak "open").`;

    const response = await ai.json<{ items: CardDraft[] | QuestionDraft[] }>({
      schema: input.kind === "cards" ? CardsSchema : QuestionsSchema,
      effort: "medium",
      system: GENERATE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `<tema>${topic.title}</tema>`,
            chunks?.length ? `<materialy>\n${chunks.map((c) => c.content).join("\n\n")}\n</materialy>` : formatContext(ctx),
            existing.length ? `<existujici>\n${existing.slice(0, 200).join("\n")}\n</existujici>` : "",
            focus ? `<zamereni>${focus}</zamereni>` : "",
            task,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    await recordUsage(supabase, `generate_${input.kind}`, response.model, response.usage);
    if (!response.data) return { ok: false, error: "AI vrátila nečitelný výsledek. Zkus to znovu." };

    return { ok: true, data: response.data.items.slice(0, count) };
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }
}

const saveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cards"),
    topicId: uuid,
    items: z.array(z.object({ front: z.string().trim().min(1).max(2000), back: z.string().trim().min(1).max(5000) })).max(50),
  }),
  z.object({
    kind: z.literal("questions"),
    topicId: uuid,
    items: z
      .array(
        z.object({
          prompt: z.string().trim().min(1).max(5000),
          reference: z.string().trim().max(20000),
          kind: z.enum(["open", "oral"]),
        }),
      )
      .max(50),
  }),
]);

/** Uloží schválené návrhy (student je mohl předtím upravit). */
export async function saveDrafts(input: z.input<typeof saveSchema>): Promise<Result<number>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Některá položka je prázdná nebo moc dlouhá." };
  const { topicId, kind, items } = parsed.data;
  if (!items.length) return { ok: false, error: "Nevybral/a jsi nic k uložení." };

  const { supabase } = await requireUser();
  if (kind === "cards") {
    const { error } = await supabase.from("flashcards").insert(items.map((i) => ({ topic_id: topicId, ...i })));
    if (error) return { ok: false, error: "Uložení selhalo." };
  } else {
    const { data, error } = await supabase
      .from("questions")
      .insert(items.map((i) => ({ topic_id: topicId, prompt: i.prompt, kind: i.kind, source: "AI z materiálů" })))
      .select("id");
    if (error) return { ok: false, error: "Uložení selhalo." };
    const answers = data.flatMap((q, i) => (items[i].reference ? [{ question_id: q.id, body: items[i].reference }] : []));
    if (answers.length) await supabase.from("answers").insert(answers);
  }

  revalidatePath(await topicPath(topicId));
  return { ok: true, data: items.length };
}

// ---------------------------------------------------------------------------
// Přepis obrázku / skenu
// ---------------------------------------------------------------------------
export async function transcribeMaterialAction(materialId: string): Promise<Result<number>> {
  try {
    const id = uuid.parse(materialId);
    const { supabase, user } = await requireUser();
    const chunks = await transcribeMaterial(supabase, user.id, id);
    const { data } = await supabase.from("materials").select("topic_id").eq("id", id).single();
    if (data?.topic_id) revalidatePath(await topicPath(data.topic_id));
    return { ok: true, data: chunks };
  } catch (e) {
    return { ok: false, error: e instanceof MaterialError ? e.message : aiErrorMessage(e) };
  }
}
