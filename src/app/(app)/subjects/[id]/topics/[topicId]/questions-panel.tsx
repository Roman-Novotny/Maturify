"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, EmptyState, Input, Label, Select, Textarea } from "@/components/ui";
import type { Question } from "@/lib/database.types";
import { DIFFICULTY_LABELS } from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { deleteQuestion, importQuestions, saveQuestion } from "../../../../study-actions";
import { AiGenerate } from "./ai-generate";

type QuestionWithRef = Question & { reference: string | null };

export const KIND_LABEL: Record<Question["kind"], string> = {
  open: "Otevřená",
  oral: "Ústní",
  choice: "Výběr",
  numeric: "Číselná",
};

export function QuestionsPanel({
  topicId,
  questions,
  aiAvailable,
}: {
  topicId: string;
  questions: QuestionWithRef[];
  aiAvailable: boolean;
}) {
  const [adding, setAdding] = useState<"single" | "bulk" | null>(questions.length ? null : "single");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={adding === "single" ? "primary" : "secondary"} onClick={() => setAdding(adding === "single" ? null : "single")}>
          <Plus size={16} /> Nová otázka
        </Button>
        <Button variant={adding === "bulk" ? "primary" : "ghost"} onClick={() => setAdding(adding === "bulk" ? null : "bulk")}>
          Vložit seznam
        </Button>
        <AiGenerate topicId={topicId} kind="questions" available={aiAvailable} />
      </div>

      {adding === "single" && (
        <Card>
          <CardTitle>Nová otázka</CardTitle>
          <QuestionForm topicId={topicId} />
        </Card>
      )}
      {adding === "bulk" && (
        <Card>
          <CardTitle>Vložit seznam otázek</CardTitle>
          <ActionForm action={importQuestions} className="space-y-3" onSuccess={() => setAdding(null)}>
            <input type="hidden" name="topic_id" value={topicId} />
            <Textarea
              name="lines"
              rows={8}
              required
              aria-label="Otázky"
              placeholder={"Co je to normalizace databáze? | Proces odstranění redundance…\nVysvětli rozdíl mezi TCP a UDP | TCP je spojované…"}
            />
            <p className="text-xs text-muted">Jedna otázka na řádek. Vzorovou odpověď můžeš přidat za svislítko „|“.</p>
            <div className="flex gap-2">
              <Select name="kind" defaultValue="open" className="max-w-48" aria-label="Typ">
                <option value="open">Otevřené</option>
                <option value="oral">Ústní</option>
              </Select>
              <Button type="submit">Vložit</Button>
            </div>
          </ActionForm>
        </Card>
      )}

      {questions.length ? (
        <ul className="space-y-3">
          {questions.map((q, i) =>
            editing === q.id ? (
              <li key={q.id}>
                <Card>
                  <CardTitle>Upravit otázku</CardTitle>
                  <QuestionForm topicId={topicId} question={q} onDone={() => setEditing(null)} />
                </Card>
              </li>
            ) : (
              <QuestionItem key={q.id} index={i + 1} question={q} onEdit={() => setEditing(q.id)} />
            ),
          )}
        </ul>
      ) : (
        !adding && (
          <EmptyState title="Žádné otázky">
            Přidej maturitní otázky od učitele – ze vzorových odpovědí pak můžeš udělat kartičky a test.
          </EmptyState>
        )
      )}
    </div>
  );
}

