"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Card, CardTitle, Input, Label, ProgressBar, Select, Textarea } from "@/components/ui";
import type { SubjectId, Topic, UserProgress } from "@/lib/database.types";
import { DIFFICULTY_LABELS } from "@/lib/subjects";
import { cn, formatDate } from "@/lib/utils";
import { addTopic, deleteTopic, importTopics, rateTopic, updateTopic } from "../../actions";

function DifficultySelect({ defaultValue = 3 }: { defaultValue?: number }) {
  return (
    <Select name="difficulty" defaultValue={defaultValue}>
      {[1, 2, 3, 4, 5].map((d) => (
        <option key={d} value={d}>
          {d} – {DIFFICULTY_LABELS[d]}
        </option>
      ))}
    </Select>
  );
}

export function AddTopicForms({ subjectId, hint }: { subjectId: SubjectId; hint: string }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");

  return (
    <Card>
      <CardTitle
        action={
          <div className="flex rounded-lg bg-panel-2 p-0.5 text-xs">
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-md px-2 py-1", mode === m ? "bg-panel text-text shadow-sm" : "text-muted")}
              >
                {m === "single" ? "Jedno" : "Seznam"}
              </button>
            ))}
          </div>
        }
      >
        Přidat téma
      </CardTitle>

      {mode === "single" ? (
        <ActionForm action={addTopic} className="space-y-3">
          <input type="hidden" name="subject_id" value={subjectId} />
          <div>
            <Label htmlFor="title">Název</Label>
            <Input id="title" name="title" required maxLength={200} placeholder={hint} />
          </div>
          <div>
            <Label htmlFor="difficulty">Obtížnost</Label>
            <DifficultySelect />
          </div>
          <Button type="submit" className="w-full">Přidat</Button>
        </ActionForm>
      ) : (
        <ActionForm action={importTopics} className="space-y-3">
          <input type="hidden" name="subject_id" value={subjectId} />
          <div>
            <Label htmlFor="lines">Jedno téma na řádek</Label>
            <Textarea id="lines" name="lines" rows={8} required placeholder={"1. První téma\n2. Druhé téma\n…"} />
            <p className="mt-1 text-xs text-muted">Číslování a odrážky na začátku řádku se odstraní.</p>
          </div>
          <Button type="submit" className="w-full">Vložit seznam</Button>
        </ActionForm>
      )}
    </Card>
  );
}

export function TopicRow({
  index,
  topic,
  progress,
  color,
  counts,
}: {
  index: number;
  topic: Topic;
  progress: UserProgress | null;
  color: string;
  counts: { questions: number; cards: number; materials: number };
}) {
  const [editing, setEditing] = useState(false);
  const mastery = progress?.mastery ?? 0;
  const currentRating = progress?.attempts_count ? Math.round(mastery * 5) : null;

  if (editing) {
    return (
      <li className="py-4">
        <ActionForm action={updateTopic} className="space-y-3" resetOnSuccess={false} onSuccess={() => setEditing(false)}>
          <input type="hidden" name="id" value={topic.id} />
          <input type="hidden" name="subject_id" value={topic.subject_id} />
          <Input name="title" defaultValue={topic.title} required maxLength={200} aria-label="Název" />
          <Textarea name="description" defaultValue={topic.description ?? ""} placeholder="Poznámka / osnova (volitelné)" aria-label="Popis" />
          <div className="flex flex-wrap gap-2">
            <div className="min-w-40 flex-1">
              <DifficultySelect defaultValue={topic.difficulty} />
            </div>
            <Button type="submit">Uložit</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Zrušit</Button>
          </div>
        </ActionForm>
      </li>
    );
  }

  return (
    <li className="group py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-right text-sm text-muted tabular-nums">{index}.</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/subjects/${topic.subject_id}/topics/${topic.id}`} className="font-medium hover:text-primary">
                {topic.title}
              </Link>
              {topic.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{topic.description}</p>}
              <p className="mt-1 text-xs text-muted">
                {DIFFICULTY_LABELS[topic.difficulty]}
                {counts.questions > 0 && ` · ${counts.questions} otázek`}
                {counts.cards > 0 && ` · ${counts.cards} kartiček`}
                {counts.materials > 0 && ` · ${counts.materials} materiálů`}
                {progress?.next_review_at && ` · opakovat ${formatDate(progress.next_review_at)}`}
              </p>
            </div>
            <div className="flex shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
              <Button variant="ghost" size="sm" aria-label="Upravit téma" onClick={() => setEditing(true)}>
                <Pencil size={14} />
              </Button>
              <form
                action={deleteTopic}
                onSubmit={(e) => {
                  if (!window.confirm(`Smazat téma „${topic.title}“ včetně jeho historie?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={topic.id} />
                <input type="hidden" name="subject_id" value={topic.subject_id} />
                <Button type="submit" variant="danger" size="sm" aria-label="Smazat téma">
                  <Trash2 size={14} />
                </Button>
              </form>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="min-w-32 flex-1">
              <ProgressBar value={mastery} color={color} />
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Jak téma umíš (0–5)">
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <form key={r} action={rateTopic}>
                  <input type="hidden" name="topic_id" value={topic.id} />
                  <input type="hidden" name="rating" value={r} />
                  <button
                    type="submit"
                    title={`Umím na ${r}/5`}
                    className={cn(
                      "size-7 rounded-lg border text-xs font-medium transition-colors",
                      currentRating === r
                        ? "border-transparent text-primary-fg"
                        : "border-border text-muted hover:border-primary hover:text-text",
                    )}
                    style={currentRating === r ? { background: color } : undefined}
                  >
                    {r}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
