import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { AI_MODEL, AiRefusalError } from "@/lib/ai/client";
import { TRANSCRIBE_SYSTEM } from "@/lib/ai/prompts";
import { recordUsage, requireAi } from "@/lib/ai/usage";
import { chunkText, normalizeText } from "@/lib/chunking";
import type { Database, Material } from "@/lib/database.types";

type Db = SupabaseClient<Database>;

const MAX_CONTENT_CHARS = 500_000;

export class MaterialError extends Error {}

async function download(supabase: Db, path: string) {
  const { data, error } = await supabase.storage.from("materials").download(path);
  if (error || !data) throw new MaterialError("Soubor se nepodařilo stáhnout z úložiště.");
  return new Uint8Array(await data.arrayBuffer());
}

/** Uloží text materiálu a přegeneruje jeho úseky pro vyhledávání. */
async function saveTextAndChunks(supabase: Db, material: Material, text: string) {
  const content = normalizeText(text).slice(0, MAX_CONTENT_CHARS);
  const chunks = chunkText(content);

  const { error: delErr } = await supabase.from("material_chunks").delete().eq("material_id", material.id);
  if (delErr) throw delErr;
  if (chunks.length) {
    const { error } = await supabase.from("material_chunks").insert(
      chunks.map((c, idx) => ({
        material_id: material.id,
        topic_id: material.topic_id,
        subject_id: material.subject_id,
        idx,
        content: c,
      })),
    );
    if (error) throw error;
  }

  const { error } = await supabase
    .from("materials")
    .update({
      // Poznámky mají obsah od uživatele – nepřepisovat ho normalizovanou verzí.
      ...(material.storage_path ? { content } : {}),
      status: "ready",
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", material.id);
  if (error) throw error;
  return chunks.length;
}

async function markError(supabase: Db, id: string, message: string) {
  await supabase.from("materials").update({ status: "error", error: message }).eq("id", id);
}

/**
 * Zpracování bez AI: poznámky, textové soubory a PDF s textovou vrstvou.
 * Obrázky a naskenovaná PDF se označí, že potřebují AI přepis.
 */
export async function processMaterial(supabase: Db, materialId: string) {
  const { data: material, error } = await supabase.from("materials").select("*").eq("id", materialId).single();
  if (error) throw error;

  try {
    if (!material.storage_path) return await saveTextAndChunks(supabase, material, material.content ?? "");

    if (material.mime_type?.startsWith("text/")) {
      const bytes = await download(supabase, material.storage_path);
      return await saveTextAndChunks(supabase, material, new TextDecoder().decode(bytes));
    }

    if (material.mime_type === "application/pdf") {
      const pdf = await getDocumentProxy(await download(supabase, material.storage_path));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      // Méně než ~80 znaků na stránku = sken bez textové vrstvy.
      if (text.replace(/\s/g, "").length < totalPages * 80) {
        await markError(supabase, material.id, "PDF nemá textovou vrstvu (sken) – použij „Přepsat pomocí AI“.");
        return 0;
      }
      return await saveTextAndChunks(supabase, material, text);
    }

    if (material.mime_type?.startsWith("image/")) {
      await markError(supabase, material.id, "Obrázek – text z něj získáš přes „Přepsat pomocí AI“.");
      return 0;
    }

    await markError(supabase, material.id, "Tenhle typ souboru neumím zpracovat.");
    return 0;
  } catch (e) {
    await markError(supabase, material.id, e instanceof MaterialError ? e.message : "Zpracování selhalo.");
    throw e;
  }
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** Přepis fotky / skenu přes Claude (vision, PDF dokument). */
export async function transcribeMaterial(supabase: Db, userId: string, materialId: string) {
  const { data: material, error } = await supabase.from("materials").select("*").eq("id", materialId).single();
  if (error) throw error;
  if (!material.storage_path || !material.mime_type) throw new MaterialError("Tenhle materiál nemá soubor k přepsání.");

  const isPdf = material.mime_type === "application/pdf";
  const isImage = (IMAGE_TYPES as readonly string[]).includes(material.mime_type);
  if (!isPdf && !isImage) throw new MaterialError("Přepsat jde jen obrázek nebo PDF.");

  const anthropic = await requireAi(supabase, userId);
  const data = Buffer.from(await download(supabase, material.storage_path)).toString("base64");

  const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: material.mime_type as ImageType, data } };

  const stream = anthropic.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: TRANSCRIBE_SYSTEM,
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: `Přepiš materiál „${material.title}“.` }] }],
  });
  const message = await stream.finalMessage();
  await recordUsage(supabase, "transcribe", message.model, message.usage);
  if (message.stop_reason === "refusal") throw new AiRefusalError();

  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  if (!text.trim()) throw new MaterialError("AI z materiálu nic nepřečetla.");
  return saveTextAndChunks(supabase, material, text);
}
