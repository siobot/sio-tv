-- sio-tv: star rating, "owned" marker (public), last-watched date (owner only).

alter table public.shows
  add column rating smallint check (rating between 0 and 5),   -- null = not rated; 0 allowed
  add column owned boolean not null default false;

-- Owner-only data. No public read: RLS allows the owner alone.
create table public.show_private (
  show_id          bigint primary key references public.shows (id) on delete cascade,
  last_watched_at  timestamptz
);
alter table public.show_private enable row level security;
revoke all on public.show_private from anon;
create policy "show_private owner all" on public.show_private
  for all to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

-- Keep the 0004 body as the core; the public wrapper adds the new fields.
alter function public.save_show(jsonb) rename to save_show_core;
alter function public.save_show_core(jsonb) set schema private;
revoke execute on function private.save_show_core(jsonb) from public, anon;
grant execute on function private.save_show_core(jsonb) to authenticated;

/*
 save_show(p): as before, plus optional keys. A key that is absent leaves the value unchanged.
   rating:          0–5 or null
   owned:           boolean
   last_watched_at: ISO timestamp or null   (stored in show_private)
*/
create or replace function public.save_show(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r    jsonb := private.save_show_core(p);
  v_id bigint := (r->>'id')::bigint;
begin
  update public.shows set
    rating = case when p ? 'rating' then nullif(p->>'rating', '')::smallint else rating end,
    owned  = case when p ? 'owned' then coalesce((p->>'owned')::boolean, false) else owned end
  where id = v_id;

  if p ? 'last_watched_at' then
    insert into public.show_private (show_id, last_watched_at)
      values (v_id, nullif(p->>'last_watched_at', '')::timestamptz)
      on conflict (show_id) do update set last_watched_at = excluded.last_watched_at;
  end if;
  return r;
end;
$$;

revoke execute on function public.save_show(jsonb) from public, anon;
grant execute on function public.save_show(jsonb) to authenticated;
