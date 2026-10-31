"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, EmptyState, Textarea } from "@/components/ui";
import type { Flashcard } from "@/lib/database.types";
import { formatDate } from "@/lib/utils";
import { deleteFlashcard, flashcardsFromQuestions, importFlashcards, saveFlashcard } from "../../../../study-actions";

const STATE_LABEL: Record<Flashcard["state"], string> = {
  new: "Nová",
  learning: "Učím se",
  review: "Opakování",
  relearning: "Znovu",
};

export function CardsPanel({ topicId, cards, hasQuestions }: { topicId: string; cards: Flashcard[]; hasQuestions: boolean }) {
  const [adding, setAdding] = useState<"single" | "bulk" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={adding === "single" ? "primary" : "secondary"} onClick={() => setAdding(adding === "single" ? null : "single")}>
          <Plus size={16} /> Nová kartička
        </Button>
        <Button variant={adding === "bulk" ? "primary" : "ghost"} onClick={() => setAdding(adding === "bulk" ? null : "bulk")}>
          Vložit seznam
        </Button>
        {hasQuestions && (
          <form action={flashcardsFromQuestions}>
            <input type="hidden" name="topic_id" value={topicId} />
            <Button type="submit" variant="ghost" title="Z otevřených a ústních otázek se vzorovou odpovědí">
              <Wand2 size={16} /> Vytvořit z otázek
            </Button>
          </form>
        )}
      </div>

      {adding === "single" && (
        <Card>
          <CardTitle>Nová kartička</CardTitle>
          <CardForm topicId={topicId} />
        </Card>
      )}
      {adding === "bulk" && (
        <Card>
          <CardTitle>Vložit kartičky</CardTitle>
          <ActionForm action={importFlashcards} className="space-y-3" onSuccess={() => setAdding(null)}>
            <input type="hidden" name="topic_id" value={topicId} />
            <Textarea name="lines" rows={8} required aria-label="Kartičky" placeholder={"apple ; jablko\nto take off ; vzlétnout\nKarel Hynek Mácha ; Máj (1836)"} />
            <p className="text-xs text-muted">Řádek = kartička, strany odděl středníkem nebo tabulátorem (funguje vložení z Excelu i Quizletu).</p>
            <Button type="submit">Vložit</Button>
          </ActionForm>
        </Card>
      )}

      {cards.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {cards.map((c) =>
            editing === c.id ? (
              <li key={c.id} className="md:col-span-2">
                <Card>
                  <CardForm topicId={topicId} card={c} onDone={() => setEditing(null)} />
                </Card>
              </li>
            ) : (
              <li key={c.id} className="group flex flex-col rounded-2xl border border-border bg-panel p-4">
                <p className="font-medium whitespace-pre-line">{c.front}</p>
                <p className="mt-2 flex-1 text-sm whitespace-pre-line text-muted">{c.back}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Badge color={c.state === "review" ? "var(--success)" : c.state === "new" ? "var(--muted)" : "var(--warning)"}>
                    {STATE_LABEL[c.state]}
                  </Badge>
                  {c.reps > 0 && <span>další {formatDate(c.due_at)}</span>}
                  <span className="ml-auto flex md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c.id)} aria-label="Upravit">
                      <Pencil size={14} />
                    </Button>
                    <form action={deleteFlashcard}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="topic_id" value={topicId} />
                      <Button type="submit" variant="danger" size="sm" aria-label="Smazat">
                        <Trash2 size={14} />
                      </Button>
                    </form>
                  </span>
                </div>
              </li>
            ),
          )}
        </ul>
      ) : (
        !adding && <EmptyState title="Žádné kartičky">Kartičky se opakují podle algoritmu FSRS – vždy ve chvíli, kdy je začínáš zapomínat.</EmptyState>
      )}
    </div>
  );
}

function CardForm({ topicId, card, onDone }: { topicId: string; card?: Flashcard; onDone?: () => void }) {
  return (
    <ActionForm action={saveFlashcard} className="space-y-3" resetOnSuccess={!card} onSuccess={onDone}>
      <input type="hidden" name="topic_id" value={topicId} />
      {card && <input type="hidden" name="id" value={card.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Textarea name="front" required defaultValue={card?.front} placeholder="Přední strana (otázka)" aria-label="Přední strana" />
        <Textarea name="back" required defaultValue={card?.back} placeholder="Zadní strana (odpověď)" aria-label="Zadní strana" />
      </div>
      <div className="flex gap-2">
        <Button type="submit">{card ? "Uložit" : "Přidat"}</Button>
        {card && onDone && <Button variant="ghost" onClick={onDone}>Zrušit</Button>}
      </div>
    </ActionForm>
  );
}
