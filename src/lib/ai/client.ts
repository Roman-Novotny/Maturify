import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Jedna AI vrstva pro celou appku: klient, model, ceny. Klíč je jen na serveru.

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5";

// Server-side fallback při odmítnutí (např. dotaz o síťových útocích v informatice):
// API samo zopakuje požadavek na doporučeném modelu podle kategorie odmítnutí.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

let client: Anthropic | null = null;

export function isAiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAnthropic() {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  client ??= new Anthropic();
  return client;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI není nastavená – chybí ANTHROPIC_API_KEY v .env.local.");
  }
}

export class AiBudgetError extends Error {
  constructor(limit: number) {
    super(`Dnešní limit AI (${limit.toFixed(2)} $) je vyčerpaný. Zítra to půjde znovu, nebo limit zvyš v Nastavení.`);
  }
}

export class AiDisabledError extends Error {
  constructor() {
    super("AI funkce máš vypnuté v Nastavení.");
  }
}

export class AiRefusalError extends Error {
  constructor() {
    super("AI na tohle odmítla odpovědět. Zkus otázku formulovat jinak.");
  }
}

// $ za 1M tokenů (vstup, výstup). Cache: čtení 0,1×, zápis 1,25× ceny vstupu.
const PRICES: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function estimateCost(model: string, usage: UsageLike) {
  const [inPrice, outPrice] = PRICES[model] ?? PRICES["claude-opus-5"];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens * inPrice + cacheRead * inPrice * 0.1 + cacheWrite * inPrice * 1.25 + usage.output_tokens * outPrice) /
    1_000_000
  );
}

/** Uživatelsky srozumitelná chybová hláška z čehokoli, co AI vrstva vyhodí. */
export function aiErrorMessage(error: unknown) {
  if (error instanceof AiNotConfiguredError || error instanceof AiBudgetError || error instanceof AiDisabledError || error instanceof AiRefusalError) {
    return error.message;
  }
  if (error instanceof Anthropic.AuthenticationError) return "Neplatný ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError) return "AI je teď přetížená (limit požadavků). Zkus to za chvíli.";
  if (error instanceof Anthropic.BadRequestError) {
    console.error(error);
    return "AI požadavek byl odmítnut jako neplatný.";
  }
  if (error instanceof Anthropic.APIConnectionError) return "Nepodařilo se spojit s AI. Zkontroluj připojení.";
  if (error instanceof Anthropic.APIError) return `Chyba AI služby (${error.status}). Zkus to znovu.`;
  console.error(error);
  return "Něco se pokazilo při práci s AI.";
}
