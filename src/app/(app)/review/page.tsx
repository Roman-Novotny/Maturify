import type { Metadata } from "next";
import Link from "next/link";
import { getDueFlashcards, getSubjects, getTopics } from "@/lib/dal";
import { buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { ReviewSession } from "./review-session";

export const metadata: Metadata = { title: "Opakování" };

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const { topic } = await searchParams;
  const topicId = typeof topic === "string" ? topic : undefined;
  const [cards, topics, subjects] = await Promise.all([getDueFlashcards({ topicId }), getTopics(), getSubjects()]);

  const topicById = new Map(topics.map((t) => [t.id, t]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const scopedTopic = topicId ? topicById.get(topicId) : undefined;

  const items = cards.map((c) => {
    const t = topicById.get(c.topic_id);
    const s = t ? subjectById.get(t.subject_id) : undefined;
    return { card: c, topicTitle: t?.title ?? "", subjectShort: s?.short ?? "", color: s?.color ?? "var(--primary)" };
  });

  return (
    <div className="animate-in mx-auto max-w-2xl">
      <PageHeader
        title="Opakování kartiček"
        subtitle={scopedTopic ? scopedTopic.title : "Všechny kartičky, které jsou dnes na řadě"}
        action={
          scopedTopic && (
            <Link href="/review" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Všechna témata
            </Link>
          )
        }
      />
      {items.length ? (
        // key: po obnovení stránky začne nové sezení s aktuálním seznamem
        <ReviewSession key={items.map((i) => i.card.id).join()} items={items} />
      ) : (
        <Card>
          <EmptyState title="Hotovo – nic k opakování 🎉">
            Další kartičky se objeví, až je začneš zapomínat. Nové přidáš u témat v{" "}
            <Link href="/subjects" className="text-primary hover:underline">Předmětech</Link>.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
