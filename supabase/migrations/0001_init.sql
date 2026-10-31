-- Maturify – výchozí schéma (Fáze 1 + základ Fáze 2)
-- Všechny uživatelské tabulky mají RLS: každý vidí a mění jen své záznamy.

-- ---------------------------------------------------------------------------
-- Pomocné funkce
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  daily_minutes int not null default 90 check (daily_minutes between 0 and 720),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
create policy "profiles: vlastní čtení" on public.profiles for select using (auth.uid() = id);
create policy "profiles: vlastní úprava" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- subjects – globální číselník, uživatelé jen čtou
-- ---------------------------------------------------------------------------
create table public.subjects (
  id text primary key,                -- 'cj' | 'en' | 'it' | 'ma'
  name text not null,
  short text not null,
  description text not null,
  color text not null,
  sort int not null default 0
);

alter table public.subjects enable row level security;
create policy "subjects: čtení pro přihlášené" on public.subjects for select to authenticated using (true);

insert into public.subjects (id, name, short, description, color, sort) values
  ('cj', 'Čeština',     'ČJ', 'Literatura, autoři, díla, rozbory, jazyk',     '#E8B45C', 1),
  ('en', 'Angličtina',  'EN', 'Slovíčka, gramatika, témata, speaking',        '#4FACFE', 2),
  ('it', 'Informatika', 'IT', 'Teorie, algoritmy, sítě, programování',        '#8B7CFF', 3),
  ('ma', 'Matematika',  '∑',  'Vzorce, příklady, postupy, testy',             '#36C98F', 4);

-- ---------------------------------------------------------------------------
-- topics – tematické okruhy (vlastní pro každého uživatele / školu)
-- ---------------------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text not null references public.subjects (id),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index topics_user_subject_idx on public.topics (user_id, subject_id, sort);
create trigger topics_updated_at before update on public.topics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- questions + answers
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  prompt text not null,
  kind text not null default 'open' check (kind in ('open', 'choice', 'numeric', 'oral')),
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  source text,                         -- odkud otázka pochází (učitel, PDF, AI…)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_topic_idx on public.questions (topic_id);
create index questions_user_idx on public.questions (user_id);
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  body text not null,
  criteria jsonb not null default '[]'::jsonb,  -- hodnoticí kritéria
  is_reference boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index answers_question_idx on public.answers (question_id);
create trigger answers_updated_at before update on public.answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- materials (+ chunks pro RAG ve Fázi 3)
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text references public.subjects (id),
  topic_id uuid references public.topics (id) on delete set null,
  title text not null,
  kind text not null default 'note' check (kind in ('note', 'pdf', 'image', 'link')),
  storage_path text,
  content text,
  status text not null default 'ready' check (status in ('uploaded', 'processing', 'ready', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index materials_user_idx on public.materials (user_id, subject_id);
create trigger materials_updated_at before update on public.materials
  for each row execute function public.set_updated_at();

create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  idx int not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index material_chunks_material_idx on public.material_chunks (material_id, idx);

-- ---------------------------------------------------------------------------
-- flashcards
-- ---------------------------------------------------------------------------
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  front text not null,
  back text not null,
  -- stav plánovače (FSRS-like)
  stability real not null default 0,
  difficulty real not null default 5,
  reps int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null default now(),
  last_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flashcards_due_idx on public.flashcards (user_id, due_at);
create trigger flashcards_updated_at before update on public.flashcards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- attempts – historie odpovídání
-- ---------------------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete cascade,
  question_id uuid references public.questions (id) on delete set null,
  flashcard_id uuid references public.flashcards (id) on delete set null,
  answer text,
  score real check (score between 0 and 1),         -- správnost 0–1
  completeness real check (completeness between 0 and 1),
  confidence smallint check (confidence between 1 and 5),
  duration_sec int check (duration_sec >= 0),
  graded_by text not null default 'self' check (graded_by in ('self', 'auto', 'ai')),
  created_at timestamptz not null default now()
);
create index attempts_user_time_idx on public.attempts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- user_progress – aktuální zvládnutí témat
-- ---------------------------------------------------------------------------
create table public.user_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  mastery real not null default 0 check (mastery between 0 and 1),
  stability real not null default 0,
  attempts_count int not null default 0,
  last_studied_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);
create trigger user_progress_updated_at before update on public.user_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- plánování
-- ---------------------------------------------------------------------------
create table public.exam_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text references public.subjects (id),
  kind text not null check (kind in ('written', 'oral', 'other')),
  label text not null,
  exam_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index exam_dates_user_idx on public.exam_dates (user_id, exam_at);

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date date not null,
  minutes_available int not null default 90,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid references public.study_plans (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete cascade,
  subject_id text references public.subjects (id),
  title text not null,
  kind text not null default 'study' check (kind in ('study', 'review', 'test', 'custom')),
  minutes int not null default 25 check (minutes between 1 and 600),
  due_date date not null default current_date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index study_tasks_user_date_idx on public.study_tasks (user_id, due_date);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text references public.subjects (id),
  topic_id uuid references public.topics (id) on delete set null,
  started_at timestamptz not null default now(),
  minutes int not null default 0 check (minutes >= 0),
  note text
);
create index study_sessions_user_idx on public.study_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- RLS: „vlastní řádky" pro všechny uživatelské tabulky
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'topics','questions','answers','materials','material_chunks','flashcards',
    'attempts','user_progress','exam_dates','study_plans','study_tasks','study_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: vlastní řádky" on public.%I for all to authenticated
                    using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Nový uživatel → profil
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
