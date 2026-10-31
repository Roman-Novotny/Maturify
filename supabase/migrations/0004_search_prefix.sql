-- Čeština se skloňuje: „síťová vrstva“ musí najít i „síťové vrstvě“.
-- Bez českého stemmeru v Postgresu: delší slova se hledají jako prefix (useknutá koncovka).
create or replace function public.search_material_chunks(
  query text,
  p_topic_id uuid default null,
  p_subject_id text default null,
  match_count int default 8
)
returns table (id uuid, material_id uuid, topic_id uuid, title text, content text, rank real)
language sql stable security invoker
set search_path = '' as $$
  with words as (
    select distinct w
    from regexp_split_to_table(lower(public.immutable_unaccent(query)), '[^[:alnum:]]+') as w
    where length(w) >= 2
  ),
  q as (
    select to_tsquery('simple', string_agg(
      case when length(w) >= 5 then left(w, greatest(4, length(w) - 2)) || ':*' else w end,
      ' | '
    )) as tsq
    from words
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
