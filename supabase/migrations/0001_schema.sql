-- sio-tv: core schema
-- Run in Supabase SQL Editor (or `supabase db push`).

-- ---------------------------------------------------------------------------
-- Owner (single editor)
-- ---------------------------------------------------------------------------
create table public.app_owner (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- security definer so RLS policies can call it without exposing app_owner
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_owner where user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Shows
-- ---------------------------------------------------------------------------
create table public.shows (
  id                  bigint generated always as identity primary key,
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (length(trim(title)) > 0),
  year_start          int check (year_start between 1900 and 2100),
  year_end            int check (year_end between 1900 and 2100),   -- null = ongoing
  total_seasons       int check (total_seasons >= 0),
  preferred_seasons   int[] not null default '{}',                   -- empty = all recommended
  cover_url           text,
  original_language   text,                                          -- ISO 639-1, e.g. 'da'
  comments            text,                                          -- Markdown
  tmdb_id             int unique,
  imdb_id             text check (imdb_id ~ '^tt[0-9]+$'),
  wikipedia_url       text,
  rotten_tomatoes_url text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (year_end is null or year_start is null or year_end >= year_start)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger shows_touch_updated_at
  before update on public.shows
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Actors (many-to-many with shows, with character name)
-- ---------------------------------------------------------------------------
create table public.actors (
  id              bigint generated always as identity primary key,
  name            text not null check (length(trim(name)) > 0),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tmdb_person_id  int unique
);

create table public.show_actors (
  show_id        bigint not null references public.shows (id) on delete cascade,
  actor_id       bigint not null references public.actors (id) on delete cascade,
  character      text,
  billing_order  int not null default 0,
  primary key (show_id, actor_id)
);
create index show_actors_actor_id_idx on public.show_actors (actor_id);

-- ---------------------------------------------------------------------------
-- Themes (tags; multi-word allowed, e.g. "small town")
-- ---------------------------------------------------------------------------
create table public.themes (
  id    bigint generated always as identity primary key,
  name  text not null check (length(trim(name)) > 0),
  slug  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index themes_name_lower_idx on public.themes (lower(trim(name)));

create table public.show_themes (
  show_id   bigint not null references public.shows (id) on delete cascade,
  theme_id  bigint not null references public.themes (id) on delete cascade,
  primary key (show_id, theme_id)
);
create index show_themes_theme_id_idx on public.show_themes (theme_id);
