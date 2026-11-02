import { createClient } from "@supabase/supabase-js";

// Veřejný health-check. Pravidelně ho volá GitHub Action (.github/workflows/keep-alive.yml),
// aby se bezplatný Supabase projekt neuspal po 7 dnech bez aktivity.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  // Skutečný dotaz do databáze (RLS vrátí anonymovi prázdný výsledek, ale DB se probudí/zůstane aktivní).
  const { error } = await supabase.from("subjects").select("id").limit(1);
  const body = { ok: !error, db: error ? error.message : "ok", ms: Date.now() - started };
  return Response.json(body, { status: error ? 503 : 200, headers: { "cache-control": "no-store" } });
}
