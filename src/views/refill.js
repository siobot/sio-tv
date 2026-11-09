import { supabase } from '../supabase.js';
import { getShow } from '../api/shows.js';
import { searchTmdb, tmdbDetails, tmdbPoster, uploadCover, removeCover, saveShow } from '../api/edit.js';
import { isSignedIn } from '../auth.js';
import { navigate } from '../router.js';
import { clearGridCache } from './grid.js';
import { esc, setTitle } from '../lib/dom.js';
import { languageName } from '../lib/format.js';
import { slugify } from '../lib/slug.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Run `fn` over `items`, at most `n` at a time. */
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

/** Pre-select a result only when the title matches exactly (and the year too, if known). */
function bestMatch(show, results) {
  const t = norm(show.title);
  const exact = results.filter((r) => norm(r.title) === t || norm(r.original_title) === t);
  if (!exact.length) return null;
  if (show.year_start) return exact.find((r) => r.year === show.year_start) ?? null;
  return exact.length === 1 ? exact[0] : null;
}

/** TMDB cast first (with characters and ids), then any of your names TMDB doesn't list. */
function mergeCast(mine, tmdb) {
  const out = tmdb.map((c) => ({ ...c }));
  for (const a of mine) if (!out.some((c) => sameName(c.name, a.name))) out.push({ name: a.name, character: a.character ?? '', tmdb_person_id: null });
  return out.map((a) => ({ ...a, slug: slugify(a.name) || 'actor', character: a.character || '' }));
}

