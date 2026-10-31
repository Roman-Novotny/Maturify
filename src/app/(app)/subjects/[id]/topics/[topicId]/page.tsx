import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Layers, Play, Timer } from "lucide-react";
import { Badge, Button, buttonClass, Card, CardTitle, EmptyState, ProgressRing, ScoreText, Select } from "@/components/ui";
import {
  getDueFlashcards,
  getFlashcards,
  getMaterials,
  getProgress,
  getQuestions,
  getSubject,
  getTestRuns,
  getTopic,
  getTopicAttempts,
} from "@/lib/dal";
import { DIFFICULTY_LABELS } from "@/lib/subjects";
import { cn, formatDate } from "@/lib/utils";
import { startTest } from "../../../../study-actions";
import { CardsPanel } from "./cards-panel";
import { MaterialsPanel } from "./materials-panel";
import { QuestionsPanel } from "./questions-panel";
import { ScoreSparkline } from "./sparkline";

const TABS = [
  { id: "questions", label: "Otázky" },
  { id: "cards", label: "Kartičky" },
  { id: "materials", label: "Materiály" },
  { id: "history", label: "Pokrok" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export async function generateMetadata({ params }: PageProps<"/subjects/[id]/topics/[topicId]">): Promise<Metadata> {
  const { topicId } = await params;
  const topic = await getTopic(topicId);
  return { title: topic?.title ?? "Téma" };
}

export default async function TopicPage({ params, searchParams }: PageProps<"/subjects/[id]/topics/[topicId]">) {
  const [{ id, topicId }, sp] = await Promise.all([params, searchParams]);
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "questions";

  const [subject, topic] = await Promise.all([getSubject(id), getTopic(topicId)]);
  if (!subject || !topic || topic.subject_id !== subject.id) notFound();

  const [questions, cards, dueCards, progress] = await Promise.all([
    getQuestions(topic.id),
    getFlashcards(topic.id),
    getDueFlashcards({ topicId: topic.id }),
    getProgress(),
  ]);
  const p = progress.find((x) => x.topic_id === topic.id);
  const mastery = p?.mastery ?? 0;
  const base = `/subjects/${subject.id}/topics/${topic.id}`;

  return (
    <div className="animate-in space-y-6">
      <Link href={`/subjects/${subject.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft size={16} /> {subject.name}
      </Link>

      <header className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge color={subject.color}>{subject.short}</Badge>
            <Badge color="var(--muted)">{DIFFICULTY_LABELS[topic.difficulty]}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{topic.title}</h1>
          {topic.description && <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-muted">{topic.description}</p>}
          {p?.next_review_at && <p className="mt-2 text-xs text-muted">Další opakování: {formatDate(p.next_review_at)}</p>}
        </div>
        <ProgressRing value={mastery} size={84} stroke={8} color={subject.color}>
          <span className="text-sm font-semibold">{Math.round(mastery * 100)}%</span>
        </ProgressRing>
      </header>

      {/* Procvičování */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-medium">
            <Play size={16} className="text-primary" /> Test z tématu
          </p>
          {questions.length ? (
            <form action={startTest} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="topic_id" value={topic.id} />
              <Select name="count" defaultValue={Math.min(10, questions.length)} aria-label="Počet otázek">
                {[5, 10, 15, 20, 30].filter((n) => n < questions.length).concat(questions.length).map((n) => (
                  <option key={n} value={n}>{n === questions.length ? `Všech ${n}` : `${n} otázek`}</option>
                ))}
              </Select>
              <Select name="mode" defaultValue="practice" aria-label="Režim">
                <option value="practice">Procvičování</option>
                <option value="timed">Na čas (2 min/otázka)</option>
              </Select>
              <Button type="submit" className="col-span-2 sm:col-span-1">Spustit</Button>
            </form>
          ) : (
            <p className="text-sm text-muted">Nejdřív přidej otázky.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-medium">
            <Layers size={16} className="text-secondary" /> Kartičky
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-muted">
              {cards.length ? `${dueCards.length} k opakování z ${cards.length}` : "Zatím žádné kartičky."}
            </p>
            {dueCards.length > 0 && (
              <Link href={`/review?topic=${topic.id}`} className={buttonClass({ variant: "secondary" })}>
                <Timer size={16} /> Opakovat
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Záložky */}
      <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border" aria-label="Sekce tématu">
        {TABS.map((t) => {
          const count = t.id === "questions" ? questions.length : t.id === "cards" ? cards.length : null;
          return (
            <Link
              key={t.id}
              href={`${base}?tab=${t.id}`}
              scroll={false}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                tab === t.id ? "border-primary text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {t.label}
              {count !== null && <span className="ml-1.5 text-xs text-muted">{count}</span>}
            </Link>
          );
        })}
      </nav>

      {tab === "questions" && <QuestionsPanel topicId={topic.id} questions={questions} />}
      {tab === "cards" && <CardsPanel topicId={topic.id} cards={cards} hasQuestions={questions.some((q) => q.reference)} />}
      {tab === "materials" && <MaterialsPanel topicId={topic.id} materials={await getMaterials(topic.id)} />}
      {tab === "history" && <HistoryPanel topicId={topic.id} />}
    </div>
  );
}

async function HistoryPanel({ topicId }: { topicId: string }) {
  const [attempts, runs] = await Promise.all([getTopicAttempts(topicId, 40), getTestRuns({ topicId, limit: 15 })]);
  const series = attempts
    .filter((a) => a.score !== null)
    .reverse()
    .map((a) => ({ score: a.score ?? 0, at: a.created_at }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Vývoj výsledků</CardTitle>
        {series.length >= 2 ? (
          <ScoreSparkline points={series} />
        ) : (
          <EmptyState title="Málo dat">Graf se ukáže po aspoň dvou odpovědích.</EmptyState>
        )}
        <p className="mt-3 text-xs text-muted">
          Zvládnutí = vážený průměr posledních 20 odpovědí (novější váží víc) a 30 % z aktuální paměti kartiček.
        </p>
      </Card>
      <Card>
        <CardTitle>Testy</CardTitle>
        {runs.length ? (
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/test/${r.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                  <span className="flex-1">
                    {r.mode === "timed" ? "Na čas" : "Procvičování"} · {r.question_ids.length} otázek
                  </span>
                  <span className="text-xs text-muted">{formatDate(r.finished_at ?? r.started_at)}</span>
                  <ScoreText score={r.score ?? 0} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Zatím žádný dokončený test" />
        )}
      </Card>
    </div>
  );
}
