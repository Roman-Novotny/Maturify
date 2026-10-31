import type { Metadata } from "next";
import Link from "next/link";
import { ChartTable, ColumnChart, LineChart, type LineSeries } from "@/components/charts";
import { Card, CardTitle, EmptyState, PageHeader, ProgressBar, SubjectIcon } from "@/components/ui";
import {
  getExamDates,
  getFinishedTestRunsSince,
  getFlashcardReviews,
  getProgress,
  getReadinessSnapshots,
  getStudySessions,
  getSubjects,
  getTopics,
} from "@/lib/dal";
import { addDays, computeReadiness, nearestExam, rankTopics } from "@/lib/planner";
import { average, currentStreak, dailyMinutes, requiredPace, reviewRetention } from "@/lib/stats";
import { daysUntil, pct, plural, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Statistiky" };

const DAYS = 30;

const dayTick = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
};
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("cs-CZ", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export default async function StatsPage() {
  const today = todayISO();
  const from = addDays(today, -(DAYS - 1));
  const sinceISO = new Date(`${from}T00:00:00+01:00`).toISOString();

  const [subjects, topics, progress, exams, sessions, reviews, snapshots, runs] = await Promise.all([
    getSubjects(),
    getTopics(),
    getProgress(),
    getExamDates(),
    getStudySessions(sinceISO),
    getFlashcardReviews(sinceISO),
    getReadinessSnapshots(from),
    getFinishedTestRunsSince(sinceISO),
  ]);

  const days = dailyMinutes(sessions, reviews, today, DAYS);
  const total = days.reduce((a, d) => a + d.minutes, 0);
  const last7 = days.slice(-7).reduce((a, d) => a + d.minutes, 0);
  const streak = currentStreak(days);
  const retention = reviewRetention(reviews);
  const testAvg = average(runs.map((r) => r.score ?? 0));
  const { overall, perSubject } = computeReadiness(subjects, topics, progress);
  const studied = new Set(progress.filter((p) => p.attempts_count > 0).map((p) => p.topic_id));
  const unstudied = topics.filter((t) => !studied.has(t.id)).length;
  const exam = nearestExam(exams, null);
  const pace = requiredPace(unstudied, exam ? daysUntil(exam.exam_at) : null);
  const weakest = rankTopics(topics, progress, exams).slice(0, 5);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // Vývoj připravenosti: celkem (zvýrazněně) + předměty s tématy.
  const snapDates = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const snapByDate = new Map(snapshots.map((s) => [s.snap_date, s]));
  const activeSubjects = perSubject.filter((s) => s.topicCount > 0).map((s) => s.subject);
  const readinessSeries: LineSeries[] = [
    {
      key: "overall",
      label: "Celkem",
      color: "var(--text)",
      emphasis: true,
      values: snapDates.map((d) => snapByDate.get(d)?.overall ?? null),
    },
    ...activeSubjects.map((s) => ({
      key: s.id,
      label: s.name,
      color: s.color,
      values: snapDates.map((d) => snapByDate.get(d)?.by_subject?.[s.id] ?? null),
    })),
  ];

  return (
    <div className="animate-in space-y-6">
      <PageHeader title="Statistiky" subtitle={`Posledních ${DAYS} dní`} />

      {/* Souhrn */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Odučeno za 7 dní" value={formatMinutes(last7)} sub={`${formatMinutes(total)} za ${DAYS} dní`} />
        <Stat label="Dní v řadě" value={String(streak)} sub={streak ? "Nepřeruš to 🔥" : "Začni dnes"} />
        <Stat label="Průměr testů" value={testAvg === null ? "–" : pct(testAvg)} sub={`${runs.length} ${plural(runs.length, ["test", "testy", "testů"])}`} />
        <Stat
          label="Úspěšnost kartiček"
          value={retention === null ? "–" : pct(retention)}
          sub={`${reviews.length} ${plural(reviews.length, ["opakování", "opakování", "opakování"])}`}
        />
      </div>

      <Card>
        <CardTitle>Čas učení po dnech</CardTitle>
        {total > 0 ? (
          <>
            <ColumnChart
              ariaLabel={`Odučené minuty za posledních ${DAYS} dní`}
              data={days.map((d, i) => ({
                key: d.date,
                label: dayLabel(d.date),
                tick: i % 5 === 4 || i === days.length - 1 ? dayTick(d.date) : undefined,
                value: d.minutes,
              }))}
              unit="min"
            />
            <ChartTable caption="Odučené minuty po dnech" columns={["Den", "Minuty"]} rows={days.map((d) => [dayLabel(d.date), d.minutes])} />
            <p className="mt-2 text-xs text-muted">Počítají se splněné úkoly, testy, časovač a opakování kartiček (~10 s na kartu).</p>
          </>
        ) : (
          <EmptyState title="Zatím žádný zaznamenaný čas">Odškrtni splněný úkol v Plánu, dokonči test nebo zopakuj kartičky.</EmptyState>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardTitle>Vývoj připravenosti</CardTitle>
          {snapshots.length >= 2 ? (
            <>
              <LineChart
                ariaLabel="Vývoj připravenosti v procentech"
                xLabels={snapDates.map((d, i) => ({ key: d, label: dayLabel(d), tick: (i % 7 === 0 && DAYS - 1 - i >= 4) || i === DAYS - 1 ? dayTick(d) : undefined }))}
                series={readinessSeries}
              />
              <ChartTable
                caption="Připravenost po dnech"
                columns={["Den", ...readinessSeries.map((s) => s.label)]}
                rows={snapshots.map((s) => [
                  dayLabel(s.snap_date),
                  pct(s.overall),
                  ...activeSubjects.map((sub) => (s.by_subject?.[sub.id] === undefined ? "–" : pct(s.by_subject[sub.id]!))),
                ])}
              />
            </>
          ) : (
            <EmptyState title="Graf se ukáže po pár dnech">Připravenost se ukládá jednou denně při otevření přehledu.</EmptyState>
          )}
        </Card>

        <Card>
          <CardTitle>Pokrytí témat</CardTitle>
          <p className="text-4xl font-semibold">{topics.length ? pct(studied.size / topics.length) : "–"}</p>
          <p className="mt-1 text-sm text-muted">
            {studied.size} z {topics.length} témat aspoň jednou procvičeno · připravenost {pct(overall)}
          </p>
          {pace !== null && exam && (
            <p className="mt-4 rounded-xl bg-panel-2 px-3 py-2 text-sm">
              Do „{exam.label}“ zbývá {daysUntil(exam.exam_at)} dní. Abys stihl/a projít všech {unstudied} zbývajících témat, potřebuješ
              tempo <strong>{pace.toFixed(1)} témat týdně</strong>.
            </p>
          )}
          <ul className="mt-5 space-y-3">
            {perSubject
              .filter((s) => s.topicCount > 0)
              .map(({ subject, readiness, studiedCount, topicCount }) => (
                <li key={subject.id} className="flex items-center gap-3">
                  <SubjectIcon short={subject.short} color={subject.color} size={28} />
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{subject.name}</span>
                      <span className="text-muted tabular-nums">
                        {studiedCount}/{topicCount} · {pct(readiness)}
                      </span>
                    </div>
                    <ProgressBar value={readiness} color={subject.color} />
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardTitle>Na co se zaměřit</CardTitle>
        {weakest.length ? (
          <ul className="divide-y divide-border">
            {weakest.map(({ topic, mastery, reason }) => {
              const subject = subjectById.get(topic.subject_id);
              return (
                <li key={topic.id}>
                  <Link href={`/subjects/${topic.subject_id}/topics/${topic.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                    {subject && <SubjectIcon short={subject.short} color={subject.color} size={24} />}
                    <span className="flex-1 truncate">{topic.title}</span>
                    <span className="hidden text-xs text-muted sm:inline">{reason}</span>
                    <span className="w-12 text-right text-muted tabular-nums">{pct(mastery)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Žádná témata" />
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Card>
  );
}

function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
