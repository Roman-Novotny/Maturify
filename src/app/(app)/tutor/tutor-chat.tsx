"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, FileText, GraduationCap, MessageCircleQuestion, PenLine, Send, Square } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button, Card, Select, Textarea } from "@/components/ui";
import type { AiSource, Subject, SubjectId, TutorMode } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import type { TutorEvent } from "@/app/api/tutor/route";

export const MODE_INFO: Record<TutorMode, { label: string; text: string; icon: typeof PenLine; placeholder: string; starter?: string }> = {
  explain: {
    label: "Vysvětli mi",
    text: "Vysvětlí látku jednoduše, postupně a na příkladech.",
    icon: MessageCircleQuestion,
    placeholder: "Co ti mám vysvětlit?",
  },
  quiz: {
    label: "Vyzkoušej mě",
    text: "Pokládá otázky a čeká na tvoje odpovědi.",
    icon: BookOpenCheck,
    placeholder: "Odpověz…",
    starter: "Vyzkoušej mě z tohoto tématu.",
  },
  exam: {
    label: "Zkoušení jako u maturity",
    text: "Simulace ústní zkoušky s doplňujícími otázkami.",
    icon: GraduationCap,
    placeholder: "Mluv jako u maturity… (napiš „konec“ pro hodnocení)",
    starter: "Jsem připraven/a, můžeme začít zkoušení.",
  },
  correct: {
    label: "Oprav mou odpověď",
    text: "Vyhodnotí odpověď podle vzorové odpovědi a vysvětlí chyby.",
    icon: PenLine,
    placeholder: "Vlož otázku a svou odpověď…",
  },
};

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
            update((msg) => ({ ...msg, content: msg.content + event.text }));
          } else if (event.type === "error") {
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
          placeholder={disabled ? "AI není dostupná" : info.placeholder}
          disabled={disabled}
          aria-label="Zpráva"
          className="min-h-12 resize-none"
        />
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
