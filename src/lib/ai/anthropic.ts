import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiRefusalError } from "./errors";
import type { AiProvider, BaseRequest } from "./provider";

// Server-side fallback při odmítnutí (např. dotaz o síťových útocích v informatice):
// API samo zopakuje požadavek na doporučeném modelu podle kategorie odmítnutí.
const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

function toMessages(req: BaseRequest): Anthropic.Beta.BetaMessageParam[] {
  return req.messages.map((m, i) => {
    const isLast = i === req.messages.length - 1;
    if (!isLast || !req.files?.length || m.role !== "user") return { role: m.role, content: m.content };
    const files: Anthropic.Beta.BetaContentBlockParam[] = req.files.map((f) =>
      f.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } }
        : { type: "image", source: { type: "base64", media_type: f.mimeType as ImageType, data: f.base64 } },
    );
    return { role: "user", content: [...files, { type: "text", text: m.content }] };
  });
}

function textOf(message: Anthropic.Beta.BetaMessage) {
  return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client = new Anthropic();
  constructor(readonly model = process.env.AI_MODEL || "claude-opus-5") {}

  private base(req: BaseRequest) {
    return {
      model: this.model,
      betas: [FALLBACK_BETA],
      fallbacks: "default" as const,
      system: req.system,
      messages: toMessages(req),
    };
  }

  async stream(req: BaseRequest & { onText: (delta: string) => void }) {
    const s = this.client.beta.messages.stream(
      { ...this.base(req), max_tokens: 16000, output_config: { effort: req.effort ?? "medium" } },
      { signal: req.signal },
    );
    s.on("text", req.onText);
    const final = await s.finalMessage();
    if (final.stop_reason === "refusal") throw new AiRefusalError();
    return { text: textOf(final), model: final.model, usage: final.usage };
  }

  async text(req: BaseRequest) {
    const s = this.client.beta.messages.stream(
      { ...this.base(req), max_tokens: 64000, output_config: { effort: req.effort ?? "medium" } },
      { signal: req.signal },
    );
    const final = await s.finalMessage();
    if (final.stop_reason === "refusal") throw new AiRefusalError();
    return { text: textOf(final), model: final.model, usage: final.usage };
  }

  async json<T>(req: BaseRequest & { schema: import("zod").ZodType<T> }) {
    const res = await this.client.beta.messages.parse(
      {
        ...this.base(req),
        max_tokens: 16000,
        output_config: { effort: req.effort ?? "medium", format: betaZodOutputFormat(req.schema) },
      },
      { signal: req.signal },
    );
    if (res.stop_reason === "refusal") throw new AiRefusalError();
    return { text: textOf(res), model: res.model, usage: res.usage, data: (res.parsed_output as T | null) ?? null };
  }
}

export function anthropicErrorMessage(error: unknown): string | null {
  if (error instanceof Anthropic.AuthenticationError) return "Neplatný ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError) return "AI je teď přetížená (limit požadavků). Zkus to za chvíli.";
  if (error instanceof Anthropic.BadRequestError) {
    console.error(error);
    return "AI požadavek byl odmítnut jako neplatný.";
  }
  if (error instanceof Anthropic.APIConnectionError) return "Nepodařilo se spojit s AI. Zkontroluj připojení.";
  if (error instanceof Anthropic.APIError) return `Chyba AI služby (${error.status}). Zkus to znovu.`;
  return null;
}
