import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { todayISO } from "@/lib/utils";
import { AiBudgetError, AiDisabledError, AiRequestLimitError, estimateCost, getProvider, type UsageLike } from "./client";

type Db = SupabaseClient<Database>;

/** Začátek dnešního dne v Praze jako ISO (pro součet dnešní útraty). */
function startOfTodayPrague() {
  const date = todayISO();
  // Offset Prahy pro daný den (CET/CEST) – z rozdílu lokálního a UTC času.
  const probe = new Date(`${date}T12:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Prague" }));
  const offsetMs = local.getTime() - probe.getTime();
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - offsetMs).toISOString();
}

export async function getTodaySpend(supabase: Db) {
  const { data, error } = await supabase.from("ai_usage").select("cost_usd").gte("created_at", startOfTodayPrague());
  if (error) throw error;
  return data.reduce((a, r) => a + Number(r.cost_usd), 0);
}

/** Strop požadavků na uživatele a den – u bezplatného Gemini nehlídá nic jiného (cena je 0 $). */
export const DAILY_REQUEST_LIMIT = Number(process.env.AI_DAILY_REQUESTS) || 300;

async function getTodayRequests(supabase: Db) {
  const { count, error } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfTodayPrague());
  if (error) throw error;
  return count ?? 0;
}

/**
 * Ověří, že AI jde použít: je nakonfigurovaná, uživatel ji nemá vypnutou a nepřekročil denní limit.
 * Vrací poskytovatele, ať se na kontrolu nedá zapomenout.
 */
export async function requireAi(supabase: Db, userId: string) {
  const ai = getProvider();
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_enabled, ai_daily_limit_usd")
    .eq("id", userId)
    .single();
  if (profile && !profile.ai_enabled) throw new AiDisabledError();
  const limit = Number(profile?.ai_daily_limit_usd ?? 1);
  const [spent, requests] = await Promise.all([getTodaySpend(supabase), getTodayRequests(supabase)]);
  if (spent >= limit) throw new AiBudgetError(limit);
  if (requests >= DAILY_REQUEST_LIMIT) throw new AiRequestLimitError(DAILY_REQUEST_LIMIT);
  return ai;
}

export async function recordUsage(supabase: Db, feature: string, model: string, usage: UsageLike) {
  const { error } = await supabase.from("ai_usage").insert({
    feature,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    cost_usd: estimateCost(model, usage),
  });
  // Evidence nesmí shodit odpověď, kterou už uživatel dostal.
  if (error) console.error("ai_usage insert failed", error);
}
