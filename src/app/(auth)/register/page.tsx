import type { Metadata } from "next";
import { connection } from "next/server";
import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Registrace" };

export default async function RegisterPage() {
  // Dynamicky kvůli CSP nonce (statická stránka by ji nedostala a skripty by se zablokovaly).
  await connection();
  return <AuthForm mode="register" action={signUp} />;
}
