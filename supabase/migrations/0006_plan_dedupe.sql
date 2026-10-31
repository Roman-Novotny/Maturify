-- Automatický plán může sestavit víc souběžných vykreslení stránky najednou.
-- Jedno téma (i „kartičky“ bez tématu) smí být v automatickém plánu na den jen jednou.
delete from public.study_tasks a
using public.study_tasks b
where a.kind <> 'custom' and b.kind <> 'custom'
  and a.user_id = b.user_id and a.due_date = b.due_date
  and a.topic_id is not distinct from b.topic_id
  and a.done_at is null
  and (b.done_at is not null or a.created_at > b.created_at or (a.created_at = b.created_at and a.id > b.id));

create unique index study_tasks_auto_uniq on public.study_tasks (user_id, due_date, topic_id) nulls not distinct
  where kind <> 'custom';
