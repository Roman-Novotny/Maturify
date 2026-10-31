import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiSource, Database, SubjectId } from "@/lib/database.types";

type Db = SupabaseClient<Database>;

export type StudyContext = {
  subjectName: string | null;
  topicTitle: string | null;
  topicDescription: string | null;
  /** Otázky a vzorové odpovědi tématu – „co škola chce“. */
  questions: { prompt: string; reference: string | null }[];
  /** Úseky materiálů nalezené k dotazu. */
  chunks: { title: string; material_id: string; content: string }[];
  sources: AiSource[];
};

const MAX_QUESTIONS = 40;
const MAX_CHUNKS = 8;

/** Sestaví kontext pro AI z vlastních dat uživatele (RLS zaručí, že jen jeho). */
export async function buildStudyContext(
  supabase: Db,
  { query, topicId, subjectId }: { query: string; topicId?: string | null; subjectId?: SubjectId | null },
): Promise<StudyContext> {
  const [topicRes, subjectRes, questionsRes, chunksRes] = await Promise.all([
    topicId ? supabase.from("topics").select("title, description, subject_id").eq("id", topicId).maybeSingle() : null,
    subjectId ? supabase.from("subjects").select("name").eq("id", subjectId).maybeSingle() : null,
    topicId
      ? supabase.from("questions").select("prompt, answers(body, is_reference)").eq("topic_id", topicId).limit(MAX_QUESTIONS)
      : null,
    supabase.rpc("search_material_chunks", {
      query,
      p_topic_id: topicId ?? null,
      p_subject_id: topicId ? null : (subjectId ?? null),
      match_count: MAX_CHUNKS,
    }),
  ]);

  let chunks = chunksRes.data ?? [];
  // U tématu bez shody na dotaz (např. „vysvětli mi to“) vezmi aspoň začátek jeho materiálů.
  if (!chunks.length && topicId) {
    const { data } = await supabase
      .from("material_chunks")
      .select("id, material_id, content, materials(title)")
      .eq("topic_id", topicId)
      .order("idx")
      .limit(4);
    chunks = (data ?? []).map((c) => ({
      id: c.id,
      material_id: c.material_id,
      topic_id: topicId,
      title: (c.materials as unknown as { title: string } | null)?.title ?? "Materiál",
      content: c.content,
      rank: 0,
    }));
  }

  const questions = (questionsRes?.data ?? []).map((q) => ({
    prompt: q.prompt,
    reference: (q.answers as { body: string; is_reference: boolean }[]).find((a) => a.is_reference)?.body ?? null,
  }));

  const seen = new Set<string>();
  const sources: AiSource[] = [];
  for (const c of chunks) {
    if (!seen.has(c.material_id)) {
      seen.add(c.material_id);
      sources.push({ material_id: c.material_id, title: c.title });
    }
  }

  return {
    subjectName: subjectRes?.data?.name ?? null,
    topicTitle: topicRes?.data?.title ?? null,
    topicDescription: topicRes?.data?.description ?? null,
    questions,
    chunks: chunks.map((c) => ({ title: c.title, material_id: c.material_id, content: c.content })),
    sources,
  };
}

const escape = (s: string) => s.replace(/</g, "&lt;");

/** Kontext jako XML bloky – oddělené od instrukcí, AI je bere jako data, ne příkazy. */
export function formatContext(ctx: StudyContext) {
  const parts: string[] = [];
  if (ctx.subjectName || ctx.topicTitle) {
    parts.push(
      `<tema predmet="${escape(ctx.subjectName ?? "")}">${escape(ctx.topicTitle ?? "(celý předmět)")}${
        ctx.topicDescription ? `\n${escape(ctx.topicDescription)}` : ""
      }</tema>`,
    );
  }
  if (ctx.questions.length) {
    parts.push(
      `<maturitni_otazky>\n${ctx.questions
        .map((q, i) => `<otazka n="${i + 1}">${escape(q.prompt)}${q.reference ? `\n<vzorova_odpoved>${escape(q.reference)}</vzorova_odpoved>` : ""}</otazka>`)
        .join("\n")}\n</maturitni_otazky>`,
    );
  }
  if (ctx.chunks.length) {
    parts.push(
      `<materialy>\n${ctx.chunks
        .map((c) => `<material nazev="${escape(c.title)}">\n${escape(c.content)}\n</material>`)
        .join("\n")}\n</materialy>`,
    );
  } else {
    parts.push("<materialy>(k tomuto dotazu se v materiálech studenta nic nenašlo)</materialy>");
  }
  return parts.join("\n\n");
}
