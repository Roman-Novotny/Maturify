-- Opravy podle Supabase Security Advisoru.

-- 1) Funkce s pevným search_path (nejde ji podvrhnout objekty v jiném schématu).
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) SECURITY DEFINER funkce, které volají jen triggery – přes API je volat nesmí nikdo.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
