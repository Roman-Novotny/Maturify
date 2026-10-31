import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Circle, RefreshCw, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, buttonClass, Card, CardTitle, EmptyState, Input, PageHeader, ProgressBar, Select } from "@/components/ui";
import { getExamDates, getProfile, getProgress, getSubjects, getTasksForDate, getTopics, requireUser } from "@/lib/dal";
import { ensureTodayPlan } from "@/lib/plan-service";
import { addDays, minutesForDate, planRange } from "@/lib/planner";
import { todayISO } from "@/lib/utils";
import { addTask, deleteTask, generateTodayPlan, toggleTask } from "../actions";
import { TaskTimer } from "./task-timer";

export const metadata: Metadata = { title: "Plán" };

const KIND_LABEL = { study: "Učení", review: "Opakování", test: "Test", custom: "Vlastní" } as const;

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export default async function PlanPage() {
  const { supabase } = await requireUser();
  const today = todayISO();
  const [profile, subjects, topics, progress, exams] = await Promise.all([
    getProfile(),
    getSubjects(),
    getTopics(),
    getProgress(),
    getExamDates(),
  ]);
  // Automatický denní plán: při první návštěvě dne se sestaví sám.
  await ensureTodayPlan(supabase, topics.length > 0);
  const tasks = await getTasksForDate(today);

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const done = tasks.filter((t) => t.done_at).reduce((a, t) => a + t.minutes, 0);
  const total = tasks.reduce((a, t) => a + t.minutes, 0);
  const week = profile?.minutes_by_weekday ?? [90, 90, 90, 90, 90, 120, 120];
  const budget = minutesForDate(week, today);
  const upcoming = topics.length ? planRange(topics, progress, exams, week, addDays(today, 1), 6) : [];

  return (
    <div className="animate-in">
      <PageHeader
        title="Dnešní plán"
        subtitle={`Dnes máš ${budget} min (podle dne v týdnu, změníš v Nastavení). Plán se každý den sestaví sám; nesplněné úkoly se nehromadí.`}
        action={
          <div className="flex gap-2">
            <Link href="/calendar" className={buttonClass({ variant: "ghost" })}>
              <CalendarDays size={16} /> Kalendář
            </Link>
            {topics.length > 0 && (
              <form action={generateTodayPlan}>
                <Button type="submit" variant="secondary">
                  <RefreshCw size={16} /> Přeplánovat
                </Button>
              </form>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardTitle action={<span className="text-xs text-muted">{done}/{total} min hotovo</span>}>Úkoly</CardTitle>
          <div className="mb-4">
            <ProgressBar value={total ? done / total : 0} color="var(--success)" />
          </div>
          {tasks.length ? (
            <ul className="space-y-1">
              {tasks.map((t) => {
                const subject = t.subject_id ? subjectById.get(t.subject_id) : undefined;
                return (
                  <li key={t.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-panel-2">
                    <form action={toggleTask} className="flex">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="done" value={String(!t.done_at)} />
                      <button
                        type="submit"
                        aria-label={t.done_at ? "Označit jako nehotové" : "Označit jako hotové"}
                        className="text-muted hover:text-success"
                      >
                        {t.done_at ? <CheckCircle2 size={20} className="text-success" /> : <Circle size={20} />}
                      </button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${t.done_at ? "text-muted line-through" : ""}`}>{t.title}</p>
                      <p className="text-xs text-muted">{KIND_LABEL[t.kind]} · {t.minutes} min</p>
                    </div>
                    {subject && <Badge color={subject.color}>{subject.short}</Badge>}
                    {!t.done_at && <TaskTimer taskId={t.id} plannedMinutes={t.minutes} />}
                    <form action={deleteTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button type="submit" variant="danger" size="sm" aria-label="Smazat úkol" className="md:opacity-0 md:group-hover:opacity-100">
                        <Trash2 size={14} />
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Žádné úkoly na dnešek">
              {topics.length ? "Dnes nemáš čas na učení (viz Nastavení), nebo jsou všechna témata v pohodě." : "Nejdřív si přidej témata v Předmětech."}
            </EmptyState>
          )}
        </Card>

        <Card>
          <CardTitle>Vlastní úkol</CardTitle>
          <ActionForm action={addTask} className="space-y-3">
            <Input name="title" required maxLength={200} placeholder="Např. Přečíst Máchův Máj" aria-label="Úkol" />
            <div className="flex gap-2">
              <Select name="subject_id" defaultValue="" aria-label="Předmět">
                <option value="">Bez předmětu</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <Input name="minutes" type="number" min={1} max={600} defaultValue={25} className="w-24" aria-label="Minuty" />
            </div>
            <Button type="submit" className="w-full">Přidat</Button>
          </ActionForm>
        </Card>
      </div>

      {upcoming.length > 0 && (
        <Card className="mt-6">
          <CardTitle action={<Link href="/calendar" className="text-xs text-muted hover:text-primary">Celý kalendář →</Link>}>
            Výhled na další dny
          </CardTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((day) => (
              <li key={day.date} className="rounded-xl bg-panel-2 p-3">
                <p className="mb-2 flex justify-between text-sm font-medium capitalize">
                  {shortDay(day.date)}
                  <span className="text-xs font-normal text-muted">{day.minutes} min</span>
                </p>
                {day.items.length ? (
                  <ul className="space-y-1 text-xs text-muted">
                    {day.items.slice(0, 4).map((it) => (
                      <li key={it.topic.id} className="truncate">
                        {it.kind === "review" ? "↻" : "•"} {it.topic.title}
                      </li>
                    ))}
                    {day.items.length > 4 && <li>+ {day.items.length - 4} další</li>}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">Volno</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Náhled se přepočítává podle toho, jak se ti daří – není to závazný rozpis.</p>
        </Card>
      )}
    </div>
  );
}
