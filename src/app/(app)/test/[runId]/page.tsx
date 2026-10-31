import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, CircleDashed, XCircle } from "lucide-react";
import { Badge, buttonClass, Card, ProgressRing, ScoreText } from "@/components/ui";
import { getAiStatus, getSubjects, requireUser } from "@/lib/dal";
import { cn, formatDate, pct } from "@/lib/utils";
import { TestRunner, type RunnerQuestion } from "./test-runner";

export const metadata: Metadata = { title: "Test" };

export default async function TestPage({ params }: PageProps<"/test/[runId]">) {
  const { runId } = await params;
  const { supabase } = await requireUser();

  const { data: run } = await supabase.from("test_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) notFound();

  const [{ data: questions }, { data: attempts }, { data: topics }, subjects] = await Promise.all([
    supabase.from("questions").select("*, answers(body, is_reference)").in("id", run.question_ids),
    supabase.from("attempts").select("*").eq("test_run_id", run.id),
    run.topic_id ? supabase.from("topics").select("id, title").eq("id", run.topic_id) : Promise.resolve({ data: null }),
    getSubjects(),
  ]);
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  // Zachovat pořadí z test_runs (smazané otázky vynechat).
  const ordered = run.question_ids.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
  const subject = subjects.find((s) => s.id === run.subject_id);
  const title = topics?.[0]?.title ?? subject?.name ?? "Test";
  const backHref = run.topic_id && subject ? `/subjects/${subject.id}/topics/${run.topic_id}` : subject ? `/subjects/${subject.id}` : "/subjects";

  const header = (
    <>
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft size={16} /> {title}
      </Link>
    </>
  );

  if (!run.finished_at) {
    const answered = new Set((attempts ?? []).map((a) => a.question_id));
    const runnerQuestions: RunnerQuestion[] = ordered.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      options: q.options,
      // Vzorová odpověď jde do prohlížeče jen u otázek, které se hodnotí sebehodnocením.
      reference:
        q.kind === "open" || q.kind === "oral"
          ? ((q.answers as { body: string; is_reference: boolean }[]).find((a) => a.is_reference)?.body ?? null)
          : null,
      answered: answered.has(q.id),
    }));
    const deadline = run.time_limit_sec ? new Date(run.started_at).getTime() + run.time_limit_sec * 1000 : null;

    return (
      <div className="animate-in mx-auto max-w-3xl space-y-6">
        {header}
        <TestRunner
          runId={run.id}
          title={title}
          questions={runnerQuestions}
          deadline={deadline}
          aiAvailable={(await getAiStatus()).available}
        />
      </div>
    );
  }

  // Výsledky
  const attemptByQ = new Map((attempts ?? []).map((a) => [a.question_id, a]));
  const score = run.score ?? 0;
  const correct = ordered.filter((q) => (attemptByQ.get(q.id)?.score ?? 0) >= 0.7).length;
  const durationMin = Math.max(1, Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 60000));

  return (
    <div className="animate-in mx-auto max-w-3xl space-y-6">
      {header}
      <Card className="flex flex-wrap items-center gap-6">
        <ProgressRing value={score} size={110} stroke={10} color={score >= 0.7 ? "var(--success)" : score >= 0.4 ? "var(--warning)" : "var(--danger)"}>
          <span className="text-2xl font-semibold">{Math.round(score * 100)}%</span>
        </ProgressRing>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Výsledek testu</h1>
          <p className="mt-1 text-sm text-muted">
            {correct} z {ordered.length} správně · {durationMin} min · {formatDate(run.finished_at)}
            {run.mode === "timed" && " · na čas"}
          </p>
          <p className="mt-3 text-sm">{verdict(score)}</p>
        </div>
        <Link href={backHref} className={buttonClass({ variant: "secondary" })}>Zpět k tématu</Link>
      </Card>

      <ol className="space-y-3">
        {ordered.map((q, i) => {
          const a = attemptByQ.get(q.id);
          const s = a?.score ?? null;
          const ref = (q.answers as { body: string; is_reference: boolean }[]).find((x) => x.is_reference)?.body;
          const Icon = s === null ? CircleDashed : s >= 0.7 ? CheckCircle2 : XCircle;
          return (
            <li key={q.id}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <Icon size={20} className={cn("mt-0.5 shrink-0", s === null ? "text-muted" : s >= 0.7 ? "text-success" : "text-danger")} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="whitespace-pre-line">
                      <span className="text-muted">{i + 1}. </span>
                      {q.prompt}
                    </p>
                    {s === null ? (
                      <p className="text-sm text-muted">Nezodpovězeno</p>
                    ) : (
                      <>
                        {q.kind === "choice" && q.options ? (
                          <p className="text-sm">
                            Tvoje odpověď: <strong>{q.options[Number(a?.answer)] ?? "–"}</strong>
                            {s < 1 && <> · správně: <strong className="text-success">{q.options[q.correct_option ?? 0]}</strong></>}
                          </p>
                        ) : q.kind === "numeric" ? (
                          <p className="text-sm">
                            Tvoje odpověď: <strong>{a?.answer ?? "–"}</strong>
                            {s < 1 && <> · správně: <strong className="text-success">{q.numeric_answer}</strong></>}
                          </p>
                        ) : (
                          a?.answer && <p className="rounded-lg bg-panel-2 px-3 py-2 text-sm whitespace-pre-line">{a.answer}</p>
                        )}
                        {ref && (
                          <details className="text-sm">
                            <summary className="cursor-pointer text-muted hover:text-text">
                              {q.kind === "open" || q.kind === "oral" ? "Vzorová odpověď" : "Vysvětlení"}
                            </summary>
                            <p className="mt-2 whitespace-pre-line text-muted">{ref}</p>
                          </details>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {s !== null && <ScoreText score={s} />}
                    {a?.graded_by === "self" && <Badge color="var(--muted)">sebehodnocení</Badge>}
                    {a?.graded_by === "ai" && <Badge>hodnotila AI</Badge>}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-xs text-muted">Celkové skóre {pct(score)} se započítalo do zvládnutí témat.</p>
    </div>
  );
}

function verdict(score: number) {
  if (score >= 0.9) return "Výborně! Tohle téma máš v malíčku.";
  if (score >= 0.7) return "Dobrá práce. Projdi si chyby a za pár dní to zopakuj.";
  if (score >= 0.4) return "Základ tam je, ale je na čem pracovat. Projdi si vzorové odpovědi.";
  return "Tohle téma potřebuje víc času. Začni materiály a kartičkami, pak test zopakuj.";
}
