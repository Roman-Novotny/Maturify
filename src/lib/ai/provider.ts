import "server-only";
import type { ZodType } from "zod";
import type { UsageLike } from "./client";

// Společné rozhraní AI poskytovatelů – zbytek appky neví, jestli běží Gemini, nebo Claude.

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AiFile = { mimeType: string; base64: string };
export type Effort = "low" | "medium" | "high";
export type AiResult = { text: string; model: string; usage: UsageLike };

export type BaseRequest = {
  system: string;
  messages: ChatMessage[];
  effort?: Effort;
  /** Soubory (obrázek, PDF) připojené k poslední zprávě uživatele. */
  files?: AiFile[];
  signal?: AbortSignal;
};

export interface AiProvider {
  readonly name: "anthropic" | "gemini";
  readonly model: string;
  /** Streamuje text; `onText` dostává přírůstky. Při odmítnutí vyhodí AiRefusalError. */
  stream(req: BaseRequest & { onText: (delta: string) => void }): Promise<AiResult>;
  /** Jednorázová textová odpověď. */
  text(req: BaseRequest): Promise<AiResult>;
  /** Strukturovaná odpověď ověřená schématem (null = model vrátil nevalidní data). */
  json<T>(req: BaseRequest & { schema: ZodType<T> }): Promise<AiResult & { data: T | null }>;
}

export type ProviderName = AiProvider["name"];

/** Poskytovatel z env: AI_PROVIDER, jinak podle toho, jaký klíč je nastavený (Gemini má free tier). */
export function configuredProvider(): ProviderName | null {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (explicit === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}
