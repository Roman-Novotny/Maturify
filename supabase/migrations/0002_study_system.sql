-- Maturify – Fáze 2: studijní systém (otázky s typy odpovědí, testy, kartičky, materiály ve Storage)

-- ---------------------------------------------------------------------------
-- questions: data pro automatické hodnocení
-- ---------------------------------------------------------------------------
alter table public.questions
  add column options jsonb,                -- choice: ["A", "B", ...]
  add column correct_option int,           -- choice: index správné možnosti
  add column numeric_answer double precision,
  add column tolerance double precision not null default 0,
  add constraint questions_choice_valid check (
    kind <> 'choice' or (jsonb_typeof(options) = 'array' and correct_option >= 0
                         and correct_option < jsonb_array_length(options))
  ),
  add constraint questions_numeric_valid check (kind <> 'numeric' or numeric_answer is not null);

-- ---------------------------------------------------------------------------
-- test_runs – jeden test / procvičování
-- ---------------------------------------------------------------------------
create table public.test_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text references public.subjects (id),
  topic_id uuid references public.topics (id) on delete cascade,
  mode text not null default 'practice' check (mode in ('practice', 'timed')),
  question_ids uuid[] not null,
  time_limit_sec int check (time_limit_sec > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score real check (score between 0 and 1)
);
create index test_runs_user_idx on public.test_runs (user_id, started_at desc);

alter table public.test_runs enable row level security;
create policy "test_runs: vlastní řádky" on public.test_runs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.attempts
  add column test_run_id uuid references public.test_runs (id) on delete cascade;
create index attempts_test_run_idx on public.attempts (test_run_id);
create index attempts_topic_idx on public.attempts (user_id, topic_id, created_at desc);

-- Jedna odpověď na otázku v rámci testu
create unique index attempts_run_question_uniq on public.attempts (test_run_id, question_id)
  where test_run_id is not null and question_id is not null;

-- ---------------------------------------------------------------------------
-- flashcards: stav FSRS
-- ---------------------------------------------------------------------------
alter table public.flashcards
  add column state text not null default 'new' check (state in ('new', 'learning', 'review', 'relearning'));

-- ---------------------------------------------------------------------------
-- materials: metadata souboru
-- ---------------------------------------------------------------------------
alter table public.materials
  add column mime_type text,
  add column size_bytes bigint check (size_bytes >= 0);

-- ---------------------------------------------------------------------------
-- Storage: soukromý bucket, cesta = <user_id>/<soubor>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials', 'materials', false, 20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain', 'text/markdown']
)
on conflict (id) do nothing;

create policy "materials: čtení vlastních souborů" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "materials: nahrání do vlastní složky" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "materials: mazání vlastních souborů" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
