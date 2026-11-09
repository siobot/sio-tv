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

## Theme counts

- No themes selected: total shows per theme.
- **All** mode: shows in the current results that also have that theme. A theme with 0 is dimmed.
- **Any** mode: total shows per theme.

## Setup

### 1. Supabase project
1. Go to https://supabase.com/dashboard → **New project**. Choose a name, a database password, and a region.
2. **SQL Editor** → **New query** → paste `supabase/migrations/0001_schema.sql` → **Run**.
3. Repeat with `supabase/migrations/0002_rls_storage.sql`, then `0003_private_is_owner.sql`.

> Already done for project `kelqhidxwadhbaweavbc` (eu-west-2) via the Supabase connector. Start at step 4.
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
   | `VITE_SUPABASE_URL` | Project URL | Builds |
   | `VITE_SUPABASE_ANON_KEY` | publishable/anon key | Builds |
   | `TMDB_API_KEY` | TMDB Read Access Token | Functions |
4. **Deploys → Trigger deploy → Deploy site**. Redeploy after you change any variable.

### Local development
```sh
cp .env.example .env   # fill in values
npm install
npm run dev
```

## Structure
```
supabase/migrations/   SQL schema, RLS, storage bucket
netlify/functions/     TMDB proxy (keeps the key server-side)
src/api/               Supabase queries
src/views/             grid, show, actor (edit/login: next step)
src/components/        theme filter, show card
src/lib/               escaping, formatting, slugs, Markdown
```
