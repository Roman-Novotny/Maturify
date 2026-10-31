import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import type { TutorMode } from "@/lib/database.types";
import { getAiStatus, getConversation, getConversations, getSubjects, getTopics } from "@/lib/dal";
import { cn, formatDate } from "@/lib/utils";
import { MODE_INFO } from "@/lib/tutor-modes";
import { TutorChat } from "./tutor-chat";

export const metadata: Metadata = { title: "AI Tutor" };

const MODES = ["explain", "quiz", "exam", "correct"] as const;

export default async function TutorPage({ searchParams }: PageProps<"/tutor">) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const conversationId = str(sp.c);

  const [status, conversations, subjects, topics, current] = await Promise.all([
    getAiStatus(),
    getConversations(),
    getSubjects(),
    getTopics(),
    conversationId ? getConversation(conversationId) : null,
  ]);

  const initialMode = MODES.find((m) => m === str(sp.mode)) ?? "explain";
  const initialTopic = topics.find((t) => t.id === str(sp.topic));

  return (
    <div className="animate-in">
      <PageHeader
        title="AI Tutor"
        subtitle="Učí tě z tvých materiálů a maturitních otázek. Když v nich něco nenajde, řekne to – nevymýšlí si požadavky školy."
        action={
          current && (
            <Link href="/tutor" className={buttonClass({ variant: "secondary" })}>
              <MessageSquarePlus size={16} /> Nová konverzace
            </Link>
          )
        }
      />

      {!status.available && <AiUnavailable status={status} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <TutorChat
          key={current?.conversation.id ?? "new"}
          disabled={!status.available}
          subjects={subjects}
          topics={topics.map((t) => ({ id: t.id, title: t.title, subject_id: t.subject_id }))}
          initial={
            current
              ? {
                  conversationId: current.conversation.id,
                  mode: current.conversation.mode,
                  subjectId: current.conversation.subject_id,
                  topicId: current.conversation.topic_id,
                  messages: current.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources })),
                }
              : {
                  mode: initialMode,
                  subjectId: initialTopic?.subject_id ?? null,
                  topicId: initialTopic?.id ?? null,
                  messages: [],
                }
          }
        />

        <aside className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Historie</h2>
          {conversations.length ? (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/tutor?c=${c.id}`}
                    className={cn(
                      "block rounded-xl px-3 py-2 text-sm transition-colors",
                      c.id === current?.conversation.id ? "bg-primary/15 text-primary" : "hover:bg-panel-2",
                    )}
                  >
                    <span className="line-clamp-1">{c.title}</span>
                    <span className="text-xs text-muted">
                      {MODE_INFO[c.mode as TutorMode].label} · {formatDate(c.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Zatím žádné konverzace.</p>
          )}
          {status.configured && (
            <p className="pt-2 text-xs text-muted">
              Dnes utraceno {status.spent.toFixed(3)} $ z limitu {status.limit.toFixed(2)} $.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function AiUnavailable({ status }: { status: { configured: boolean; enabled: boolean; spent: number; limit: number } }) {
  return (
    <Card className="mb-6 border-warning/40">
      {!status.configured ? (
        <p className="text-sm">
          AI zatím není nastavená. Do souboru <code className="rounded bg-panel-2 px-1">.env.local</code> přidej{" "}
          <code className="rounded bg-panel-2 px-1">GEMINI_API_KEY=…</code> (zdarma z aistudio.google.com) a restartuj server. Zbytek
          aplikace funguje i bez AI.
        </p>
      ) : !status.enabled ? (
        <p className="text-sm">
          AI funkce máš vypnuté. Zapneš je v{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Nastavení
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm">
          Dnešní limit AI ({status.limit.toFixed(2)} $) je vyčerpaný. Zítra to půjde znovu, nebo ho zvyš v{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Nastavení
          </Link>
          .
        </p>
      )}
    </Card>
  );
}
