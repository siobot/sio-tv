-- sio-tv: atomic save/delete for the edit screen.
-- SECURITY INVOKER: RLS still applies, so only the owner can write.

-- Return `base`, or `base-2`, `base-3`, ... whichever is free in `tbl`.
-- `self_id` is ignored when checking (so a row keeps its own slug).
create or replace function private.unique_slug(tbl regclass, base text, self_id bigint default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  candidate text := base;
  n int := 1;
  taken boolean;
begin
  loop
    execute format('select exists (select 1 from %s where slug = $1 and id is distinct from $2)', tbl)
      into taken using candidate, self_id;
    exit when not taken;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;
grant execute on function private.unique_slug(regclass, text, bigint) to authenticated;

-- Remove themes and actors no show uses any more.
create or replace function private.prune_orphans()
returns void
language sql
set search_path = ''
as $$
  delete from public.themes t where not exists (select 1 from public.show_themes st where st.theme_id = t.id);
  delete from public.actors a where not exists (select 1 from public.show_actors sa where sa.actor_id = a.id);
$$;
grant execute on function private.prune_orphans() to authenticated;

/*
 save_show(p) — insert (p.id null) or update a show with its themes and cast.
 p = {
   id, slug, title, year_start, year_end, total_seasons, preferred_seasons: int[],
   cover_url, original_language, comments, tmdb_id, imdb_id, wikipedia_url, rotten_tomatoes_url,
   themes: [{ name, slug }],
   cast:   [{ name, slug, character, tmdb_person_id }]   -- in billing order
 }
 Returns { id, slug }.
*/
create or replace function public.save_show(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     bigint := nullif(p->>'id', '')::bigint;
  v_slug   text;
  v_year   int := nullif(p->>'year_start', '')::int;
  v_pref   int[];
  el       jsonb;
  ord      bigint;
  ref_id   bigint;
  tmdb_pid int;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can edit' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x::int order by x::int), '{}')
    into v_pref
    from jsonb_array_elements_text(coalesce(p->'preferred_seasons', '[]')) x;

  -- Slug: prefer "title", then "title-year", then numbered.
  v_slug := p->>'slug';
  if exists (select 1 from public.shows where slug = v_slug and id is distinct from v_id) and v_year is not null then
    v_slug := v_slug || '-' || v_year;
  end if;
  v_slug := private.unique_slug('public.shows', v_slug, v_id);

  if v_id is null then
    insert into public.shows (slug, title) values (v_slug, p->>'title') returning id into v_id;
  end if;

  update public.shows set
    slug                = v_slug,
    title               = p->>'title',
    year_start          = v_year,
    year_end            = nullif(p->>'year_end', '')::int,
    total_seasons       = nullif(p->>'total_seasons', '')::int,
    preferred_seasons   = v_pref,
    cover_url           = nullif(p->>'cover_url', ''),
    original_language   = nullif(p->>'original_language', ''),
    comments            = nullif(p->>'comments', ''),
    tmdb_id             = nullif(p->>'tmdb_id', '')::int,
    imdb_id             = nullif(p->>'imdb_id', ''),
    wikipedia_url       = nullif(p->>'wikipedia_url', ''),
    rotten_tomatoes_url = nullif(p->>'rotten_tomatoes_url', '')
  where id = v_id;
  if not found then
    raise exception 'Show % not found', v_id using errcode = 'P0002';
  end if;

  -- Themes: match existing by case-insensitive name, else create.
  delete from public.show_themes where show_id = v_id;
  for el in select * from jsonb_array_elements(coalesce(p->'themes', '[]')) loop
    continue when coalesce(trim(el->>'name'), '') = '';
    select id into ref_id from public.themes where lower(trim(name)) = lower(trim(el->>'name'));
    if ref_id is null then
      insert into public.themes (name, slug)
        values (trim(el->>'name'), private.unique_slug('public.themes', el->>'slug'))
        returning id into ref_id;
    end if;
    insert into public.show_themes (show_id, theme_id) values (v_id, ref_id) on conflict do nothing;
  end loop;

  -- Cast: match by TMDB person id, else by case-insensitive name, else create.
  delete from public.show_actors where show_id = v_id;
  for el, ord in select * from jsonb_array_elements(coalesce(p->'cast', '[]')) with ordinality loop
    continue when coalesce(trim(el->>'name'), '') = '';
    ref_id := null;
    tmdb_pid := nullif(el->>'tmdb_person_id', '')::int;
    if tmdb_pid is not null then
      select id into ref_id from public.actors where tmdb_person_id = tmdb_pid;
    end if;
    if ref_id is null then
      select id into ref_id from public.actors
        where lower(trim(name)) = lower(trim(el->>'name'))
          and (tmdb_pid is null or tmdb_person_id is null)
        order by id limit 1;
      if ref_id is not null and tmdb_pid is not null then
        update public.actors set tmdb_person_id = tmdb_pid where id = ref_id;
      end if;
    end if;
    if ref_id is null then
      insert into public.actors (name, slug, tmdb_person_id)
        values (trim(el->>'name'), private.unique_slug('public.actors', el->>'slug'), tmdb_pid)
        returning id into ref_id;
    end if;
    insert into public.show_actors (show_id, actor_id, character, billing_order)
      values (v_id, ref_id, nullif(trim(el->>'character'), ''), ord)
      on conflict do nothing;
  end loop;

  perform private.prune_orphans();
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

create or replace function public.delete_show(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can edit' using errcode = '42501';
  end if;
  delete from public.shows where id = p_id;
  perform private.prune_orphans();
end;
$$;

revoke execute on function public.save_show(jsonb) from public, anon;
revoke execute on function public.delete_show(bigint) from public, anon;
grant execute on function public.save_show(jsonb) to authenticated;
grant execute on function public.delete_show(bigint) to authenticated;
