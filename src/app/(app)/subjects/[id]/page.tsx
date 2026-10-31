import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Play } from "lucide-react";
import { Button, Card, CardTitle, EmptyState, ProgressRing, Select, SubjectIcon } from "@/components/ui";
import type { SubjectId } from "@/lib/database.types";
import { getProgress, getSubject, getTopicCounts, getTopics } from "@/lib/dal";
import { computeReadiness } from "@/lib/planner";
import { SUBJECT_MODULES } from "@/lib/subjects";
import { startTest } from "../../study-actions";
import { AddTopicForms, TopicRow } from "./topic-ui";

export async function generateMetadata({ params }: PageProps<"/subjects/[id]">): Promise<Metadata> {
  const { id } = await params;
  const subject = await getSubject(id);
  return { title: subject?.name ?? "Předmět" };
}

export default async function SubjectPage({ params, searchParams }: PageProps<"/subjects/[id]">) {
  const [{ id }, { empty }] = await Promise.all([params, searchParams]);
  const subject = await getSubject(id);
  if (!subject) notFound();

  const [topics, progress, counts] = await Promise.all([getTopics(subject.id as SubjectId), getProgress(), getTopicCounts()]);
  const questionTotal = topics.reduce((a, t) => a + (counts.questions.get(t.id) ?? 0), 0);
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
                  counts={{
                    questions: counts.questions.get(topic.id) ?? 0,
                    cards: counts.cards.get(topic.id) ?? 0,
                    materials: counts.materials.get(topic.id) ?? 0,
                  }}
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
            <CardTitle icon={<Play size={16} />}>Test z celého předmětu</CardTitle>
            {empty && <p className="mb-3 text-sm text-warning">Zatím tu nejsou žádné otázky – přidej je u jednotlivých témat.</p>}
            {questionTotal ? (
              <form action={startTest} className="space-y-3">
                <input type="hidden" name="subject_id" value={subject.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Select name="count" defaultValue={Math.min(15, questionTotal)} aria-label="Počet otázek">
                    {[5, 10, 15, 20, 30, 50].filter((n) => n <= questionTotal).map((n) => (
                      <option key={n} value={n}>{n} otázek</option>
                    ))}
                    {questionTotal < 50 && ![5, 10, 15, 20, 30].includes(questionTotal) && (
                      <option value={questionTotal}>Všech {questionTotal}</option>
                    )}
                  </Select>
                  <Select name="mode" defaultValue="practice" aria-label="Režim">
                    <option value="practice">Procvičování</option>
                    <option value="timed">Na čas</option>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Spustit test</Button>
                <p className="text-xs text-muted">Přednost mají otázky, které jsi ještě neprocvičil/a nebo ti nešly.</p>
              </form>
            ) : (
              <p className="text-sm text-muted">Otázky přidáš po otevření tématu.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
