-- Maturify – Fáze 4: plánování, kalendář, statistiky

-- Barvy předmětů jako CSS proměnné (tmavý/světlý režim mají vlastní, validované odstíny).
update public.subjects set color = 'var(--subject-' || id || ')';

-- Dostupný čas podle dne v týdnu (Po..Ne), nahrazuje jedno číslo pro všechny dny.
alter table public.profiles
  add column minutes_by_weekday int[] not null default '{90,90,90,90,90,120,120}'
    check (array_length(minutes_by_weekday, 1) = 7 and 0 <= all (minutes_by_weekday) and 720 >= all (minutes_by_weekday));
update public.profiles set minutes_by_weekday = array_fill(daily_minutes, array[7]);

-- Záznamy učení: odkud se čas vzal (úkol, test, časovač…)
alter table public.study_sessions
  add column source text not null default 'manual' check (source in ('task', 'test', 'timer', 'manual')),
  add column task_id uuid references public.study_tasks (id) on delete cascade,
  add column test_run_id uuid references public.test_runs (id) on delete cascade;
-- Plná unikátní omezení (ne částečné indexy) – jen ta umí PostgREST použít v upsert onConflict.
-- NULL hodnoty se v unikátním omezení neporovnávají, takže ruční záznamy bez úkolu/testu nevadí.
alter table public.study_sessions
  add constraint study_sessions_task_uniq unique (task_id),
  add constraint study_sessions_test_uniq unique (test_run_id);

-- Historie opakování kartiček (pro statistiky – úspěšnost a počet za den)
create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now()
);
create index flashcard_reviews_user_time_idx on public.flashcard_reviews (user_id, reviewed_at desc);

-- Denní snímek připravenosti (graf vývoje)
create table public.readiness_snapshots (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  snap_date date not null,
  overall real not null check (overall between 0 and 1),
  by_subject jsonb not null default '{}'::jsonb,
  primary key (user_id, snap_date)
);

do $$
declare t text;
begin
  foreach t in array array['flashcard_reviews', 'readiness_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: vlastní řádky" on public.%I for all to authenticated
                    using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;
