import "server-only";
import { AnthropicProvider, anthropicErrorMessage } from "./anthropic";
import { GeminiProvider, geminiErrorMessage } from "./gemini";
import { AiBudgetError, AiDisabledError, AiNotConfiguredError, AiRefusalError, AiRequestLimitError } from "./errors";
import { configuredProvider, type AiProvider } from "./provider";

export { AiBudgetError, AiDisabledError, AiNotConfiguredError, AiRefusalError, AiRequestLimitError };

// Jedna AI vrstva pro celou appku: výběr poskytovatele, ceny, chyby. Klíče jsou jen na serveru.

let provider: AiProvider | null = null;

export function isAiConfigured() {
  return configuredProvider() !== null;
}

export function getProvider(): AiProvider {
  const name = configuredProvider();
  if (!name) throw new AiNotConfiguredError();
  if (provider?.name !== name) provider = name === "gemini" ? new GeminiProvider() : new AnthropicProvider();
  return provider;
}

// $ za 1M tokenů (vstup, výstup). Cache: čtení 0,1×, zápis 1,25× ceny vstupu.
// Gemini běží na bezplatné úrovni (projekt bez billingu) → 0 $; tokeny se evidují stejně.
const PRICES: [prefix: string, input: number, output: number][] = [
  ["gemini", 0, 0],
  ["gemma", 0, 0],
  ["claude-fable-5-1", 10, 50],
  ["claude-opus-5-5", 4, 20],
  ["claude-opus", 5, 25],
  ["claude-sonnet", 2, 10],
  ["claude-haiku", 1, 5],
];

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function estimateCost(model: string, usage: UsageLike) {
  const [, inPrice, outPrice] = PRICES.find(([p]) => model.startsWith(p)) ?? ["", 5, 25];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens * inPrice + cacheRead * inPrice * 0.1 + cacheWrite * inPrice * 1.25 + usage.output_tokens * outPrice) /
    1_000_000
  );
}

/** Uživatelsky srozumitelná chybová hláška z čehokoli, co AI vrstva vyhodí. */
export function aiErrorMessage(error: unknown) {
  if (
    error instanceof AiNotConfiguredError ||
    error instanceof AiBudgetError ||
    error instanceof AiDisabledError ||
    error instanceof AiRefusalError ||
    error instanceof AiRequestLimitError
  ) {
    return error.message;
  }
  const specific = geminiErrorMessage(error) ?? anthropicErrorMessage(error);
  if (specific) return specific;
  if (error instanceof Error && error.message.startsWith("Gemini")) return error.message;
  console.error(error);
  return "Něco se pokazilo při práci s AI.";
}
