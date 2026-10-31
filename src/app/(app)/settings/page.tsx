import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, EmptyState, Input, Label, PageHeader, Select } from "@/components/ui";
import { getAiStatus, getAiUsageSummary, getExamDates, getProfile, getSubjects } from "@/lib/dal";
import { daysUntil, formatDate } from "@/lib/utils";
import { addExam, deleteExam, saveProfile } from "../actions";
import { ThemeSelect } from "./theme-select";

export const metadata: Metadata = { title: "Nastavení" };

const KIND_LABEL = { written: "Písemná", oral: "Ústní", other: "Jiná" } as const;

const FEATURE_LABEL: Record<string, string> = {
  tutor: "AI tutor",
  grade: "Hodnocení odpovědí",
  generate: "Generování kartiček a otázek",
  transcribe: "Přepis materiálů",
};

export default async function SettingsPage() {
  const [profile, subjects, exams, ai, usage] = await Promise.all([
    getProfile(),
    getSubjects(),
    getExamDates(),
    getAiStatus(),
    getAiUsageSummary(30),
  ]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  return (
    <div className="animate-in">
      <PageHeader title="Nastavení" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Profil a učení</CardTitle>
          <ActionForm action={saveProfile} resetOnSuccess={false} successMessage="Uloženo." className="space-y-4">
            <div>
              <Label htmlFor="display_name">Jméno</Label>
              <Input id="display_name" name="display_name" defaultValue={profile?.display_name ?? ""} required maxLength={60} />
            </div>
            <div>
              <Label htmlFor="daily_minutes">Čas na učení denně (minuty)</Label>
              <Input id="daily_minutes" name="daily_minutes" type="number" min={0} max={720} step={5} defaultValue={profile?.daily_minutes ?? 90} />
            </div>
            <div>
              <Label htmlFor="theme">Vzhled</Label>
              <ThemeSelect defaultValue={profile?.theme ?? "dark"} />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="ai_enabled" defaultChecked={profile?.ai_enabled ?? true} className="size-4 accent-[var(--primary)]" />
              Povolit AI funkce – appka funguje i bez nich
            </label>
            <div>
              <Label htmlFor="ai_daily_limit_usd">Denní limit útraty za AI ($)</Label>
              <Input
                id="ai_daily_limit_usd"
                name="ai_daily_limit_usd"
                type="number"
                min={0}
                max={100}
                step={0.25}
                defaultValue={profile?.ai_daily_limit_usd ?? 1}
              />
              <p className="mt-1 text-xs text-muted">Po dosažení limitu se AI do půlnoci vypne. 0 = AI úplně zakázat.</p>
            </div>
            <Button type="submit">Uložit</Button>
          </ActionForm>
        </Card>

        <Card className="lg:order-last">
          <CardTitle>Spotřeba AI (30 dní)</CardTitle>
          {!ai.configured ? (
            <p className="text-sm text-muted">
              AI není nastavená – chybí <code className="rounded bg-panel-2 px-1">GEMINI_API_KEY</code> (zdarma z aistudio.google.com)
              nebo <code className="rounded bg-panel-2 px-1">ANTHROPIC_API_KEY</code> v <code className="rounded bg-panel-2 px-1">.env.local</code>.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted">
                {ai.provider === "gemini" ? "Google Gemini – bezplatná úroveň" : "Anthropic Claude"} · <code>{ai.model}</code>
              </p>
              <p className="text-sm">
                Dnes <strong>{ai.spent.toFixed(3)} $</strong> z {ai.limit.toFixed(2)} $ · za 30 dní{" "}
                <strong>{usage.total.toFixed(2)} $</strong> ({usage.calls} požadavků)
              </p>
              {usage.byFeature.length > 0 && (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {usage.byFeature.map((f) => (
                    <li key={f.feature} className="flex justify-between py-1.5">
                      <span>{FEATURE_LABEL[f.feature] ?? f.feature}</span>
                      <span className="text-muted tabular-nums">
                        {f.calls}× · {f.cost.toFixed(3)} $
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted">
                {ai.provider === "gemini"
                  ? "Gemini běží zdarma (projekt bez placení) – útrata je 0 $, omezený je jen počet požadavků za minutu a za den. Google může data z bezplatné úrovně použít ke zlepšování svých modelů."
                  : "Ceny jsou odhad podle počtu tokenů; přesné vyúčtování je v Anthropic Console."}
              </p>
            </>
          )}
        </Card>

        <Card>
          <CardTitle>Termíny maturity</CardTitle>
          {exams.length ? (
            <ul className="mb-5 divide-y divide-border">
              {exams.map((e) => {
                const subject = e.subject_id ? subjectById.get(e.subject_id) : undefined;
                const days = daysUntil(e.exam_at);
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.label}</p>
                      <p className="text-xs text-muted">
                        {KIND_LABEL[e.kind]} · {formatDate(e.exam_at)} · {days >= 0 ? `za ${days} d.` : "proběhlo"}
                      </p>
                    </div>
                    {subject && <Badge color={subject.color}>{subject.short}</Badge>}
                    <form action={deleteExam}>
                      <input type="hidden" name="id" value={e.id} />
                      <Button type="submit" variant="danger" size="sm" aria-label="Smazat termín">
                        <Trash2 size={14} />
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mb-5">
              <EmptyState title="Zatím žádné termíny">Přidej termíny písemné a ústní části – podle nich se počítá odpočet a naléhavost témat.</EmptyState>
            </div>
          )}

          <ActionForm action={addExam} className="space-y-3">
            <div>
              <Label htmlFor="label">Název</Label>
              <Input id="label" name="label" required maxLength={120} placeholder="Např. Didaktický test – matematika" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="kind">Část</Label>
                <Select id="kind" name="kind" defaultValue="written">
                  <option value="written">Písemná</option>
                  <option value="oral">Ústní</option>
                  <option value="other">Jiná</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="exam_subject">Předmět</Label>
                <Select id="exam_subject" name="subject_id" defaultValue="">
                  <option value="">Všechny</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="exam_at">Datum</Label>
              <Input id="exam_at" name="exam_at" type="date" required />
            </div>
            <Button type="submit" variant="secondary" className="w-full">Přidat termín</Button>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
