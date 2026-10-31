"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.email("Zadej platný e-mail."),
  password: z.string().min(8, "Heslo musí mít aspoň 8 znaků."),
});

const registration = credentials.extend({
  displayName: z.string().trim().min(1, "Zadej jméno.").max(60),
});

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Neplatné údaje.";
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error: error.code === "email_not_confirmed" ? "Nejdřív potvrď e-mail – odkaz ti přišel do schránky." : "Špatný e-mail nebo heslo.",
    };
  }
  redirect("/dashboard");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registration.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };

  // Když je potvrzování e-mailu vypnuté, máme rovnou session.
  if (data.session) redirect("/dashboard");
  return { message: "Hotovo! Potvrď registraci přes odkaz v e-mailu a pak se přihlas." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
