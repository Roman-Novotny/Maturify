-- Maturify – Fáze 3: AI tutor
-- RAG nad vlastními materiály přes fulltext (Postgres FTS, bez diakritiky), konverzace, evidence spotřeby.

create extension if not exists unaccent with schema extensions;

-- unaccent() není IMMUTABLE → nejde použít v generovaném sloupci; obal se slovníkem napevno.
create or replace function public.immutable_unaccent(text)
returns text language sql immutable parallel safe strict
set search_path = '' as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

-- ---------------------------------------------------------------------------
-- material_chunks: fulltextový index (+ vazba na téma pro rychlé filtrování)
-- ---------------------------------------------------------------------------
alter table public.material_chunks
  add column topic_id uuid references public.topics (id) on delete cascade,
  add column subject_id text references public.subjects (id),
  add column fts tsvector generated always as (to_tsvector('simple', public.immutable_unaccent(content))) stored;
create index material_chunks_fts_idx on public.material_chunks using gin (fts);
create index material_chunks_user_topic_idx on public.material_chunks (user_id, topic_id);

alter table public.materials
  add column processed_at timestamptz,
  add column error text;

/**
 * Vyhledá nejrelevantnější úseky materiálů. Slova dotazu se spojí přes OR,
 * pořadí podle ts_rank. SECURITY INVOKER → platí RLS, uživatel vidí jen své.
 */
create or replace function public.search_material_chunks(
  query text,
  p_topic_id uuid default null,
  p_subject_id text default null,
  match_count int default 8
)
returns table (id uuid, material_id uuid, topic_id uuid, title text, content text, rank real)
language sql stable security invoker
set search_path = '' as $$
  with q as (
    select nullif(replace(plainto_tsquery('simple', public.immutable_unaccent(query))::text, '&', '|'), '')::tsquery as tsq
  )
  select c.id, c.material_id, c.topic_id, m.title, c.content, ts_rank(c.fts, q.tsq) as rank
  from public.material_chunks c
  join public.materials m on m.id = c.material_id
  cross join q
  where q.tsq is not null
    and c.fts @@ q.tsq
    and (p_topic_id is null or c.topic_id = p_topic_id)
    and (p_subject_id is null or c.subject_id = p_subject_id)
  order by rank desc
  limit least(greatest(match_count, 1), 20)
$$;

-- ---------------------------------------------------------------------------
-- Konverzace s tutorem
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('explain', 'quiz', 'exam', 'correct')),
  subject_id text references public.subjects (id),
  topic_id uuid references public.topics (id) on delete set null,
  title text not null default 'Nová konverzace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Evidence spotřeby (tokeny, model, cena) – pro denní limit a přehled nákladů
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

alter table public.profiles
  add column ai_daily_limit_usd numeric(6, 2) not null default 1.00 check (ai_daily_limit_usd between 0 and 100);

do $$
declare t text;
begin
  foreach t in array array['ai_conversations', 'ai_messages', 'ai_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: vlastní řádky" on public.%I for all to authenticated
                    using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- Spotřebu zapisuje jen server (vlastním JWT uživatele), ale mazat/měnit ji nesmí ani uživatel.
drop policy "ai_usage: vlastní řádky" on public.ai_usage;
create policy "ai_usage: čtení" on public.ai_usage for select to authenticated using (auth.uid() = user_id);
create policy "ai_usage: zápis" on public.ai_usage for insert to authenticated with check (auth.uid() = user_id);
