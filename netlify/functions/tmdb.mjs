/**
 * TMDB proxy (keeps TMDB_API_KEY server-side). Signed-in users only.
 *
 *   GET /.netlify/functions/tmdb?q=borgen      → search results
 *   GET /.netlify/functions/tmdb?id=12345      → normalised show details (+ Wikipedia via Wikidata)
 *   GET /.netlify/functions/tmdb?poster=/x.jpg → poster image bytes (so the browser can re-upload it)
 */

const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const UA = 'sio-tv/0.1 (personal TV catalog)';
const ENDED = new Set(['Ended', 'Canceled', 'Cancelled']);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function isSignedIn(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = req.headers.get('authorization') || '';
  if (!url || !key || !auth.startsWith('Bearer ')) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: auth } });
  return r.ok;
}

async function tmdb(path, params = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw Object.assign(new Error('TMDB_API_KEY is not set'), { status: 500 });
  const u = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  // Read Access Token (JWT, starts "eyJ") → bearer; short v3 key → query param.
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  else u.searchParams.set('api_key', key);
  const r = await fetch(u, { headers });
  if (!r.ok) throw Object.assign(new Error(`TMDB ${r.status}`), { status: r.status === 404 ? 404 : 502 });
  return r.json();
}

/** English Wikipedia URL via Wikidata, matched on TMDB TV id (P4983) then IMDb id (P345). Best effort. */
async function wikipediaUrl(tmdbId, imdbId) {
  const api = 'https://www.wikidata.org/w/api.php';
  const headers = { 'user-agent': UA };
  const claims = [`haswbstatement:P4983=${tmdbId}`, imdbId && `haswbstatement:P345=${imdbId}`].filter(Boolean);
  try {
    for (const q of claims) {
      const s = await fetch(`${api}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json`, {
        headers,
        signal: AbortSignal.timeout(4000),
      }).then((r) => r.json());
      const qid = s?.query?.search?.[0]?.title;
      if (!qid) continue;
      const e = await fetch(`${api}?action=wbgetentities&ids=${qid}&props=sitelinks/urls&sitefilter=enwiki&format=json`, {
        headers,
        signal: AbortSignal.timeout(4000),
      }).then((r) => r.json());
      const url = e?.entities?.[qid]?.sitelinks?.enwiki?.url;
      if (url) return url;
    }
  } catch {
    /* Wikidata unavailable: leave blank */
  }
  return '';
}

const year = (date) => (date ? Number(date.slice(0, 4)) || null : null);

async function search(q) {
  const data = await tmdb('/search/tv', { query: q, include_adult: 'false', language: 'en-US' });
  return data.results.slice(0, 12).map((r) => ({
    id: r.id,
    title: r.name,
    original_title: r.original_name,
    year: year(r.first_air_date),
    language: r.original_language,
    poster: r.poster_path ? `${IMG}/w185${r.poster_path}` : '',
    overview: r.overview,
  }));
}

async function details(id) {
  const d = await tmdb(`/tv/${id}`, { append_to_response: 'aggregate_credits,external_ids', language: 'en-US' });
  const imdb = d.external_ids?.imdb_id || '';
  const cast = (d.aggregate_credits?.cast || [])
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      tmdb_person_id: c.id,
      // The role with the most episodes.
      character: [...(c.roles || [])].sort((a, b) => b.episode_count - a.episode_count)[0]?.character || '',
    }));
  return {
    tmdb_id: d.id,
    title: d.name,
    year_start: year(d.first_air_date),
    year_end: ENDED.has(d.status) ? year(d.last_air_date) : null,
    total_seasons: d.number_of_seasons ?? null,
    original_language: d.original_language || '',
    poster_path: d.poster_path || '',
    poster_preview: d.poster_path ? `${IMG}/w342${d.poster_path}` : '',
    imdb_id: /^tt\d+$/.test(imdb) ? imdb : '',
    wikipedia_url: await wikipediaUrl(d.id, imdb),
    cast,
  };
}

async function poster(path) {
  if (!/^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(path)) return json({ error: 'Bad poster path' }, 400);
  const r = await fetch(`${IMG}/w780${path}`);
  if (!r.ok) return json({ error: `Poster ${r.status}` }, 502);
  return new Response(r.body, {
    headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'no-store' },
  });
}

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!(await isSignedIn(req))) return json({ error: 'Sign in required' }, 401);
  const p = new URL(req.url).searchParams;
  try {
    if (p.get('q')) return json(await search(p.get('q').slice(0, 100)));
    if (/^\d+$/.test(p.get('id') || '')) return json(await details(p.get('id')));
    if (p.get('poster')) return await poster(p.get('poster'));
    return json({ error: 'Use ?q=, ?id= or ?poster=' }, 400);
  } catch (err) {
    return json({ error: err.message }, err.status || 500);
  }
};
