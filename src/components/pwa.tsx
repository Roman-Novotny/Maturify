"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";

/** Registrace service workeru – jen v produkci (v dev by cachoval rozpracovaný kód). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.error("SW registrace selhala", e));
  }, []);
  return null;
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Tlačítko „Nainstalovat aplikaci“ (Chrome/Edge/Android). Na iOS se instaluje přes Sdílet → Přidat na plochu. */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- režim zobrazení zná jen prohlížeč
    if (matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="text-sm text-success">Aplikace je nainstalovaná ✓</p>;
  if (!prompt) {
    return (
      <p className="text-sm text-muted">
        V Chromu/Edge: ikona instalace v adresním řádku. Na iPhonu: Sdílet → Přidat na plochu.
      </p>
    );
  }
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") setInstalled(true);
        setPrompt(null);
      }}
    >
      <Download size={16} /> Nainstalovat aplikaci
    </Button>
  );
}
