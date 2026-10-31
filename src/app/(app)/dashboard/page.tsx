import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Circle, Layers, Lightbulb, ListChecks, Target, TrendingUp } from "lucide-react";
import { Badge, buttonClass, Card, CardTitle, EmptyState, ProgressBar, ProgressRing, ScoreText, SubjectIcon } from "@/components/ui";
import {
  countDueFlashcards,
  getExamDates,
  getProfile,
  getProgress,
  getRecentAttempts,
  getSubjects,
  getTasksForDate,
  getTestRuns,
  getTopics,
} from "@/lib/dal";
import { computeReadiness, rankTopics } from "@/lib/planner";
import { daysUntil, formatDate, pct, plural, todayISO } from "@/lib/utils";
import { generateTodayPlan, toggleTask } from "../actions";

export const metadata: Metadata = { title: "Přehled" };

export default async function DashboardPage() {
  const [profile, subjects, topics, progress, exams, tasks, attempts, runs, dueCards] = await Promise.all([
    getProfile(),
    getSubjects(),
    getTopics(),
    getProgress(),
    getExamDates(),
    getTasksForDate(todayISO()),
    getRecentAttempts(6),
    getTestRuns({ limit: 6 }),
    countDueFlashcards(),
  ]);

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const { overall, perSubject } = computeReadiness(subjects, topics, progress);
  const upcoming = exams.filter((e) => daysUntil(e.exam_at) >= 0);
  const written = upcoming.find((e) => e.kind === "written");
  const oral = upcoming.find((e) => e.kind === "oral");
  const weakest = rankTopics(topics, progress, exams).slice(0, 4);
  const doneMinutes = tasks.filter((t) => t.done_at).reduce((a, t) => a + t.minutes, 0);
  const plannedMinutes = tasks.reduce((a, t) => a + t.minutes, 0);
  const firstName = profile?.display_name?.split(" ")[0] ?? "";
  const top = weakest[0];

  return (
    <div className="animate-in space-y-6">
      <header>
        <p className="text-sm text-muted">{formatDate(new Date().toISOString())}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Ahoj{firstName && `, ${firstName}`} 👋</h1>
      </header>

      {/* Odpočty + celková připravenost */}
      <div className="grid gap-4 md:grid-cols-3">
        <Countdown label="Písemná část" exam={written} />
        <Countdown label="Ústní část" exam={oral} />
        <Card className="flex items-center gap-5">
          <ProgressRing value={overall} size={92} stroke={9}>
            <span className="text-xl font-semibold">{Math.round(overall * 100)}%</span>
          </ProgressRing>
          <div>
            <p className="text-sm text-muted">Celková připravenost</p>
            <p className="mt-1 text-sm">
              {topics.length
                ? `${progress.filter((p) => p.attempts_count > 0).length} z ${topics.length} témat procvičeno`
                : "Zatím žádná témata"}
            </p>
          </div>
        </Card>
      </div>

      {dueCards > 0 && (
        <Card className="flex flex-wrap items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
            <Layers size={20} />
          </span>
          <p className="flex-1">
            <strong>{dueCards}</strong> {plural(dueCards, ["kartička čeká", "kartičky čekají", "kartiček čeká"])} na opakování.
          </p>
          <Link href="/review" className={buttonClass({ size: "sm" })}>
            Opakovat
          </Link>
        </Card>
      )}

      {/* Doporučení systému */}
      {top && (
        <Card className="flex flex-col gap-4 border-primary/40 bg-gradient-to-br from-primary/15 to-transparent sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
            <Lightbulb size={20} />
          </span>
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Doporučení systému</p>
            <p className="mt-1">
              Dnes věnuj {top.mastery < 0.3 ? 35 : 25} minut tématu <strong>{top.topic.title}</strong> (
              {subjectById.get(top.topic.subject_id)?.name}). {top.reason}.
            </p>
          </div>
          <Link href={`/subjects/${top.topic.subject_id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Otevřít <ArrowRight size={14} />
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Dnešní plán */}
        <Card>
          <CardTitle
            icon={<ListChecks size={16} />}
            action={
              <Link href="/plan" className="text-xs text-muted hover:text-primary">
                {doneMinutes}/{plannedMinutes || profile?.daily_minutes || 0} min →
              </Link>
            }
          >
            Dnešní plán
          </CardTitle>
          {tasks.length ? (
            <ul className="space-y-1">
              {tasks.map((t) => {
                const subject = t.subject_id ? subjectById.get(t.subject_id) : undefined;
                return (
                  <li key={t.id}>
                    <form action={toggleTask} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-panel-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="done" value={String(!t.done_at)} />
                      <button
                        type="submit"
                        aria-label={t.done_at ? "Označit jako nehotové" : "Označit jako hotové"}
                        className="text-muted hover:text-success"
                      >
                        {t.done_at ? <CheckCircle2 size={20} className="text-success" /> : <Circle size={20} />}
                      </button>
                      <span className={`flex-1 text-sm ${t.done_at ? "text-muted line-through" : ""}`}>{t.title}</span>
                      {subject && <Badge color={subject.color}>{subject.short}</Badge>}
                      <span className="w-14 text-right text-xs text-muted">{t.minutes} min</span>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Na dnešek nemáš plán">
              {topics.length ? (
                <form action={generateTodayPlan} className="mt-3">
                  <button type="submit" className={buttonClass({ size: "sm" })}>
                    Sestavit dnešní plán
                  </button>
                </form>
              ) : (
                <>
                  Nejdřív si v{" "}
                  <Link href="/subjects" className="text-primary hover:underline">
                    Předmětech
                  </Link>{" "}
                  přidej maturitní témata.
                </>
              )}
            </EmptyState>
          )}
        </Card>

        {/* Nedostatky */}
        <Card>
          <CardTitle icon={<AlertTriangle size={16} />}>Největší nedostatky</CardTitle>
          {weakest.length ? (
            <ul className="space-y-3">
              {weakest.map(({ topic, mastery, reason }) => {
                const subject = subjectById.get(topic.subject_id);
                return (
                  <li key={topic.id}>
                    <Link href={`/subjects/${topic.subject_id}`} className="group block">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate group-hover:text-primary">{topic.title}</span>
                        <span className="shrink-0 text-xs text-muted">{reason}</span>
                      </div>
                      <ProgressBar value={mastery} color={subject?.color} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Zatím není co hodnotit" />
          )}
        </Card>
      </div>

      {/* Předměty */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
          <Target size={16} /> Připravenost podle předmětů
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {perSubject.map(({ subject, readiness, topicCount, studiedCount }) => (
            <Link key={subject.id} href={`/subjects/${subject.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <div className="mb-4 flex items-center gap-3">
                  <SubjectIcon short={subject.short} color={subject.color} />
                  <div>
                    <p className="font-medium">{subject.name}</p>
                    <p className="text-xs text-muted">
                      {topicCount
                        ? `${studiedCount}/${topicCount} ${plural(topicCount, ["téma", "témata", "témat"])}`
                        : "Bez témat"}
                    </p>
                  </div>
                </div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted">Připravenost</span>
                  <span className="font-medium">{pct(readiness)}</span>
                </div>
                <ProgressBar value={readiness} color={subject.color} />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Poslední výsledky */}
      <Card>
        <CardTitle icon={<TrendingUp size={16} />}>Poslední výsledky</CardTitle>
        {runs.length ? (
          <ul className="divide-y divide-border">
            {runs.map((r) => {
              const topic = r.topic_id ? topicById.get(r.topic_id) : undefined;
              const subject = r.subject_id ? subjectById.get(r.subject_id) : undefined;
              return (
                <li key={r.id}>
                  <Link href={`/test/${r.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                    {subject && <Badge color={subject.color}>{subject.short}</Badge>}
                    <span className="flex-1 truncate">
                      {topic?.title ?? (subject ? `Test – ${subject.name}` : "Test")}
                      <span className="text-muted"> · {r.question_ids.length} ot.</span>
                    </span>
                    <span className="hidden text-xs text-muted sm:inline">{formatDate(r.finished_at ?? r.started_at)}</span>
                    <ScoreText score={r.score ?? 0} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : attempts.length ? (
          <ul className="divide-y divide-border">
            {attempts.map((a) => {
              const topic = a.topic_id ? topicById.get(a.topic_id) : undefined;
              const subject = topic ? subjectById.get(topic.subject_id) : undefined;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  {subject && <Badge color={subject.color}>{subject.short}</Badge>}
                  <span className="flex-1 truncate">{topic?.title ?? "Smazané téma"}</span>
                  <span className="hidden text-xs text-muted sm:inline">{formatDate(a.created_at)}</span>
                  <ScoreText score={a.score ?? 0} />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Zatím žádné výsledky">Spusť test u tématu nebo si ohodnoť znalosti v Předmětech.</EmptyState>
        )}
      </Card>
    </div>
  );
}

function Countdown({ label, exam }: { label: string; exam?: { exam_at: string; label: string } }) {
  if (!exam) {
    return (
      <Card className="flex flex-col justify-between">
        <p className="flex items-center gap-2 text-sm text-muted">
          <CalendarClock size={16} /> {label}
        </p>
        <p className="mt-3 text-sm">
          Termín není nastavený.{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Přidat
          </Link>
        </p>
      </Card>
    );
  }
  const days = daysUntil(exam.exam_at);
  return (
    <Card>
      <p className="flex items-center gap-2 text-sm text-muted">
        <CalendarClock size={16} /> {label}
      </p>
      <p className="mt-2 text-4xl font-semibold tracking-tight">
        {days} <span className="text-base font-normal text-muted">{plural(days, ["den", "dny", "dní"])}</span>
      </p>
      <p className="mt-1 truncate text-xs text-muted">
        {exam.label} · {formatDate(exam.exam_at)}
      </p>
    </Card>
  );
}
