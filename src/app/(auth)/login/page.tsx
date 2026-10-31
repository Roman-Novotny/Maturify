import type { Metadata } from "next";
import { signIn } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Přihlášení" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      action={signIn}
      initialError={error === "confirm" ? "Odkaz pro potvrzení je neplatný nebo vypršel." : undefined}
    />
  );
}
