"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Input, Label } from "@/components/ui";
import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
  initialError,
}: {
  mode: "login" | "register";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialError ? { error: initialError } : undefined);
  const isLogin = mode === "login";

  return (
    <form action={formAction} className="space-y-4">
      {!isLogin && (
        <div>
          <Label htmlFor="displayName">Jméno</Label>
          <Input id="displayName" name="displayName" autoComplete="given-name" required />
        </div>
      )}
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">Heslo</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          minLength={8}
          required
        />
      </div>

      {state?.error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.message && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Moment…" : isLogin ? "Přihlásit se" : "Vytvořit účet"}
      </Button>

      <p className="text-center text-sm text-muted">
        {isLogin ? "Ještě nemáš účet? " : "Už máš účet? "}
        <Link href={isLogin ? "/register" : "/login"} className="font-medium text-primary hover:underline">
          {isLogin ? "Zaregistruj se" : "Přihlas se"}
        </Link>
      </p>
    </form>
  );
}
