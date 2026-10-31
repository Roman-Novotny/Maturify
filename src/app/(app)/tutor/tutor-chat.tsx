"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Mic, MicOff, Send, Square, Timer, Volume2, VolumeX } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button, Card, Select, Textarea } from "@/components/ui";
import type { AiSource, Subject, SubjectId, TutorMode } from "@/lib/database.types";
import { MODE_INFO } from "@/lib/tutor-modes";
import { useDictation, useSpeaker } from "@/lib/use-speech";
import { cn } from "@/lib/utils";
import type { TutorEvent } from "@/app/api/tutor/route";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; sources: AiSource[]; error?: boolean };

export function TutorChat({
  initial,
  subjects,
  topics,
  disabled,
}: {
  initial: {
    conversationId?: string;
    mode: TutorMode;
    subjectId: SubjectId | null;
    topicId: string | null;
    messages: ChatMessage[];
  };
  subjects: Subject[];
  topics: { id: string; title: string; subject_id: SubjectId }[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initial.conversationId);
  const [mode, setMode] = useState<TutorMode>(initial.mode);
  const [subjectId, setSubjectId] = useState<SubjectId | null>(initial.subjectId);
  const [topicId, setTopicId] = useState<string | null>(initial.topicId);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = !!conversationId || messages.length > 0;
  const info = MODE_INFO[mode];

  // --- Hlas: diktování, předčítání, hlasové zkoušení ---------------------------------
  const lang = subjectId === "en" ? "en-US" : "cs-CZ";
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const inputRef = useRef("");
  const [speakingLeft, setSpeakingLeft] = useState<number | null>(null);
  const speaker = useSpeaker();
  const appendDictated = useCallback((text: string) => {
    setInput((prev) => {
      const next = prev ? `${prev.trimEnd()} ${text}` : text;
      inputRef.current = next;
      return next;
    });
  }, []);
  const dictation = useDictation(lang, appendDictated);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- volba je uložená v prohlížeči
      setVoiceMode(localStorage.getItem("maturify-voice") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  function toggleVoiceMode() {
    const next = !voiceMode;
    setVoiceMode(next);
    if (!next) speaker.stop();
    try {
      localStorage.setItem("maturify-voice", next ? "1" : "0");
    } catch {}
  }

  /** Po odpovědi tutora: v hlasovém režimu ji přečti a ve zkoušení pak rovnou poslouchej. */
  const afterReply = useCallback(
    (text: string) => {
      if (!voiceModeRef.current || !text) return;
      speaker.speak(text, lang, () => {
        if (voiceModeRef.current && (mode === "exam" || mode === "quiz") && dictation.supported) dictation.start();
      });
    },
    [speaker, lang, mode, dictation],
  );

  function toggleMic() {
    if (dictation.listening) {
      dictation.stop();
      // V hlasovém režimu odeslat hned po domluvení.
      if (voiceMode) setTimeout(() => send(inputRef.current), 400);
    } else {
      speaker.stop();
      dictation.start();
    }
  }

  // Angličtina: „mluv 2 minuty na téma“ jako u ústní maturity.
  useEffect(() => {
    if (speakingLeft === null) return;
    if (speakingLeft <= 0) {
      dictation.stop();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- konec odpočtu
      setSpeakingLeft(null);
      setTimeout(() => {
        const said = inputRef.current.trim();
        if (said) send(`[Spoken answer – 2 minutes]\n${said}`);
      }, 600);
      return;
    }
    const t = setTimeout(() => setSpeakingLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakingLeft]);

  function startTwoMinutes() {
    speaker.stop();
    setInput("");
    inputRef.current = "";
    dictation.start();
    setSpeakingLeft(120);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming || disabled) return;
    setInput("");
    setStreaming(true);
    const assistantId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: message, sources: [] },
      { id: assistantId, role: "assistant", content: "", sources: [] },
    ]);
    const update = (fn: (msg: ChatMessage) => ChatMessage) =>
      setMessages((m) => m.map((msg) => (msg.id === assistantId ? fn(msg) : msg)));
    let reply = "";
    let failed = false;

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, mode, subjectId, topicId, message }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Požadavek selhal." }));
        update((msg) => ({ ...msg, content: err.error ?? "Požadavek selhal.", error: true }));
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as TutorEvent;
          if (event.type === "meta") {
            if (!conversationId) {
              setConversationId(event.conversationId);
              // Bez navigace (stream by se přerušil) – jen URL, ať jde konverzace sdílet/obnovit.
              window.history.replaceState(null, "", `/tutor?c=${event.conversationId}`);
            }
            update((msg) => ({ ...msg, sources: event.sources }));
          } else if (event.type === "text") {
            reply += event.text;
            update((msg) => ({ ...msg, content: msg.content + event.text }));
          } else if (event.type === "error") {
            failed = true;
            update((msg) => ({ ...msg, content: msg.content ? `${msg.content}\n\n⚠️ ${event.message}` : event.message, error: true }));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        update((msg) => ({ ...msg, content: "Spojení se přerušilo.", error: true }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      router.refresh(); // historie konverzací vpravo
    }
    if (!failed) afterReply(reply);
  }

  const topicOptions = topics.filter((t) => !subjectId || t.subject_id === subjectId);

  return (
    <Card className="flex min-h-[60vh] flex-col p-0">
      {/* Nastavení konverzace */}
      <div className="space-y-3 border-b border-border p-4">
        {!started ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(MODE_INFO) as TutorMode[]).map((m) => {
                const M = MODE_INFO[m];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      mode === m ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                    )}
                    aria-pressed={mode === m}
                  >
                    <M.icon size={18} className="mt-0.5 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium">{M.label}</span>
                      <span className="block text-xs text-muted">{M.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={subjectId ?? ""}
                onChange={(e) => {
                  setSubjectId((e.target.value || null) as SubjectId | null);
                  setTopicId(null);
                }}
                aria-label="Předmět"
              >
                <option value="">Všechny předměty</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select
                value={topicId ?? ""}
                onChange={(e) => {
                  const t = topics.find((x) => x.id === e.target.value);
                  setTopicId(t?.id ?? null);
                  if (t) setSubjectId(t.subject_id);
                }}
                aria-label="Téma"
              >
                <option value="">Celý předmět</option>
                {topicOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
          </>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <info.icon size={16} className="text-primary" />
            <span className="font-medium">{info.label}</span>
            <span className="text-muted">
              ·{" "}
              {topics.find((t) => t.id === topicId)?.title ??
                subjects.find((s) => s.id === subjectId)?.name ??
                "všechny předměty"}
            </span>
          </p>
        )}
      </div>

      {/* Zprávy */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {!messages.length && (
          <div className="py-10 text-center text-sm text-muted">
            <p>{info.text}</p>
            {info.starter && !disabled && (
              <Button variant="secondary" className="mt-4" onClick={() => send(info.starter!)}>
                Začít
              </Button>
            )}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                m.role === "user" ? "bg-primary text-primary-fg" : m.error ? "bg-danger/10 text-danger" : "bg-panel-2",
              )}
            >
              {m.role === "assistant" ? (
                m.content ? (
                  <Markdown text={m.content} />
                ) : (
                  <span className="inline-flex gap-1 text-muted" aria-label="Píše…">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse [animation-delay:150ms]">●</span>
                    <span className="animate-pulse [animation-delay:300ms]">●</span>
                  </span>
                )
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
              {m.role === "assistant" && m.sources.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2 text-xs text-muted">
                  <FileText size={12} /> Zdroje:
                  {m.sources.map((s) => (
                    <span key={s.material_id} className="rounded bg-panel px-1.5 py-0.5">
                      {s.title}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Hlas */}
      {(dictation.supported || speaker.supported) && !disabled && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 pt-3 text-xs">
          {speaker.supported && (
            <Button variant={voiceMode ? "secondary" : "ghost"} size="sm" onClick={toggleVoiceMode} aria-pressed={voiceMode}>
              {voiceMode ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {mode === "exam" || mode === "quiz" ? "Hlasové zkoušení" : "Číst odpovědi nahlas"}
            </Button>
          )}
          {speaker.speaking && (
            <Button variant="ghost" size="sm" onClick={speaker.stop}>
              Zastavit čtení
            </Button>
          )}
          {subjectId === "en" && mode === "exam" && dictation.supported && (
            <Button variant="ghost" size="sm" onClick={startTwoMinutes} disabled={speakingLeft !== null || streaming}>
              <Timer size={14} /> Mluv 2 minuty
            </Button>
          )}
          {speakingLeft !== null && (
            <span className="rounded-lg bg-primary/15 px-2 py-1 font-medium text-primary tabular-nums" role="timer">
              {Math.floor(speakingLeft / 60)}:{String(speakingLeft % 60).padStart(2, "0")}
            </span>
          )}
          {dictation.listening && (
            <span className="flex items-center gap-1 text-danger">
              <span className="size-2 animate-pulse rounded-full bg-danger" /> Poslouchám ({lang === "en-US" ? "EN" : "CZ"})…
            </span>
          )}
          {dictation.error && <span className="text-danger">{dictation.error}</span>}
          {voiceMode && (mode === "exam" || mode === "quiz") && (
            <span className="text-muted">Odpověz nahlas a zmáčkni mikrofon – odešle se samo.</span>
          )}
        </div>
      )}

      {/* Vstup */}
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={mode === "correct" || mode === "exam" ? 4 : 2}
          placeholder={disabled ? "AI není dostupná" : dictation.interim || info.placeholder}
          disabled={disabled}
          aria-label="Zpráva"
          className="min-h-12 resize-none"
        />
        {dictation.supported && !disabled && (
          <Button
            variant={dictation.listening ? "danger" : "ghost"}
            onClick={toggleMic}
            aria-label={dictation.listening ? "Zastavit diktování" : "Diktovat"}
            aria-pressed={dictation.listening}
            disabled={streaming}
          >
            {dictation.listening ? <MicOff size={16} /> : <Mic size={16} />}
          </Button>
        )}
        {streaming ? (
          <Button variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Zastavit">
            <Square size={16} />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim() || disabled} aria-label="Odeslat">
            <Send size={16} />
          </Button>
        )}
      </form>
    </Card>
  );
}