export async function refillView(app) {
  if (!isSignedIn()) return navigate('/login?next=%2Frefill', { replace: true });
  setTitle('Refill from TMDB');
  app.innerHTML = '<p class="status">Loading…</p>';

  const { data: shows, error } = await supabase
    .from('shows')
    .select('id, slug, title, year_start, tmdb_id, cover_url')
    .order('title');
  if (error) throw error;

  // Per-show state
  const rows = new Map(shows.map((s) => [s.id, { show: s, q: s.title, results: null, pick: null, status: '', done: false }]));
  const opts = { onlyUnlinked: true, keepTitle: true, replaceCover: false };
  let running = false;

  const visible = () => [...rows.values()].filter((r) => !opts.onlyUnlinked || !r.show.tmdb_id || r.done);
  const picked = () => visible().filter((r) => r.pick && !r.done);

  function rowHtml(r) {
    const s = r.show;
    const results = r.results === null
      ? '<p class="hint">Searching…</p>'
      : r.results.length
        ? `<ul class="picks">${r.results
            .map((x) => `<li><button type="button" class="pick" data-pick="${s.id}:${x.id}" aria-pressed="${r.pick === x.id}">
                ${x.poster ? `<img src="${esc(x.poster)}" alt="" loading="lazy" />` : '<span class="result-noimg"></span>'}
                <span><strong>${esc(x.title)}</strong><span class="muted">${esc([x.year, languageName(x.language)].filter(Boolean).join(' · '))}</span></span>
              </button></li>`)
            .join('')}</ul>`
        : '<p class="hint">No matches. Try a different search.</p>';
    return `
      <li class="block refill-row${r.done ? ' done' : ''}" data-row="${s.id}">
        <div class="refill-head">
          <a href="/show/${encodeURIComponent(s.slug)}"><strong>${esc(s.title)}</strong></a>
          <span class="muted">${esc([s.year_start, s.tmdb_id ? 'linked' : 'not linked', s.cover_url ? 'has cover' : 'no cover'].filter(Boolean).join(' · '))}</span>
        </div>
        ${r.done ? '' : `
          <div class="search-row">
            <input data-q="${s.id}" value="${esc(r.q)}" enterkeyhint="search" autocomplete="off" aria-label="Search TMDB for ${esc(s.title)}" />
            <button type="button" class="btn" data-research="${s.id}">Search</button>
          </div>
          ${results}
          ${r.pick ? `<button type="button" class="link-btn" data-skip="${s.id}">Skip this show</button>` : ''}`}
        <p class="row-status" role="status">${esc(r.status)}</p>
      </li>`;
  }

  function render() {
    const list = visible();
    const n = picked().length;
    app.innerHTML = `
      <section class="refill">
        <header class="page-head">
          <h1>Refill from TMDB</h1>
          <p class="meta">Pick the right match for each show, then refill them together. Exact title and year matches are pre-selected.
            Kept: your comments, themes, recommended seasons and Rotten Tomatoes link.
            Filled: years, seasons, language, cast and characters, IMDb, Wikipedia, and covers that are missing.</p>
        </header>
        <div class="block options">
          <label class="check"><input type="checkbox" data-opt="onlyUnlinked" ${opts.onlyUnlinked ? 'checked' : ''} /> Only shows not yet linked to TMDB</label>
          <label class="check"><input type="checkbox" data-opt="keepTitle" ${opts.keepTitle ? 'checked' : ''} /> Keep my titles</label>
          <label class="check"><input type="checkbox" data-opt="replaceCover" ${opts.replaceCover ? 'checked' : ''} /> Replace existing covers</label>
        </div>
        ${list.length ? `<ol class="refill-list">${list.map(rowHtml).join('')}</ol>` : '<p class="status">Every show is linked to TMDB. Untick the first option to refill them again.</p>'}
        <div class="actions sticky-actions">
          <button type="button" class="btn primary" data-run ${n && !running ? '' : 'disabled'}>${running ? 'Refilling…' : `Refill ${n} show${n === 1 ? '' : 's'}`}</button>
        </div>
      </section>`;
  }

  function renderRow(id) {
    const el = app.querySelector(`[data-row="${id}"]`);
    if (el) el.outerHTML = rowHtml(rows.get(id));
    const n = picked().length;
    const run = app.querySelector('[data-run]');
    if (run) {
      run.disabled = !n || running;
      run.textContent = running ? 'Refilling…' : `Refill ${n} show${n === 1 ? '' : 's'}`;
    }
  }

  async function search(r) {
    r.searched = true;
    r.results = null;
    renderRow(r.show.id);
    try {
      r.results = (await searchTmdb(r.q)).slice(0, 6);
      if (r.pick == null) r.pick = bestMatch(r.show, r.results)?.id ?? null;
      r.status = '';
    } catch (ex) {
      r.results = [];
      r.status = ex.message;
    }
    renderRow(r.show.id);
  }

  async function refillOne(r) {
    r.status = 'Refilling…';
    renderRow(r.show.id);
    let uploaded = '';
    try {
      const [show, d] = await Promise.all([getShow(r.show.slug), tmdbDetails(r.pick)]);
      const title = opts.keepTitle ? show.title : d.title || show.title;
      const slug = slugify(title) || `tv-${d.tmdb_id}`;
      let cover = show.cover_url || '';
      if (d.poster_path && (!cover || opts.replaceCover)) {
        uploaded = await uploadCover(await tmdbPoster(d.poster_path), slug.slice(0, 60));
        cover = uploaded;
      }
      const total = d.total_seasons ?? show.total_seasons;
      const preferred = (show.preferred_seasons ?? []).filter((n) => !total || n <= total);
      const saved = await saveShow({
        id: show.id,
        slug,
        title,
        year_start: d.year_start ?? show.year_start,
        year_end: d.year_start ? d.year_end : show.year_end,
        total_seasons: total,
        preferred_seasons: total && preferred.length === total ? [] : preferred,
        cover_url: cover || null,
        original_language: d.original_language || show.original_language,
        comments: show.comments,
        tmdb_id: d.tmdb_id,
        imdb_id: d.imdb_id || show.imdb_id,
        wikipedia_url: d.wikipedia_url || show.wikipedia_url,
        rotten_tomatoes_url: show.rotten_tomatoes_url,
        themes: show.themes.map((t) => ({ name: t.name, slug: t.slug })),
        cast: mergeCast(show.cast, d.cast),
      });
      if (uploaded && show.cover_url) removeCover(show.cover_url).catch(console.warn);
      Object.assign(r.show, { slug: saved.slug, title, year_start: d.year_start ?? show.year_start, tmdb_id: d.tmdb_id, cover_url: cover });
      r.done = true;
      r.status = `Done.${d.wikipedia_url || show.wikipedia_url ? '' : ' No Wikipedia article found.'}`;
    } catch (ex) {
      if (uploaded) removeCover(uploaded).catch(console.warn);
      r.status = `Failed: ${/tmdb_id/.test(ex.message) ? 'another show already uses this TMDB entry.' : ex.message}`;
    }
    renderRow(r.show.id);
  }

  async function runAll() {
    const todo = picked();
    if (!todo.length) return;
    running = true;
    renderRow(-1);
    await pool(todo, 2, refillOne);
    running = false;
    clearGridCache();
    renderRow(-1);
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || running) return;
    if (b.dataset.pick) {
      const [id, pick] = b.dataset.pick.split(':').map(Number);
      const r = rows.get(id);
      r.pick = r.pick === pick ? null : pick;
      renderRow(id);
    } else if (b.dataset.research) {
      const r = rows.get(Number(b.dataset.research));
      r.q = app.querySelector(`[data-q="${r.show.id}"]`).value.trim() || r.show.title;
      r.pick = null;
      search(r);
    } else if (b.dataset.skip) {
      rows.get(Number(b.dataset.skip)).pick = null;
      renderRow(Number(b.dataset.skip));
    } else if ('run' in b.dataset) runAll();
  }

  function onKey(e) {
    if (e.key === 'Enter' && e.target.dataset.q) {
      e.preventDefault();
      app.querySelector(`[data-research="${e.target.dataset.q}"]`).click();
    }
  }

  function onChange(e) {
    const k = e.target.dataset.opt;
    if (!k || running) return;
    opts[k] = e.target.checked;
    render();
    if (k === 'onlyUnlinked') visible().filter((r) => !r.searched).forEach(search);
  }

  render();
  app.addEventListener('click', onClick);
  app.addEventListener('keydown', onKey);
  app.addEventListener('change', onChange);
  pool(visible(), 3, search);
  return () => {
    app.removeEventListener('click', onClick);
    app.removeEventListener('keydown', onKey);
    app.removeEventListener('change', onChange);
  };
}