function QuestionItem({ index, question: q, onEdit }: { index: number; question: QuestionWithRef; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!q.reference || q.kind === "choice" || q.kind === "numeric";

  return (
    <li className="group rounded-2xl border border-border bg-panel">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 w-6 shrink-0 text-right text-sm text-muted tabular-nums">{index}.</span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-line">{q.prompt}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge>{KIND_LABEL[q.kind]}</Badge>
            <span>{DIFFICULTY_LABELS[q.difficulty]}</span>
            {q.source && <span>· {q.source}</span>}
            {!q.reference && q.kind !== "choice" && q.kind !== "numeric" && <span className="text-warning">· bez vzorové odpovědi</span>}
          </div>
        </div>
        <div className="flex shrink-0">
          {hasDetail && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Zobrazit odpověď">
              <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Upravit">
            <Pencil size={14} />
          </Button>
          <form
            action={deleteQuestion}
            onSubmit={(e) => {
              if (!window.confirm("Smazat otázku?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={q.id} />
            <input type="hidden" name="topic_id" value={q.topic_id} />
            <Button type="submit" variant="danger" size="sm" aria-label="Smazat">
              <Trash2 size={14} />
            </Button>
          </form>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3 pl-13 text-sm">
          {q.kind === "choice" && q.options && (
            <ol className="space-y-1">
              {q.options.map((o, i) => (
                <li key={i} className={cn(i === q.correct_option ? "font-medium text-success" : "text-muted")}>
                  {String.fromCharCode(65 + i)}) {o}
                </li>
              ))}
            </ol>
          )}
          {q.kind === "numeric" && (
            <p>
              Výsledek: <strong>{q.numeric_answer}</strong>
              {q.tolerance > 0 && <span className="text-muted"> (± {q.tolerance})</span>}
            </p>
          )}
          {q.reference && <p className="whitespace-pre-line text-muted">{q.reference}</p>}
        </div>
      )}
    </li>
  );
}

function QuestionForm({ topicId, question, onDone }: { topicId: string; question?: QuestionWithRef; onDone?: () => void }) {
  const [kind, setKind] = useState<Question["kind"]>(question?.kind ?? "open");
  // Po přidání otázky se formulář vytvoří znovu (čistá pole), ale zvolený typ zůstane.
  const [version, setVersion] = useState(0);
  const optionsText =
    question?.options?.map((o, i) => (i === question.correct_option ? `*${o}` : o)).join("\n") ?? "";

  return (
    <ActionForm
      key={version}
      action={saveQuestion}
      className="space-y-3"
      resetOnSuccess={false}
      onSuccess={question ? onDone : () => setVersion((v) => v + 1)}
    >
      <input type="hidden" name="topic_id" value={topicId} />
      {question && <input type="hidden" name="id" value={question.id} />}
      <div>
        <Label htmlFor={`prompt-${question?.id ?? "new"}`}>Otázka</Label>
        <Textarea id={`prompt-${question?.id ?? "new"}`} name="prompt" required defaultValue={question?.prompt} rows={3} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Typ</Label>
          <Select name="kind" defaultValue={kind} onChange={(e) => setKind(e.target.value as Question["kind"])} aria-label="Typ">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Obtížnost</Label>
          <Select name="difficulty" defaultValue={question?.difficulty ?? 3} aria-label="Obtížnost">
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Zdroj</Label>
          <Input name="source" defaultValue={question?.source ?? ""} placeholder="Učitel, učebnice…" maxLength={200} aria-label="Zdroj" />
        </div>
      </div>

      {kind === "choice" && (
        <div>
          <Label>Možnosti</Label>
          <Textarea name="options" rows={4} defaultValue={optionsText} placeholder={"Praha\n*Brno\nOstrava"} aria-label="Možnosti" />
          <p className="mt-1 text-xs text-muted">Každá možnost na nový řádek, správnou označ hvězdičkou na začátku.</p>
        </div>
      )}
      {kind === "numeric" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Správný výsledek</Label>
            <Input name="numeric_answer" inputMode="decimal" defaultValue={question?.numeric_answer ?? ""} aria-label="Správný výsledek" />
          </div>
          <div>
            <Label>Tolerance ±</Label>
            <Input name="tolerance" inputMode="decimal" defaultValue={question?.tolerance ?? 0} aria-label="Tolerance" />
          </div>
        </div>
      )}

      <div>
        <Label>{kind === "choice" || kind === "numeric" ? "Vysvětlení / postup (volitelné)" : "Vzorová odpověď"}</Label>
        <Textarea name="reference" rows={kind === "open" || kind === "oral" ? 6 : 3} defaultValue={question?.reference ?? ""} aria-label="Vzorová odpověď" />
      </div>
      <div className="flex gap-2">
        <Button type="submit">{question ? "Uložit" : "Přidat otázku"}</Button>
        {onDone && question && (
          <Button variant="ghost" onClick={onDone}>Zrušit</Button>
        )}
      </div>
    </ActionForm>
  );
}
