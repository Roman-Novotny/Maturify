import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { Button, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/dal";

// Jednorázový import materiálů z Notionu (scripts/notion/items.json). Jen ve vývoji.

type Item = {
  subject: "it" | "cj";
  title: string;
  description: string;
  sort: number;
  markdown: string;
  question: string;
  chunks: string[];
};

async function loadItems(): Promise<Item[]> {
  return JSON.parse(await readFile(path.join(process.cwd(), "scripts/notion/items.json"), "utf8"));
}

async function runImport() {
  "use server";
  if (process.env.NODE_ENV === "production") return;
  const { supabase } = await requireUser();
  const items = await loadItems();
  const { data: existing } = await supabase.from("topics").select("subject_id, title");
  const have = new Set((existing ?? []).map((t) => `${t.subject_id}|${t.title}`));

  for (const it of items) {
    if (have.has(`${it.subject}|${it.title}`)) continue;
    const { data: topic, error } = await supabase
      .from("topics")
      .insert({ subject_id: it.subject, title: it.title, description: it.description, difficulty: 3, sort: it.sort })
      .select("id")
      .single();
    if (error) throw error;
    const { data: mat, error: mErr } = await supabase
      .from("materials")
      .insert({
        subject_id: it.subject,
        topic_id: topic.id,
        title: `Notion – ${it.title}`.slice(0, 200),
        kind: "note",
        content: it.markdown,
        status: "ready",
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (mErr) throw mErr;
    const { error: cErr } = await supabase.from("material_chunks").insert(
      it.chunks.map((content, idx) => ({ material_id: mat.id, topic_id: topic.id, subject_id: it.subject, idx, content })),
    );
    if (cErr) throw cErr;
    const { data: q, error: qErr } = await supabase
      .from("questions")
      .insert({ topic_id: topic.id, prompt: it.question, kind: "oral", difficulty: 3, source: "Notion – sdílené maturitní materiály" })
      .select("id")
      .single();
    if (qErr) throw qErr;
    const { error: aErr } = await supabase.from("answers").insert({ question_id: q.id, body: it.markdown });
    if (aErr) throw aErr;
  }
}

export default async function DevImportPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireUser();
  const items = await loadItems().catch(() => []);
  return (
    <div className="animate-in">
      <PageHeader title="Import z Notionu" subtitle={`${items.length} témat připraveno (scripts/notion/items.json). Existující témata se přeskočí.`} />
      <Card>
        <form action={runImport}>
          <Button type="submit" disabled={!items.length}>
            Importovat
          </Button>
        </form>
      </Card>
    </div>
  );
}
