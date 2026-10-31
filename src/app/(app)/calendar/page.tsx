import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Circle, Sparkles } from "lucide-react";
import { Badge, buttonClass, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import {
  getExamDates,
  getFlashcardReviews,
  getProfile,
  getProgress,
  getStudySessions,
  getSubjects,
  getTasksBetween,
  getTopics,
} from "@/lib/dal";
import { addDays, planRange } from "@/lib/planner";
import { dailyMinutes } from "@/lib/stats";
import { cn, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Kalendář" };

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const PREVIEW_DAYS = 28;

const pragueDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date(iso));
const monthTitle = (ym: string) =>
  new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`));
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function shiftMonth(ym: string, delta: number) {
  const d = new Date(`${ym}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/** Intenzita podle odučených minut – jedna barva, světlá → tmavá (sekvenční škála). */
const HEAT = [
  { min: 1, mix: 28, label: "1–29 min" },
  { min: 30, mix: 38, label: "30–59 min" },
  { min: 60, mix: 60, label: "60–89 min" },
  { min: 90, mix: 85, label: "90+ min" },
];
const heatFor = (m: number) => [...HEAT].reverse().find((h) => m >= h.min);
// Míchá se s barvou prázdné buňky, ať je i nejnižší stupeň od ní jasně odlišitelný.
const heatColor = (mix: number) => `color-mix(in srgb, var(--primary) ${mix}%, var(--panel-2))`;

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const today = todayISO();
  const ym = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const selected = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today.startsWith(ym) ? today : `${ym}-01`;

  // Mřížka od pondělí před 1. dnem měsíce, 6 týdnů.
  const first = `${ym}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDays(first, -offset);
  const grid = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const gridEnd = grid.at(-1)!;

  const [subjects, topics, progress, exams, profile, tasks, sessions, reviews] = await Promise.all([
    getSubjects(),
    getTopics(),
    getProgress(),
    getExamDates(),
    getProfile(),
    getTasksBetween(gridStart, gridEnd),
    getStudySessions(new Date(`${gridStart}T00:00:00Z`).toISOString()),
    getFlashcardReviews(new Date(`${gridStart}T00:00:00Z`).toISOString()),
  ]);

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const minutesByDate = new Map(dailyMinutes(sessions, reviews, gridEnd, 42).map((d) => [d.date, d.minutes]));
  const tasksByDate = new Map<string, typeof tasks>();
  for (const t of tasks) tasksByDate.set(t.due_date, [...(tasksByDate.get(t.due_date) ?? []), t]);
  const examsByDate = new Map<string, typeof exams>();
  for (const e of exams) {
    const d = pragueDate(e.exam_at);
    examsByDate.set(d, [...(examsByDate.get(d) ?? []), e]);
  }

  // Náhled budoucích dnů (od zítřka) – přepočítává se pokaždé, nic se neukládá.
  const week = profile?.minutes_by_weekday ?? [90, 90, 90, 90, 90, 120, 120];
  const preview = topics.length ? planRange(topics, progress, exams, week, addDays(today, 1), PREVIEW_DAYS) : [];
  const previewByDate = new Map(preview.map((p) => [p.date, p]));

  const selTasks = tasksByDate.get(selected) ?? [];
  const selPreview = selected > today ? previewByDate.get(selected) : undefined;
  const selExams = examsByDate.get(selected) ?? [];
  const selMinutes = minutesByDate.get(selected) ?? 0;
  const href = (params: { m?: string; d?: string }) => `/calendar?m=${params.m ?? ym}${params.d ? `&d=${params.d}` : ""}`;

  return (
    <div className="animate-in">
      <PageHeader
        title="Kalendář"
        subtitle="Termíny, splněné úkoly a odučený čas. Budoucí dny ukazují náhled plánu podle aktuálních priorit."
        action={
          <Link href="/plan" className={buttonClass({ variant: "secondary" })}>
            Dnešní plán
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <Link href={href({ m: shiftMonth(ym, -1) })} className={buttonClass({ variant: "ghost", size: "sm" })} aria-label="Předchozí měsíc">
              <ChevronLeft size={18} />
            </Link>
            <h2 className="font-semibold capitalize">{monthTitle(ym)}</h2>
            <Link href={href({ m: shiftMonth(ym, 1) })} className={buttonClass({ variant: "ghost", size: "sm" })} aria-label="Další měsíc">
              <ChevronRight size={18} />
            </Link>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((date) => {
              const inMonth = date.startsWith(ym);
              const minutes = minutesByDate.get(date) ?? 0;
              const heat = date <= today ? heatFor(minutes) : undefined;
              const dayTasks = tasksByDate.get(date) ?? [];
              const done = dayTasks.filter((t) => t.done_at).length;
              const dayExams = examsByDate.get(date) ?? [];
              const planned = date > today ? previewByDate.get(date)?.items.length ?? 0 : 0;
              return (
                <Link
                  key={date}
                  href={href({ d: date })}
                  scroll={false}
                  aria-label={`${longDate(date)}${dayExams.length ? ", zkouška" : ""}${minutes ? `, ${minutes} min učení` : ""}`}
                  aria-current={date === today ? "date" : undefined}
                  className={cn(
                    "relative flex aspect-square flex-col rounded-lg border p-1 text-left text-xs transition-colors sm:p-1.5",
                    selected === date ? "border-primary" : "border-transparent hover:border-border",
                    !inMonth && "opacity-40",
                  )}
                  style={{ background: heat ? heatColor(heat.mix) : "var(--panel-2)" }}
                >
                  <span className={cn("self-start font-medium", date === today && "rounded bg-text px-1 text-bg")}>{Number(date.slice(8))}</span>
                  <span className="mt-auto flex flex-wrap items-center gap-0.5">
                    {dayExams.length > 0 && <CalendarClock size={12} className="text-danger" aria-hidden />}
                    {dayTasks.length > 0 && (
                      <span className="hidden text-[10px] text-muted sm:inline">
                        {done}/{dayTasks.length}
                      </span>
                    )}
                    {planned > 0 && <span className="size-1.5 rounded-full bg-muted" aria-hidden />}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <CalendarClock size={12} className="text-danger" /> zkouška
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-muted" /> naplánováno
            </span>
            <span className="flex items-center gap-1">
              Odučeno:
              {HEAT.map((h) => (
                <span key={h.min} className="flex items-center gap-1">
                  <span className="inline-block size-3 rounded-sm" style={{ background: heatColor(h.mix) }} />
                  {h.label}
                </span>
              ))}
            </span>
          </div>
        </Card>

        <Card>
          <CardTitle>{longDate(selected)}</CardTitle>
          {selExams.map((e) => (
            <p key={e.id} className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm">
              <CalendarClock size={16} className="text-danger" /> {e.label}
            </p>
          ))}
          {selected <= today && selMinutes > 0 && <p className="mb-3 text-sm text-muted">Odučeno {selMinutes} min</p>}

          {selected <= today ? (
            selTasks.length ? (
              <ul className="space-y-2">
                {selTasks.map((t) => {
                  const subject = t.subject_id ? subjectById.get(t.subject_id) : undefined;
                  return (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      {t.done_at ? <CheckCircle2 size={16} className="shrink-0 text-success" /> : <Circle size={16} className="shrink-0 text-muted" />}
                      <span className={cn("flex-1", t.done_at && "text-muted line-through")}>{t.title}</span>
                      {subject && <Badge color={subject.color}>{subject.short}</Badge>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              !selExams.length && <EmptyState title="Žádné úkoly" />
            )
          ) : selPreview ? (
            selPreview.items.length ? (
              <>
                <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
                  <Sparkles size={12} /> Náhled · {selPreview.minutes} min · může se změnit podle toho, jak se ti bude dařit
                </p>
                <ul className="space-y-2">
                  {selPreview.items.map((it) => {
                    const subject = subjectById.get(it.topic.subject_id);
                    return (
                      <li key={it.topic.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1">
                          {it.kind === "review" ? "Opakuj" : "Nauč se"}: {it.topic.title}
                        </span>
                        {subject && <Badge color={subject.color}>{subject.short}</Badge>}
                        <span className="w-12 text-right text-xs text-muted">{it.minutes} min</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <EmptyState title="Volný den">Na tenhle den nemáš nastavený čas na učení.</EmptyState>
            )
          ) : (
            <EmptyState title="Bez náhledu">Plán se ukazuje na {PREVIEW_DAYS} dní dopředu.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
