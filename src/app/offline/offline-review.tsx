"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonClass, Card, EmptyState } from "@/components/ui";
import { enqueueReview, loadDeck, loadQueue, saveDeck, type StoredDeck } from "@/lib/offline-store";
import { previewInterval, RATING_LABELS, schedule, type Rating } from "@/lib/srs";
import { cn, plural } from "@/lib/utils";

export function OfflineReview() {
  const [deck, setDeck] = useState<StoredDeck | null>(null);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [now, setNow] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- data jsou jen v úložišti prohlížeče */
    setDeck(loadDeck());
    setQueued(loadQueue().length);
    setOnline(navigator.onLine);
    setNow(Date.now());
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  if (!loaded) return null;

  const due = (deck?.cards ?? []).filter((c) => new Date(c.due_at).getTime() <= now);
  const current = due[0];

  function rate(g: Rating) {
    if (!current || !deck) return;
    const at = new Date();
    enqueueReview({ cardId: current.id, rating: g, reviewedAt: at.toISOString() });
    // Lokálně přeplánovat, ať se karta hned znovu neukáže (server to po synchronizaci spočítá znovu).
    const next = schedule(current, g, at);
    const updated = { ...deck, cards: deck.cards.map((c) => (c.id === current.id ? { ...c, ...next } : c)) };
    saveDeck(updated.cards);
    setDeck(updated);
    setQueued((q) => q + 1);
    setFlipped(false);
    setNow(at.getTime());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", online ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
          {online ? "Online" : "Offline"}
        </span>
        <span className="text-muted">
          {queued > 0 ? `${queued} ${plural(queued, ["hodnocení čeká", "hodnocení čekají", "hodnocení čeká"])} na odeslání` : "Vše odesláno"}
        </span>
        {online && (
          <Link href="/dashboard" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Zpět do aplikace
          </Link>
        )}
      </div>

      {!deck ? (
        <Card>
          <EmptyState title="V zařízení nejsou uložené kartičky">
            Otevři Maturify aspoň jednou s internetem – kartičky na další týden se uloží automaticky.
          </EmptyState>
        </Card>
      ) : !current ? (
        <Card>
          <EmptyState title="Hotovo – nic k opakování 🎉">
            {online ? "Po návratu do aplikace se hodnocení odešlou samo." : "Hodnocení se odešlou, jakmile budeš zase online."}
          </EmptyState>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted">
            Zbývá {due.length} · uloženo {new Date(deck.savedAt).toLocaleString("cs-CZ")}
          </p>
          <button type="button" onClick={() => setFlipped(true)} disabled={flipped} className="block w-full text-left">
            <Card className="min-h-56">
              <p className="mb-3 text-xs text-muted">{current.topicTitle}</p>
              <p className="text-xl font-medium whitespace-pre-line">{current.front}</p>
              {flipped ? (
                <p className="mt-6 border-t border-border pt-6 text-lg whitespace-pre-line text-muted">{current.back}</p>
              ) : (
                <p className="mt-10 text-center text-sm text-muted">Klepni pro otočení</p>
              )}
            </Card>
          </button>
          {flipped && (
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as Rating[]).map((g) => (
                <Button key={g} variant="secondary" onClick={() => rate(g)} className="h-auto flex-col gap-0.5 py-2.5">
                  <span className="font-semibold">{RATING_LABELS[g]}</span>
                  <span className="text-xs text-muted">{previewInterval(current, g)}</span>
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
