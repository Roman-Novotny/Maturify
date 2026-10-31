import type { Metadata } from "next";
import { BookOpenCheck, GraduationCap, MessageCircleQuestion, PenLine } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "AI Tutor" };

const MODES = [
  { icon: MessageCircleQuestion, title: "Vysvětli mi", text: "Vysvětlí látku jednoduše, postupně a na příkladech." },
  { icon: BookOpenCheck, title: "Vyzkoušej mě", text: "Pokládá otázky a čeká na tvoje odpovědi." },
  { icon: GraduationCap, title: "Zkoušej mě jako u maturity", text: "Vede simulaci ústní zkoušky." },
  { icon: PenLine, title: "Oprav mou odpověď", text: "Vyhodnotí odpověď podle kritérií a vysvětlí chyby." },
];

export default function TutorPage() {
  return (
    <div className="animate-in">
      <PageHeader
        title="AI Tutor"
        subtitle="Přijde ve Fázi 3. Bude pracovat primárně s tvými nahranými materiály – a když v nich něco nenajde, řekne to, místo aby si vymýšlel."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {MODES.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="opacity-80">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon size={20} />
            </span>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
