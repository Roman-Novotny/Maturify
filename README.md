# Maturify

Osobní maturitní operační centrum – plánování, maturitní témata, procvičování a sledování pokroku
pro čtyři předměty: **čeština, angličtina, informatika, matematika**.

Aplikace neukazuje jen to, co máš hotové, ale hlavně **co je potřeba udělat dál**.

## Stack

- Next.js 16 (App Router, Server Actions, `proxy.ts`) + TypeScript
- Tailwind CSS v4 (vlastní design tokeny, dark/light)
- Supabase – PostgreSQL, Auth, RLS (každý uživatel vidí jen svá data)
- Zod pro validaci, lucide-react ikony

## Spuštění

```bash
npm install
cp .env.example .env.local   # doplň URL a publishable key ze Supabase
npm run dev
```

Databázové schéma je v `supabase/migrations/` – migrace spouštěj postupně v Supabase SQL editoru
(nebo `npx supabase db push`). `0002` zakládá i soukromý Storage bucket `materials`.

```bash
npm test        # unit testy čisté logiky (FSRS, hodnocení, plánovač, dělení textu)
```

### AI (volitelné)

Do `.env.local` přidej `ANTHROPIC_API_KEY` (z console.anthropic.com). Výchozí model je `claude-opus-5`,
jiný nastavíš přes `AI_MODEL`. Každý požadavek se eviduje (tokeny, model, odhad ceny) v tabulce `ai_usage`
a hlídá se denní limit z Nastavení. Bez klíče appka funguje dál, jen bez AI funkcí.

## Stav vývoje

| Fáze | Obsah | Stav |
| --- | --- | --- |
| 1 – Základ | Design systém, přihlášení/registrace, DB + RLS, dashboard, navigace, předměty a témata, denní plán, termíny | ✅ |
| 2 – Studijní systém | Otázky (otevřené, ústní, výběr, číselné) se vzorovými odpověďmi, hromadný import, materiály (poznámky + soubory ve Storage), kartičky s FSRS, testy (procvičování / na čas), sledování zvládnutí | ✅ |
| 3 – AI Tutor | Chat se 4 režimy (vysvětli / vyzkoušej / zkoušení jako u maturity / oprav odpověď) se streamováním, RAG nad vlastními materiály (fulltext s prefixy kvůli skloňování), extrakce textu z PDF, AI přepis fotek a skenů, AI hodnocení otevřených odpovědí (student potvrdí/upraví), generování kartiček a otázek ke schválení, evidence tokenů a ceny + denní limit | ✅ |
| 4 – Plánování | Kalendář, statistiky, chytřejší plánovač (FSRS pro kartičky už je ve Fázi 2) | ⏳ |
| 5 – Dokončení | PWA offline, hlasové zkoušení, Vercel | ⏳ |

## Struktura

```
src/
  app/
    (auth)/        přihlášení, registrace, auth server actions
    (app)/         přihlášená část: dashboard, subjects (+ topics/[topicId]), review, test/[runId],
                   plan, tutor, settings; actions.ts (témata, plán, nastavení), study-actions.ts (Fáze 2),
                   ai-actions.ts (Fáze 3)
    api/tutor      streamovaný chat s tutorem (NDJSON)
    auth/callback  potvrzení e-mailu (PKCE)
  components/      UI primitiva, navigace, formuláře
  lib/
    supabase/      klienti pro server a proxy
    dal.ts         datová vrstva (jediné místo, kde se čte z DB)
    planner.ts     čistá logika připravenosti a denního plánu
    srs.ts         FSRS plánování kartiček
    grading.ts     automatické hodnocení + výpočet zvládnutí tématu
    progress.ts    přepočet user_progress z historie (jediné místo zápisu)
    ai/            AI vrstva: klient + ceny, limity a evidence, kontext (RAG), prompty
    materials.ts   extrakce textu (PDF, text, AI přepis) a dělení na úseky
    chunking.ts    čisté dělení textu na úseky
supabase/migrations/
```

Všechny maturitní otázky a požadavky jsou editovatelné podle materiálů od učitelů – AI bude pomáhat,
ale nebude jediným zdrojem pravdy.
