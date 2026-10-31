"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, buttonClass, Card, ProgressBar } from "@/components/ui";
import type { Flashcard } from "@/lib/database.types";
import { previewInterval, RATING_LABELS, type Rating } from "@/lib/srs";
import { cn, plural } from "@/lib/utils";
import { reviewFlashcard } from "../study-actions";

type Item = { card: Flashcard; topicTitle: string; subjectShort: string; color: string };

const RATING_STYLE: Record<Rating, string> = {
  1: "text-danger",
  2: "text-warning",
  3: "text-success",
  4: "text-secondary",
};

export function ReviewSession({ items }: { items: Item[] }) {
  // Fronta: karta ohodnocená „Znovu“ se v rámci sezení vrátí na konec.
  const [queue, setQueue] = useState(items);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const current = queue[0];

  function rate(g: Rating) {
    if (!current) return;
    const item = current;
    // Optimisticky: další karta hned, uložení běží na pozadí (server si stav přepočítá sám z DB).
    setFlipped(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      if (g === 1) {
        // Lokální kopie se stavem „learning“, ať náhled intervalů odpovídá.
        return [...rest, { ...head, card: { ...head.card, state: "learning" as const, reps: head.card.reps + 1 } }];
      }
      return rest;
    });
    setDone((d) => d + 1);
    startTransition(async () => {
      try {
        await reviewFlashcard(item.card.id, g);
      } catch {
        setError(`Hodnocení kartičky „${item.card.front.slice(0, 40)}“ se neuložilo – zkontroluj připojení.`);
      }
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!flipped && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        rate(Number(e.key) as Rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) {
    return (
      <Card className="text-center">
        <p className="text-4xl">🎉</p>
        <h2 className="mt-3 text-lg font-semibold">Sezení dokončeno</h2>
        <p className="mt-1 text-sm text-muted">Zopakoval/a jsi {done} {plural(done, ["kartičku", "kartičky", "kartiček"])}. Další přijdou, až budou potřeba.</p>
        <Link href="/dashboard" className={cn(buttonClass({ variant: "secondary" }), "mt-5")}>
          Zpět na přehled
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>{done} hotovo</span>
          <span>{queue.length} zbývá</span>
        </div>
        <ProgressBar value={done / (done + queue.length)} />
      </div>

      <button
        type="button"
        onClick={() => setFlipped(true)}
        disabled={flipped}
        className="block w-full text-left"
        aria-label={flipped ? undefined : "Otočit kartičku"}
      >
        <Card className={cn("min-h-64 transition-colors", !flipped && "hover:border-primary/50")}>
          <div className="mb-4 flex items-center gap-2 text-xs text-muted">
            <Badge color={current.color}>{current.subjectShort}</Badge>
            <span className="truncate">{current.topicTitle}</span>
          </div>
          <p className="text-xl font-medium whitespace-pre-line">{current.card.front}</p>
          {flipped ? (
            <div className="animate-in mt-6 border-t border-border pt-6 text-lg whitespace-pre-line text-muted">{current.card.back}</div>
          ) : (
            <p className="mt-10 text-center text-sm text-muted">Klikni nebo zmáčkni mezerník pro otočení</p>
          )}
        </Card>
      </button>

      {flipped && (
        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as Rating[]).map((g) => (
            <Button key={g} variant="secondary" onClick={() => rate(g)} className="h-auto flex-col gap-0.5 py-2.5">
              <span className={cn("font-semibold", RATING_STYLE[g])}>{RATING_LABELS[g]}</span>
              <span className="text-xs text-muted">{previewInterval(current.card, g)}</span>
            </Button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-center text-xs text-muted">Klávesy: mezerník = otočit, 1–4 = hodnocení</p>
    </div>
  );
}
