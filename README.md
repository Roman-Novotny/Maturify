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

Databázové schéma je v `supabase/migrations/` – spusť ho v Supabase SQL editoru
(nebo `npx supabase db push`).

## Stav vývoje

| Fáze | Obsah | Stav |
| --- | --- | --- |
| 1 – Základ | Design systém, přihlášení/registrace, DB + RLS, dashboard, navigace, předměty a témata, denní plán, termíny | ✅ |
| 2 – Studijní systém | Otázky a vzorové odpovědi, nahrávání PDF/poznámek, kartičky, testy, sledování znalostí | ⏳ |
| 3 – AI Tutor | Chat, RAG nad vlastními materiály, hodnocení odpovědí, generování kartiček, simulace ústní | ⏳ |
| 4 – Plánování | Kalendář, FSRS opakování, statistiky | ⏳ |
| 5 – Dokončení | PWA offline, hlasové zkoušení, Vercel | ⏳ |

## Struktura

```
src/
  app/
    (auth)/        přihlášení, registrace, auth server actions
    (app)/         přihlášená část: dashboard, subjects, plan, tutor, settings + actions.ts
    auth/callback  potvrzení e-mailu (PKCE)
  components/      UI primitiva, navigace, formuláře
  lib/
    supabase/      klienti pro server a proxy
    dal.ts         datová vrstva (jediné místo, kde se čte z DB)
    planner.ts     čistá logika připravenosti a denního plánu
supabase/migrations/
```

Všechny maturitní otázky a požadavky jsou editovatelné podle materiálů od učitelů – AI bude pomáhat,
ale nebude jediným zdrojem pravdy.
