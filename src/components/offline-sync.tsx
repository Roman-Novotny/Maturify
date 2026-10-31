"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { getOfflineDeck, syncOfflineReviews } from "@/app/(app)/study-actions";
import { dropFromQueue, loadDeck, loadQueue, saveDeck } from "@/lib/offline-store";

const DECK_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Běží v přihlášené části: po připojení odešle hodnocení udělaná offline
 * a jednou za hodinu obnoví balíček kartiček v zařízení. Ukazuje stav připojení.
 */
export function OfflineSync() {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (!navigator.onLine) return;
      const queue = loadQueue();
      try {
        if (queue.length) {
          setSyncing(true);
          const n = await syncOfflineReviews(queue);
          dropFromQueue(queue);
          if (!cancelled && n) setMessage(`Odesláno ${n} offline hodnocení kartiček.`);
        }
        const deck = loadDeck();
        if (!deck || Date.now() - new Date(deck.savedAt).getTime() > DECK_MAX_AGE_MS || queue.length) {
          saveDeck(await getOfflineDeck());
        }
      } catch (e) {
        console.error("offline sync", e);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) sync();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      cancelled = true;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  if (online && !syncing && !message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-border bg-panel px-4 py-2.5 text-sm shadow-lg md:bottom-6"
    >
      {!online ? (
        <>
          <CloudOff size={16} className="shrink-0 text-warning" />
          <span className="flex-1">
            Jsi offline. Kartičky můžeš opakovat na{" "}
            <a href="/offline" className="text-primary underline">
              offline stránce
            </a>
            .
          </span>
        </>
      ) : syncing ? (
        <>
          <RefreshCw size={16} className="shrink-0 animate-spin text-primary" /> Synchronizuji offline opakování…
        </>
      ) : (
        <span>{message}</span>
      )}
    </div>
  );
}
