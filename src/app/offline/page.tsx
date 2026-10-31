import type { Metadata } from "next";
import { OfflineReview } from "./offline-review";

export const metadata: Metadata = { title: "Offline" };

// Statická stránka (bez přihlášení a serverových dat) – service worker ji má v cache a ukáže ji bez internetu.
export default function OfflinePage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={36} height={36} />
        <div>
          <h1 className="text-xl font-semibold">Maturify offline</h1>
          <p className="text-sm text-muted">Bez internetu můžeš opakovat kartičky uložené v tomhle zařízení.</p>
        </div>
      </div>
      <OfflineReview />
    </main>
  );
}
