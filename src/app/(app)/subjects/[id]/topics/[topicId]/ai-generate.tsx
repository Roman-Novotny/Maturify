"use client";

import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { Button, Card, CardTitle, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { generateDrafts, saveDrafts, type CardDraft, type QuestionDraft } from "../../../../ai-actions";

type Kind = "cards" | "questions";
type Draft = (CardDraft | QuestionDraft) & { selected: boolean };

const LABEL: Record<Kind, { button: string; title: string; unit: string }> = {
  cards: { button: "Vygenerovat z materiálů", title: "AI kartičky z materiálů", unit: "kartiček" },
  questions: { button: "Vygenerovat otázky (AI)", title: "AI otázky z materiálů", unit: "otázek" },
};

/** Tlačítko + panel: AI navrhne položky, student je zkontroluje, upraví a uloží jen vybrané. */
export function AiGenerate({ topicId, kind, available }: { topicId: string; kind: Kind; available: boolean }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [focus, setFocus] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();
  const l = LABEL[kind];

  if (!available) return null;

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Sparkles size={16} /> {l.button}
      </Button>
    );
  }

  const selected = drafts.filter((d) => d.selected);
  const patch = (i: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? ({ ...d, ...p } as Draft) : d)));

  return (
    <Card className="w-full border-primary/40">
      <CardTitle
        icon={<Sparkles size={16} className="text-primary" />}
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Zavřít">
            <X size={16} />
          </Button>
        }
      >
        {l.title}
      </CardTitle>

      <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
        <Select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Počet">
          {[5, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              {n} {l.unit}
            </option>
          ))}
        </Select>
        <Input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={500} placeholder="Zaměření (volitelné), např. „jen definice“" aria-label="Zaměření" />
        <Button
          disabled={generating}
          onClick={() =>
            startGenerating(async () => {
              setError(null);
              setMessage(null);
              const res = await generateDrafts({ topicId, kind, count, focus: focus || undefined });
              if (!res.ok) setError(res.error);
              else setDrafts(res.data.map((d) => ({ ...d, selected: true })));
            })
          }
        >
          {generating ? "Generuji…" : drafts.length ? "Znovu" : "Vygenerovat"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">AI čerpá jen z tvých materiálů u tohoto tématu. Návrhy si zkontroluj – uloží se jen ty zaškrtnuté.</p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {message && <p className="mt-3 text-sm text-success">{message}</p>}

      {drafts.length > 0 && (
        <>
          <ul className="mt-4 space-y-3">
            {drafts.map((d, i) => (
              <li key={i} className={cn("flex gap-3 rounded-xl border p-3", d.selected ? "border-border" : "border-border opacity-50")}>
                <input
                  type="checkbox"
                  checked={d.selected}
                  onChange={(e) => patch(i, { selected: e.target.checked })}
                  className="mt-2 size-4 shrink-0 accent-[var(--primary)]"
                  aria-label="Uložit tuto položku"
                />
                <div className="grid flex-1 gap-2 md:grid-cols-2">
                  {"front" in d ? (
                    <>
                      <Textarea value={d.front} onChange={(e) => patch(i, { front: e.target.value })} rows={2} aria-label="Přední strana" />
                      <Textarea value={d.back} onChange={(e) => patch(i, { back: e.target.value })} rows={2} aria-label="Zadní strana" />
                    </>
                  ) : (
                    <>
                      <Textarea value={d.prompt} onChange={(e) => patch(i, { prompt: e.target.value })} rows={2} aria-label="Otázka" />
                      <Textarea value={d.reference} onChange={(e) => patch(i, { reference: e.target.value })} rows={3} aria-label="Vzorová odpověď" />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button
              disabled={saving || !selected.length}
              onClick={() =>
                startSaving(async () => {
                  const res =
                    kind === "cards"
                      ? await saveDrafts({
                          kind,
                          topicId,
                          items: (selected as (CardDraft & { selected: boolean })[]).map(({ front, back }) => ({ front, back })),
                        })
                      : await saveDrafts({
                          kind,
                          topicId,
                          items: (selected as (QuestionDraft & { selected: boolean })[]).map(({ prompt, reference, kind }) => ({
                            prompt,
                            reference,
                            kind,
                          })),
                        });
                  if (!res.ok) setError(res.error);
                  else {
                    setDrafts([]);
                    setMessage(`Uloženo ${res.data} ${l.unit}.`);
                  }
                })
              }
            >
              Uložit vybrané ({selected.length})
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
