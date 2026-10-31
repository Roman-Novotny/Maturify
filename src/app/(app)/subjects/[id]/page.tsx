import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, CardTitle, EmptyState, ProgressRing, SubjectIcon } from "@/components/ui";
import type { SubjectId } from "@/lib/database.types";
import { getProgress, getSubject, getTopics } from "@/lib/dal";
import { computeReadiness } from "@/lib/planner";
import { SUBJECT_MODULES } from "@/lib/subjects";
import { AddTopicForms, TopicRow } from "./topic-ui";

export async function generateMetadata({ params }: PageProps<"/subjects/[id]">): Promise<Metadata> {
  const { id } = await params;
  const subject = await getSubject(id);
  return { title: subject?.name ?? "Předmět" };
}

export default async function SubjectPage({ params }: PageProps<"/subjects/[id]">) {
  const { id } = await params;
  const subject = await getSubject(id);
  if (!subject) notFound();

  const [topics, progress] = await Promise.all([getTopics(subject.id as SubjectId), getProgress()]);
  const progressByTopic = new Map(progress.map((p) => [p.topic_id, p]));
  const { perSubject } = computeReadiness([subject], topics, progress);
  const readiness = perSubject[0]?.readiness ?? 0;
  const info = SUBJECT_MODULES[subject.id];

  return (
    <div className="animate-in space-y-6">
      <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft size={16} /> Předměty
      </Link>

      <header className="flex flex-wrap items-center gap-5">
        <SubjectIcon short={subject.short} color={subject.color} size={56} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{subject.name}</h1>
          <p className="text-sm text-muted">{info.tagline} · {subject.description}</p>
        </div>
        <ProgressRing value={readiness} size={76} stroke={8} color={subject.color}>
          <span className="text-sm font-semibold">{Math.round(readiness * 100)}%</span>
        </ProgressRing>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardTitle>Maturitní témata ({topics.length})</CardTitle>
          {topics.length ? (
            <ul className="divide-y divide-border">
              {topics.map((topic, i) => (
                <TopicRow
                  key={topic.id}
                  index={i + 1}
                  topic={topic}
                  progress={progressByTopic.get(topic.id) ?? null}
                  color={subject.color}
                />
              ))}
            </ul>
          ) : (
            <EmptyState title="Zatím tu nejsou žádná témata">
              Přidej témata podle požadavků své školy – ručně, nebo vlož celý seznam najednou.
            </EmptyState>
          )}
        </Card>

        <div className="space-y-6">
          <AddTopicForms subjectId={subject.id} hint={info.topicHint} />
          <Card>
            <CardTitle>Moduly předmětu</CardTitle>
            <ul className="space-y-2 text-sm">
              {info.modules.map((m) => (
                <li key={m} className="flex items-center justify-between gap-2">
                  <span>{m}</span>
                  <span className="text-xs text-muted">brzy</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Otázky, materiály, kartičky a testy přibydou ve Fázi 2. Teď si u každého tématu můžeš ohodnotit, jak ho umíš (0–5).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
