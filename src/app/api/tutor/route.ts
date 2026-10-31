import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_MODEL, AiRefusalError, aiErrorMessage, FALLBACK_BETA } from "@/lib/ai/client";
import { buildStudyContext, formatContext } from "@/lib/ai/context";
import { tutorSystemPrompt } from "@/lib/ai/prompts";
import { recordUsage, requireAi } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

// Protokol odpovědi: NDJSON – {"type":"meta"|"text"|"error"|"done", ...} po řádcích.
export type TutorEvent =
  | { type: "meta"; conversationId: string; sources: { material_id: string; title: string }[] }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

const bodySchema = z.object({
  conversationId: z.uuid().optional(),
  mode: z.enum(["explain", "quiz", "exam", "correct"]),
  subjectId: z.enum(["cj", "en", "it", "ma"]).nullable().optional(),
  topicId: z.uuid().nullable().optional(),
  message: z.string().trim().min(1).max(8000),
});

const HISTORY_LIMIT = 30;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Nepřihlášen." }, { status: 401 });
  const userId = auth.user.id;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Neplatný požadavek." }, { status: 400 });
  const body = parsed.data;

  let anthropic: Anthropic;
  try {
    anthropic = await requireAi(supabase, userId);
  } catch (e) {
    return Response.json({ error: aiErrorMessage(e) }, { status: 403 });
  }

  // Konverzace: existující (kontext z ní), nebo nová.
  let conversation: { id: string; mode: typeof body.mode; subject_id: typeof body.subjectId; topic_id: string | null };
  if (body.conversationId) {
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, mode, subject_id, topic_id")
      .eq("id", body.conversationId)
      .single();
    if (!data) return Response.json({ error: "Konverzace nenalezena." }, { status: 404 });
    conversation = data;
  } else {
    let subjectId = body.subjectId ?? null;
    if (body.topicId) {
      const { data: topic } = await supabase.from("topics").select("subject_id").eq("id", body.topicId).single();
      if (!topic) return Response.json({ error: "Téma nenalezeno." }, { status: 404 });
      subjectId = topic.subject_id;
    }
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ mode: body.mode, subject_id: subjectId, topic_id: body.topicId ?? null, title: body.message.slice(0, 80) })
      .select("id, mode, subject_id, topic_id")
      .single();
    if (error) return Response.json({ error: "Konverzaci se nepodařilo založit." }, { status: 500 });
    conversation = data;
  }

  const [{ data: history }, ctx] = await Promise.all([
    supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    buildStudyContext(supabase, {
      query: body.message,
      topicId: conversation.topic_id,
      subjectId: conversation.subject_id,
    }),
  ]);

  const { error: insertError } = await supabase
    .from("ai_messages")
    .insert({ conversation_id: conversation.id, role: "user", content: body.message });
  if (insertError) return Response.json({ error: "Zprávu se nepodařilo uložit." }, { status: 500 });

  // Historie bez kontextu (ten se mění podle dotazu); kontext jde jen k poslední zprávě.
  // Proto ani cache_control: prefix se mezi tahy mění a zápis do cache by jen stál víc.
  const messages: Anthropic.Beta.BetaMessageParam[] = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }));
  // API vyžaduje, aby první zpráva byla od uživatele (po oříznutí historie nemusí).
  while (messages[0]?.role === "assistant") messages.shift();
  messages.push({
    role: "user",
    content: `<kontext>\n${formatContext(ctx)}\n</kontext>\n\n${body.message}`,
  });

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, event: TutorEvent) =>
    controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: "meta", conversationId: conversation.id, sources: ctx.sources });
      let full = "";
      try {
        const aiStream = anthropic.beta.messages.stream(
          {
            model: AI_MODEL,
            max_tokens: 16000,
            betas: [FALLBACK_BETA],
            fallbacks: "default",
            output_config: { effort: "medium" },
            system: tutorSystemPrompt(conversation.mode),
            messages,
          },
          { signal: request.signal },
        );
        aiStream.on("text", (delta) => {
          full += delta;
          send(controller, { type: "text", text: delta });
        });
        const final = await aiStream.finalMessage();
        await recordUsage(supabase, `tutor_${conversation.mode}`, final.model, final.usage);
        if (final.stop_reason === "refusal") throw new AiRefusalError();

        if (full.trim()) {
          await supabase.from("ai_messages").insert({
            conversation_id: conversation.id,
            role: "assistant",
            content: full,
            sources: ctx.sources,
          });
          // Posune updated_at (trigger) → konverzace se řadí nahoru.
          await supabase.from("ai_conversations").update({ mode: conversation.mode }).eq("id", conversation.id);
        }
        send(controller, { type: "done" });
      } catch (e) {
        if (!request.signal.aborted) send(controller, { type: "error", message: aiErrorMessage(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
