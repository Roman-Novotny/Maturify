import type { Metadata } from "next";
import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Registrace" };

export default function RegisterPage() {
  return <AuthForm mode="register" action={signUp} />;
}
