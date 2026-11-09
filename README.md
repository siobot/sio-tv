# Sio TV

A shareable catalog of TV shows with comments. Vite + vanilla JS, Supabase (Postgres, Auth, Storage), Netlify.

- Public, read-only for anyone with the link.
- Editing: owner only (Supabase Auth + Row Level Security).

## Routes

| URL | View |
| --- | --- |
| `/` | Poster grid with theme filter |
| `/?themes=crime,small-town&match=all` | Shareable filter state (`match` defaults to `any`) |
| `/show/:slug` | Show detail |
| `/actor/:slug` | Shows featuring an actor |
| `/login` | Owner sign-in (not linked from the site; bookmark it) |
| `/new` | Add a show (owner) |
| `/show/:slug/edit` | Edit or delete a show (owner) |

## Editing (owner)
1. Open `/login` and sign in. **+ Add** and **Sign out** appear in the top bar; show pages get an **Edit** button.
2. **+ Add** → search TMDB → pick the right result. Title, years, seasons, language, cover, cast, IMDb and Wikipedia are filled in. Every field stays editable.
3. Tick recommended seasons, add themes (type and press Enter, or tap a suggestion), write comments (Markdown), add a Rotten Tomatoes URL.
4. **Add show** / **Save**. The TMDB poster is copied into your Supabase `covers` bucket on save.

Saving runs `save_show()` in one transaction. Themes and actors are matched case-insensitively, so names stay consistent. Themes and actors no longer used by any show are removed.

## Theme counts

- No themes selected: total shows per theme.
- **All** mode: shows in the current results that also have that theme. A theme with 0 is dimmed.
- **Any** mode: total shows per theme.

## Setup

### 1. Supabase project
1. Go to https://supabase.com/dashboard → **New project**. Choose a name, a database password, and a region.
2. **SQL Editor** → **New query** → paste `supabase/migrations/0001_schema.sql` → **Run**.
3. Repeat with `0002_rls_storage.sql`, `0003_private_is_owner.sql`, then `0004_save_show.sql`.

> Steps 1–7 are done for project `kelqhidxwadhbaweavbc` (eu-west-2).
4. **Authentication → Users → Add user → Create new user**. Enter your email and a password, and tick **Auto Confirm User**.
5. Copy that user's **UID**. In the **SQL Editor**, run:
   ```sql
   insert into public.app_owner (user_id) values ('PASTE-YOUR-UID-HERE');
   ```
6. **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**. Save.
7. **Project Settings → API Keys**: copy the **publishable** (anon) key. Then go to **Project Settings → Data API** (or the **Connect** button) and copy the **Project URL**.

### 2. TMDB API key (needed for the auto-fill step)
1. Create an account at https://www.themoviedb.org/signup.
2. Go to https://www.themoviedb.org/settings/api → request an API key (type: Developer, personal use).
3. Copy the **API Read Access Token** (the long token, not the short "API Key").

### 3. Netlify
1. Go to https://app.netlify.com → **Add new site → Import an existing project → GitHub** → pick `siobot/sio-tv`.
2. The build settings come from `netlify.toml`, so you do not need to change them.
3. **Site configuration → Environment variables → Add a variable**:
   | Key | Value | Scopes |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | `https://kelqhidxwadhbaweavbc.supabase.co` | Builds, Functions |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_9wK0KD_OiLUin2s2HNeMQQ_ReEXhx95` | Builds, Functions |
   | `TMDB_API_KEY` | TMDB Read Access Token | Functions |
4. **Deploys → Trigger deploy → Deploy site**. Redeploy after you change any variable.

### Local development
```sh
cp .env.example .env   # fill in values
npm install
npm run dev          # site only; TMDB search needs the function:
npx netlify-cli dev  # site + functions on http://localhost:8888
```

## Structure
```
supabase/migrations/   SQL schema, RLS, storage bucket
netlify/functions/     TMDB proxy (keeps the key server-side)
src/api/               Supabase queries
src/views/             grid, show, actor, login, edit
src/components/        theme filter, show card
src/lib/               escaping, formatting, slugs, Markdown
```
