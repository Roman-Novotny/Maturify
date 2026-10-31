// Úložiště pro offline opakování v tomto zařízení (localStorage). Vše obalené try/catch –
// v anonymním okně nebo se zablokovaným úložištěm appka funguje dál, jen bez offline režimu.

import type { OfflineCard } from "@/app/(app)/study-actions";
import type { Rating } from "@/lib/srs";

const DECK = "maturify-offline-deck";
const QUEUE = "maturify-offline-queue";

export type QueuedReview = { cardId: string; rating: Rating; reviewedAt: string };
export type StoredDeck = { savedAt: string; cards: OfflineCard[] };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadDeck = () => read<StoredDeck | null>(DECK, null);
export const saveDeck = (cards: OfflineCard[]) => write(DECK, { savedAt: new Date().toISOString(), cards } satisfies StoredDeck);

export const loadQueue = () => read<QueuedReview[]>(QUEUE, []);
export const saveQueue = (q: QueuedReview[]) => write(QUEUE, q);

export function enqueueReview(item: QueuedReview) {
  return saveQueue([...loadQueue(), item]);
}

/** Odstraní z fronty položky, které už jsou na serveru (porovnání podle karty a času). */
export function dropFromQueue(done: QueuedReview[]) {
  const key = (q: QueuedReview) => `${q.cardId}|${q.reviewedAt}`;
  const sent = new Set(done.map(key));
  saveQueue(loadQueue().filter((q) => !sent.has(key(q))));
}
