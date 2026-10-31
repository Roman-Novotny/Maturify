import "server-only";
import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
} from "@google/genai";
import { z, type ZodType } from "zod";
import { AiRefusalError } from "./errors";
import type { AiProvider, BaseRequest, Effort } from "./provider";

// Google Gemini (bezplatná úroveň). Při přetížení (503) nebo vyčerpané kvótě modelu (429)
// se zkusí záložní, lehčí model – free tier má limity zvlášť pro každý model.
const DEFAULT_MODEL = "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

const THINKING: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const BLOCKED: string[] = [
  FinishReason.SAFETY,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
];

function toContents(req: BaseRequest): Content[] {
  return req.messages.map((m, i) => {
    const parts: Content["parts"] = [];
    if (i === req.messages.length - 1 && m.role === "user") {
      for (const f of req.files ?? []) parts.push({ inlineData: { mimeType: f.mimeType, data: f.base64 } });
    }
    parts.push({ text: m.content });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
}

function toUsage(u: GenerateContentResponseUsageMetadata | undefined) {
  const cached = u?.cachedContentTokenCount ?? 0;
  return {
    input_tokens: Math.max(0, (u?.promptTokenCount ?? 0) - cached),
    output_tokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
  };
}

function checkBlocked(res: GenerateContentResponse | undefined) {
  if (res?.promptFeedback?.blockReason) throw new AiRefusalError();
  const reason = res?.candidates?.[0]?.finishReason;
  if (reason && BLOCKED.includes(reason)) throw new AiRefusalError();
}

const retryable = (e: unknown) => e instanceof ApiError && (e.status === 503 || e.status === 429 || e.status === 500);

/** JSON Schema z zod bez metadat, kterým Gemini nerozumí. */
function jsonSchema(schema: ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;
  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  constructor(readonly model = process.env.AI_MODEL || DEFAULT_MODEL) {}

  private models() {
    return this.model === FALLBACK_MODEL ? [this.model] : [this.model, FALLBACK_MODEL];
  }

  private config(req: BaseRequest, extra: GenerateContentConfig = {}): GenerateContentConfig {
    return {
      systemInstruction: req.system,
      abortSignal: req.signal,
      ...(req.effort && !this.model.includes("lite") ? { thinkingConfig: { thinkingLevel: THINKING[req.effort] } } : {}),
      ...extra,
    };
  }

  /** Zavolá fn s hlavním modelem, při přetížení se záložním. */
  private async withFallback<R>(fn: (model: string, isFallback: boolean) => Promise<R>) {
    const models = this.models();
    for (let i = 0; ; i++) {
      try {
        return await fn(models[i], i > 0);
      } catch (e) {
        if (i < models.length - 1 && retryable(e)) continue;
        throw e;
      }
    }
  }

  async stream(req: BaseRequest & { onText: (delta: string) => void }) {
    return this.withFallback(async (model, isFallback) => {
      let text = "";
      let last: GenerateContentResponse | undefined;
      const stream = await this.client.models.generateContentStream({
        model,
        contents: toContents(req),
        // Záložní lehký model bez nastavení „přemýšlení“ (nemusí ho podporovat).
        config: isFallback ? { systemInstruction: req.system, abortSignal: req.signal } : this.config(req),
      });
      try {
        for await (const chunk of stream) {
          last = chunk;
          const delta = chunk.text;
          if (delta) {
            text += delta;
            req.onText(delta);
          }
        }
      } catch (e) {
        // Uprostřed odpovědi už nepřepínat na záložní model – text by se zdvojil.
        if (text && retryable(e)) throw new Error("Gemini přerušilo odpověď. Zkus to znovu.", { cause: e });
        throw e;
      }
      checkBlocked(last);
      return { text, model: last?.modelVersion ?? model, usage: toUsage(last?.usageMetadata) };
    });
  }

  async text(req: BaseRequest) {
    return this.withFallback(async (model, isFallback) => {
      const res = await this.client.models.generateContent({
        model,
        contents: toContents(req),
        config: isFallback ? { systemInstruction: req.system, abortSignal: req.signal } : this.config(req),
      });
      checkBlocked(res);
      return { text: res.text ?? "", model: res.modelVersion ?? model, usage: toUsage(res.usageMetadata) };
    });
  }

  async json<T>(req: BaseRequest & { schema: ZodType<T> }) {
    return this.withFallback(async (model, isFallback) => {
      const extra: GenerateContentConfig = {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema(req.schema),
      };
      const res = await this.client.models.generateContent({
        model,
        contents: toContents(req),
        config: isFallback ? { systemInstruction: req.system, abortSignal: req.signal, ...extra } : this.config(req, extra),
      });
      checkBlocked(res);
      const text = res.text ?? "";
      let data: T | null = null;
      try {
        const parsed = req.schema.safeParse(JSON.parse(text));
        data = parsed.success ? parsed.data : null;
      } catch {
        data = null;
      }
      return { text, model: res.modelVersion ?? model, usage: toUsage(res.usageMetadata), data };
    });
  }
}

export function geminiErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 429) return "Bezplatný limit Gemini je teď vyčerpaný (moc požadavků). Zkus to za minutu, případně zítra.";
  if (error.status === 503) return "Gemini je teď přetížené. Zkus to za chvíli.";
  if (error.status === 400 || error.status === 403) {
    console.error(error);
    return error.status === 403 ? "Neplatný GEMINI_API_KEY." : "AI požadavek byl odmítnut jako neplatný.";
  }
  return `Chyba AI služby (${error.status}). Zkus to znovu.`;
}
