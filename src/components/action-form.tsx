"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

/** Formulář nad server action: ukáže chybu, po úspěchu se vyprázdní (resetOnSuccess). */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  successMessage,
  onSuccess,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
  }, [state, resetOnSuccess, onSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn(className)} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && successMessage && <p className="mt-2 text-sm text-success">{successMessage}</p>}
    </form>
  );
}
