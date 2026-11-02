"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RichMarkdown } from "@/components/rich-markdown";
import { CheckCircle2, Clock, Mic, MicOff, Sparkles, XCircle } from "lucide-react";
import { Button, Card, Input, ProgressBar, Textarea } from "@/components/ui";
import type { Question } from "@/lib/database.types";
import { useDictation } from "@/lib/use-speech";
import { cn } from "@/lib/utils";
import { gradeAnswerWithAI, type AiGrade } from "../../ai-actions";
import { finishTest, submitAnswer, type AnswerResult } from "../../study-actions";

export type RunnerQuestion = {
  id: string;
  prompt: string;
  kind: Question["kind"];
  options: string[] | null;
  reference: string | null;
  answered: boolean;
};

const SELF_SCORES = [
  { value: 0, label: "Nevěděl/a", color: "var(--danger)" },
  { value: 0.25, label: "Málo", color: "var(--danger)" },
  { value: 0.5, label: "Napůl", color: "var(--warning)" },
  { value: 0.75, label: "Skoro", color: "var(--success)" },
  { value: 1, label: "Celé", color: "var(--success)" },
];

export function TestRunner({
  runId,
  title,
  questions,
  deadline,
  aiAvailable,
  lang = "cs-CZ",
}: {
  runId: string;
  title: string;
  questions: RunnerQuestion[];
  deadline: number | null;
  aiAvailable: boolean;
  /** Jazyk diktování (angličtina = en-US). */
  lang?: string;
}) {
  const firstOpen = questions.findIndex((q) => !q.answered);
  const [index, setIndex] = useState(firstOpen === -1 ? questions.length : firstOpen);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidence] = useState(3);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiGrade, setAiGrade] = useState<AiGrade | null>(null);
  const dictation = useDictation(lang, (text) => setAnswer((prev) => (prev ? `${prev.trimEnd()} ${text}` : text)));
  const stopDictation = dictation.stop;
  useEffect(() => {
    if (revealed) stopDictation();
  }, [revealed, stopDictation]);
  const [grading, setGrading] = useState(false);
  const [pending, startTransition] = useTransition();
  const startedAt = useRef(0);
  const q = questions[index];
  const isSelfGraded = q && (q.kind === "open" || q.kind === "oral");

  useEffect(() => {
    startedAt.current = Date.now();
  }, [index]);

  const finish = () => startTransition(() => finishTest(runId));

  // Všechno zodpovězeno (např. po obnovení stránky) → rovnou vyhodnotit.
  useEffect(() => {
    if (index >= questions.length) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, questions.length]);

  function submit(selfScore?: number) {
    if (!q) return;
    setError(null);
    startTransition(async () => {
      const res = await submitAnswer({
        run_id: runId,
        question_id: q.id,
        answer: answer.trim(),
        self_score: selfScore,
        ai_graded: !!aiGrade,
        confidence,
        duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
      });
      if (res.error) setError(res.error);
      else if (isSelfGraded) next();
      else setResult(res);
    });
  }

  async function gradeWithAi() {
    if (!q || !answer.trim()) return;
    setGrading(true);
    setError(null);
    const res = await gradeAnswerWithAI({ runId, questionId: q.id, answer });
    setGrading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAiGrade(res.data);
    setRevealed(true);
  }

  function next() {
    dictation.stop();
    setAnswer("");
    setRevealed(false);
    setResult(null);
    setAiGrade(null);
    setConfidence(3);
    setIndex((i) => i + 1);
  }

  if (!q) {
    return (
      <Card className="text-center">
        <p className="text-muted">Vyhodnocuji test…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span className="truncate">{title}</span>
            <span>
              {index + 1} / {questions.length}
            </span>
          </div>
          <ProgressBar value={index / questions.length} />
        </div>
        {deadline && <Countdown deadline={deadline} onExpire={finish} />}
      </div>

      <Card className="space-y-5">
        <p className="text-lg whitespace-pre-line">{q.prompt}</p>

        {q.kind === "choice" && q.options && (
          <div className="grid gap-2" role="radiogroup">
            {q.options.map((o, i) => {
              const chosen = answer === String(i);
              const isCorrect = result && result.correct_option === i;
              const isWrong = result && chosen && result.correct_option !== i;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={!!result || pending}
                  onClick={() => setAnswer(String(i))}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    isCorrect
                      ? "border-success bg-success/10"
                      : isWrong
                        ? "border-danger bg-danger/10"
                        : chosen
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50",
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-panel-2 text-sm font-medium">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {o}
                </button>
              );
            })}
          </div>
        )}

        {q.kind === "numeric" && (
          <Input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            inputMode="decimal"
            placeholder="Výsledek"
            aria-label="Výsledek"
            disabled={!!result}
            onKeyDown={(e) => {
              if (e.key === "Enter" && answer.trim() && !result) submit();
            }}
            autoFocus
          />
        )}

        {isSelfGraded && (
          <div className="space-y-2">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={q.kind === "oral" ? 4 : 6}
              placeholder={
                dictation.interim ||
                (q.kind === "oral"
                  ? "Odpověz nahlas (mikrofon) nebo si sem napiš hlavní body…"
                  : "Napiš svou odpověď (nebo jen klíčová slova)…")
              }
              aria-label="Tvoje odpověď"
              disabled={revealed}
            />
            {dictation.supported && !revealed && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button
                  variant={dictation.listening ? "danger" : "ghost"}
                  size="sm"
                  onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
                  aria-pressed={dictation.listening}
                >
                  {dictation.listening ? <MicOff size={14} /> : <Mic size={14} />}
                  {dictation.listening ? "Zastavit diktování" : "Odpovědět hlasem"}
                </Button>
                {dictation.listening && <span className="text-danger">Poslouchám…</span>}
                {dictation.error && <span className="text-danger">{dictation.error}</span>}
              </div>
            )}
          </div>
        )}

        {/* Jistota – jen než odpověď odešleš */}
        {!result && !(isSelfGraded && revealed) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Jak moc si jsi jistý/á?</span>
            {[1, 2, 3, 4, 5].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setConfidence(c)}
                className={cn(
                  "size-8 rounded-lg border text-xs",
                  confidence === c ? "border-primary bg-primary/15 text-primary" : "border-border text-muted",
                )}
                aria-pressed={confidence === c}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Zpětná vazba u automaticky hodnocených */}
        {result && (
          <div className={cn("rounded-xl px-4 py-3 text-sm", result.score >= 1 ? "bg-success/10" : "bg-danger/10")}>
            <p className="flex items-center gap-2 font-medium">
              {result.score >= 1 ? (
                <><CheckCircle2 size={18} className="text-success" /> Správně!</>
              ) : (
                <>
                  <XCircle size={18} className="text-danger" /> Špatně
                  {q.kind === "numeric" && <span className="font-normal"> – správně je {result.numeric_answer}</span>}
                </>
              )}
            </p>
            {result.reference && <RichMarkdown text={result.reference} compact className="mt-3 max-h-[70vh] overflow-y-auto rounded-xl bg-panel-2/50 p-4" />}
          </div>
        )}

        {/* Vzorová odpověď + sebehodnocení */}
        {isSelfGraded && revealed && (
          <div className="space-y-4">
            {aiGrade && (
              <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <Sparkles size={16} className="text-primary" /> Návrh AI: {Math.round(aiGrade.score * 100)} %
                </p>
                <p>{aiGrade.feedback}</p>
                {aiGrade.missing.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
                    {aiGrade.missing.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                )}
                <Button size="sm" className="mt-3" disabled={pending} onClick={() => submit(aiGrade.score)}>
                  Přijmout {Math.round(aiGrade.score * 100)} %
                </Button>
              </div>
            )}
            <div className="rounded-xl border border-border bg-panel-2 px-4 py-3">
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Vzorová odpověď</p>
              <p className="text-sm whitespace-pre-line">
                {q.reference ?? "K téhle otázce zatím nemáš vzorovou odpověď – ohodnoť se podle svých materiálů."}
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted">{aiGrade ? "Nebo ohodnoť sám/sama:" : "Kolik z toho jsi věděl/a?"}</p>
              <div className="grid grid-cols-5 gap-2">
                {SELF_SCORES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    disabled={pending}
                    onClick={() => submit(s.value)}
                    className="rounded-xl border border-border px-2 py-2.5 text-xs font-medium transition-colors hover:border-current disabled:opacity-50"
                    style={{ color: s.color }}
                  >
                    {s.label}
                    <span className="block text-[10px] opacity-70">{s.value * 100} %</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={finish} disabled={pending}>
            Ukončit test
          </Button>
          {result ? (
            <Button onClick={next} autoFocus>
              {index + 1 < questions.length ? "Další otázka" : "Vyhodnotit"}
            </Button>
          ) : isSelfGraded ? (
            !revealed && (
              <div className="flex flex-wrap justify-end gap-2">
                {aiAvailable && (
                  <Button variant="secondary" onClick={gradeWithAi} disabled={!answer.trim() || grading}>
                    <Sparkles size={16} /> {grading ? "Hodnotím…" : "Ohodnotit pomocí AI"}
                  </Button>
                )}
                <Button onClick={() => setRevealed(true)} disabled={grading}>
                  Ukázat vzorovou odpověď
                </Button>
              </div>
            )
          ) : (
            <Button onClick={() => submit()} disabled={!answer.trim() || pending}>
              Zkontrolovat
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Countdown({ deadline, onExpire }: { deadline: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const left = Math.max(0, deadline - now);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [left, onExpire]);

  const label = useMemo(() => {
    const s = Math.ceil(left / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, [left]);

  return (
    <span className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium tabular-nums", left < 60_000 ? "bg-danger/15 text-danger" : "bg-panel-2")}>
      <Clock size={14} /> {label}
    </span>
  );
}
