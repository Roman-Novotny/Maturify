import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, PageHeader, ProgressBar, SubjectIcon } from "@/components/ui";
import { getProgress, getSubjects, getTopics } from "@/lib/dal";
import { computeReadiness } from "@/lib/planner";
import { SUBJECT_MODULES } from "@/lib/subjects";
import { pct, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Předměty" };

export default async function SubjectsPage() {
  const [subjects, topics, progress] = await Promise.all([getSubjects(), getTopics(), getProgress()]);
  const { perSubject } = computeReadiness(subjects, topics, progress);

  return (
    <div className="animate-in">
      <PageHeader title="Předměty" subtitle="Každý předmět má vlastní témata, materiály a typy procvičování." />
      <div className="grid gap-4 md:grid-cols-2">
        {perSubject.map(({ subject, readiness, topicCount }) => {
          const info = SUBJECT_MODULES[subject.id];
          return (
            <Link key={subject.id} href={`/subjects/${subject.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <div className="flex items-start gap-4">
                  <SubjectIcon short={subject.short} color={subject.color} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold">{subject.name}</h2>
                      <ArrowRight size={18} className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                    </div>
                    <p className="text-sm text-muted">{info.tagline} · {subject.description}</p>
                  </div>
                </div>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {info.modules.map((m) => (
                    <li key={m} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
                      {m}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 mb-1.5 flex justify-between text-sm">
                  <span className="text-muted">
                    {topicCount} {plural(topicCount, ["téma", "témata", "témat"])}
                  </span>
                  <span className="font-medium">{pct(readiness)}</span>
                </div>
                <ProgressBar value={readiness} color={subject.color} />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
