# Maturify

**Živá verze:** https://maturify.vercel.app

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

Stačí jeden klíč v `.env.local`:

- `GEMINI_API_KEY` – Google Gemini, **bezplatná úroveň** (aistudio.google.com/apikey, projekt bez billingu).
  Výchozí model `gemini-3.5-flash`, při přetížení záložní `gemini-flash-lite-latest`.
- nebo `ANTHROPIC_API_KEY` – Claude (placené), výchozí `claude-opus-5`.

`AI_PROVIDER` a `AI_MODEL` výběr přepíšou. Každý požadavek se eviduje (tokeny, model, odhad ceny – u Gemini
free tier 0 $) v tabulce `ai_usage` a hlídá se denní limit z Nastavení. Bez klíče appka funguje dál, jen bez AI.

## Stav vývoje

| Fáze | Obsah | Stav |
| --- | --- | --- |
| 1 – Základ | Design systém, přihlášení/registrace, DB + RLS, dashboard, navigace, předměty a témata, denní plán, termíny | ✅ |
| 2 – Studijní systém | Otázky (otevřené, ústní, výběr, číselné) se vzorovými odpověďmi, hromadný import, materiály (poznámky + soubory ve Storage), kartičky s FSRS, testy (procvičování / na čas), sledování zvládnutí | ✅ |
| 3 – AI Tutor | Chat se 4 režimy (vysvětli / vyzkoušej / zkoušení jako u maturity / oprav odpověď) se streamováním, RAG nad vlastními materiály (fulltext s prefixy kvůli skloňování), extrakce textu z PDF, AI přepis fotek a skenů, AI hodnocení otevřených odpovědí (student potvrdí/upraví), generování kartiček a otázek ke schválení, evidence tokenů a ceny + denní limit | ✅ |
| 4 – Plánování | Automatický denní plán (čas podle dne v týdnu, tlak na neprobraná témata před zkouškou, bez hromadění), časovač u úkolů, kalendář s odučeným časem a náhledem plánu na 4 týdny, statistiky (čas po dnech, řada dní, testy, úspěšnost kartiček, vývoj připravenosti, potřebné tempo) | ✅ |
| 5 – Dokončení | PWA (instalace, ikony, service worker, offline opakování kartiček se synchronizací), hlasové zkoušení (diktování, předčítání, „Mluv 2 minuty“), CSP s noncí a bezpečnostní hlavičky, opravy ze Supabase advisoru, denní strop AI požadavků | ✅ |

## Struktura

```
src/
  app/
    (auth)/        přihlášení, registrace, auth server actions
    (app)/         přihlášená část: dashboard, subjects (+ topics/[topicId]), review, test/[runId],
                   plan, calendar, stats, tutor, settings; actions.ts (témata, plán, nastavení), study-actions.ts (Fáze 2),
                   ai-actions.ts (Fáze 3)
    api/tutor      streamovaný chat s tutorem (NDJSON)
    auth/callback  potvrzení e-mailu (PKCE)
  components/      UI primitiva, navigace, formuláře, grafy (SVG), Markdown
  lib/
    supabase/      klienti pro server a proxy
    dal.ts         datová vrstva (jediné místo, kde se čte z DB)
    planner.ts     čistá logika připravenosti a denního plánu
    srs.ts         FSRS plánování kartiček
    grading.ts     automatické hodnocení + výpočet zvládnutí tématu
    progress.ts    přepočet user_progress z historie (jediné místo zápisu)
    ai/            AI vrstva: poskytovatelé (gemini.ts, anthropic.ts), ceny, limity, kontext (RAG), prompty
    plan-service.ts  sestavení denního plánu, snímky připravenosti
    stats.ts       čisté výpočty statistik
    materials.ts   extrakce textu (PDF, text, AI přepis) a dělení na úseky
    chunking.ts    čisté dělení textu na úseky
supabase/migrations/
```

Všechny maturitní otázky a požadavky jsou editovatelné podle materiálů od učitelů – AI bude pomáhat,
ale nebude jediným zdrojem pravdy.

## Nasazení (Vercel, zdarma)

```bash
npx vercel login                 # jednou, přihlášení k Vercelu
npx vercel link                  # propojí složku s projektem
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel env add GEMINI_API_KEY production
npx vercel env add AI_PROVIDER production      # hodnota: gemini
npx vercel deploy --prod
```

Projekt na Vercelu není napojený na GitHub (účet nemá GitHub login connection), nasazuje se z CLI:
`npx vercel deploy --prod`. Pro automatické nasazení po každém pushi: v nastavení Vercel účtu připoj GitHub
a pak `npx vercel git connect`.

Po nasazení v Supabase (Authentication → URL Configuration) nastav **Site URL** na produkční adresu
a do **Redirect URLs** přidej `https://<adresa>/auth/callback`, jinak nebudou fungovat odkazy z potvrzovacích e-mailů.

## Zabezpečení

- RLS na všech uživatelských tabulkách, Storage omezený na vlastní složku.
- CSP s noncí pro každý požadavek (`src/proxy.ts`), další hlavičky v `next.config.ts`.
- AI klíče jen na serveru; denní limit útraty i počtu požadavků na uživatele.
