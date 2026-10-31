import type { Metadata } from "next";
import { CheckCircle2, Circle, RefreshCw, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, EmptyState, Input, PageHeader, ProgressBar, Select } from "@/components/ui";
import { getProfile, getSubjects, getTasksForDate, getTopics } from "@/lib/dal";
import { todayISO } from "@/lib/utils";
import { addTask, deleteTask, generateTodayPlan, toggleTask } from "../actions";

export const metadata: Metadata = { title: "Plán" };

const KIND_LABEL = { study: "Učení", review: "Opakování", test: "Test", custom: "Vlastní" } as const;

export default async function PlanPage() {
  const [profile, subjects, topics, tasks] = await Promise.all([getProfile(), getSubjects(), getTopics(), getTasksForDate(todayISO())]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const done = tasks.filter((t) => t.done_at).reduce((a, t) => a + t.minutes, 0);
  const total = tasks.reduce((a, t) => a + t.minutes, 0);
  const budget = profile?.daily_minutes ?? 90;

  return (
    <div className="animate-in">
      <PageHeader
        title="Dnešní plán"
        subtitle={`Dostupný čas: ${budget} min denně (změníš v Nastavení). Nesplněné úkoly se nehromadí – plán se skládá znovu podle priorit.`}
        action={
          topics.length > 0 && (
            <form action={generateTodayPlan}>
              <Button type="submit" variant="secondary">
                <RefreshCw size={16} /> {tasks.some((t) => t.kind !== "custom") ? "Přeplánovat" : "Sestavit plán"}
              </Button>
            </form>
          )
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
              {topics.length ? "Klikni na „Sestavit plán“ – vybere nejslabší a nejnaléhavější témata." : "Nejdřív si přidej témata v Předmětech."}
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
    </div>
  );
}
