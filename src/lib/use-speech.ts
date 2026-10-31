"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API: rozpoznávání řeči (diktování) a předčítání. Rozpoznávání funguje v Chromu/Edge/Safari,
// ve Firefoxu ne – komponenty to musí ověřit přes `supported`.

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Mikrofon je zablokovaný – povol ho v nastavení prohlížeče.",
  "service-not-allowed": "Mikrofon je zablokovaný – povol ho v nastavení prohlížeče.",
  "no-speech": "Nic jsem neslyšel/a. Zkus to znovu.",
  network: "Rozpoznávání řeči potřebuje internet.",
  "audio-capture": "Nenašel/našla jsem mikrofon.",
};

/**
 * Diktování: `onFinal` dostává hotové úseky textu, `interim` je rozpracovaný text pro zobrazení.
 * Rozpoznávání se po pauze samo ukončí – při `continuous` ho restartujeme, dokud uživatel nezastaví.
 */
export function useDictation(lang: string, onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const wantRef = useRef(false);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- podpora API je známá až v prohlížeči
    setSupported(!!getRecognition());
    return () => {
      wantRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return;
      if (e.error !== "no-speech") wantRef.current = false;
      setError(ERRORS[e.error] ?? `Chyba rozpoznávání řeči (${e.error}).`);
    };
    rec.onend = () => {
      setInterim("");
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* už běží */
        }
      }
      setListening(false);
    };
    wantRef.current = true;
    setError(null);
    setListening(true);
    recRef.current = rec;
    rec.start();
  }, [lang]);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  return { supported, listening, interim, error, start, stop };
}

/** Text pro předčítání: bez Markdownu a odkazů na zdroje. */
export function plainForSpeech(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Předčítání přes speechSynthesis; vybere hlas pro daný jazyk, pokud je k dispozici. */
export function useSpeaker() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- podpora API je známá až v prohlížeči
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback((text: string, lang: string, onEnd?: () => void) => {
    if (!("speechSynthesis" in window) || !text.trim()) return onEnd?.();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plainForSpeech(text));
    u.lang = lang;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.onstart = () => setSpeaking(true);
    u.onend = () => {
      setSpeaking(false);
      onEnd?.();
    };
    u.onerror = () => {
      setSpeaking(false);
      onEnd?.();
    };
    window.speechSynthesis.speak(u);
  }, []);

  const stop = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { supported, speaking, speak, stop };
}
