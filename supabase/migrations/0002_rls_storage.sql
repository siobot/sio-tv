-- sio-tv: Row Level Security + Storage
-- Public read; only the owner (row in app_owner) may write.

-- app_owner: no policies => no API access at all (is_owner() bypasses via security definer)
alter table public.app_owner enable row level security;
revoke all on public.app_owner from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['shows', 'actors', 'show_actors', 'themes', 'show_themes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s public read" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('create policy "%s owner insert" on public.%I for insert to authenticated with check ((select public.is_owner()))', t, t);
    execute format('create policy "%s owner update" on public.%I for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t, t);
    execute format('create policy "%s owner delete" on public.%I for delete to authenticated using ((select public.is_owner()))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: public-read bucket for cover images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "covers owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (select public.is_owner()));

create policy "covers owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (select public.is_owner()))
  with check (bucket_id = 'covers' and (select public.is_owner()));

create policy "covers owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (select public.is_owner()));
-- Public bucket: files are readable via their public URL without a SELECT policy.
-- This SELECT policy only lets the owner list/upsert (overwrite) files via the API.
create policy "covers owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (select public.is_owner()));
