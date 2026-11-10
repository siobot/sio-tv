import { getShow, getPrivate } from '../api/shows.js';
import {
  searchTmdb, tmdbDetails, tmdbPoster, listSuggestions, uploadCover, removeCover, saveShow, deleteShow,
} from '../api/edit.js';
import { isSignedIn } from '../auth.js';
import { navigate } from '../router.js';
import { clearGridCache } from './grid.js';
import { notFound } from './notFound.js';
import { esc, safeUrl, setTitle } from '../lib/dom.js';
import { languageName, formatYears } from '../lib/format.js';
import { slugify } from '../lib/slug.js';

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const intOrNull = (v) => (String(v ?? '').trim() === '' ? null : Number.parseInt(v, 10));
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "https://www.imdb.com/title/tt0903747/" or "tt0903747" → "tt0903747" */
const parseImdb = (v) => String(v ?? '').match(/tt\d+/)?.[0] ?? '';

export async function editView(app, { slug } = {}) {
  const isNew = !slug;
  if (!isSignedIn()) {
    return navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
  }
  app.innerHTML = '<p class="status">Loading…</p>';
  const [show, suggestions] = await Promise.all([isNew ? null : getShow(slug), listSuggestions()]);
  // null = couldn't load; then the date field is disabled and left untouched on save.
  const priv = show ? await getPrivate(show.id).catch(() => null) : { last_watched_at: null };
  if (!isNew && !show) return notFound(app);
  setTitle(isNew ? 'Add show' : `Edit ${show.title}`);

  // ---- State not held in plain inputs ----
  const st = {
    id: show?.id ?? null,
    tmdbId: show?.tmdb_id ?? null,
    // Stored [] means "all recommended"; in the form that shows as every box ticked.
    preferred: new Set(
      show?.preferred_seasons?.length
        ? show.preferred_seasons
        : Array.from({ length: show?.total_seasons ?? 0 }, (_, i) => i + 1)
    ),
    shownTotal: show?.total_seasons ?? 0, // season count last rendered
    themes: show?.themes.map((t) => t.name) ?? [],
    cast: show?.cast.map((a) => ({ name: a.name, character: a.character ?? '', tmdb_person_id: null })) ?? [],
    savedCover: show?.cover_url ?? '',
    cover: show?.cover_url ?? '', // what the preview shows
    pendingBlob: null, // file chosen by the user
    pendingPoster: '', // TMDB poster path to fetch on save
    rating: show?.rating ?? null,
    busy: false,
  };

  const v = (name) => show?.[name] ?? '';
  app.innerHTML = `
    <form class="edit" novalidate>
      <header class="page-head">
        <h1>${isNew ? 'Add show' : `Edit <em>${esc(show.title)}</em>`}</h1>
      </header>

      <details class="block tmdb" ${isNew ? 'open' : ''}>
        <summary>${isNew ? 'Fill from TMDB' : 'Refill from TMDB'}</summary>
        <p class="hint">Fills title, years, seasons, language, cover, cast, IMDb and Wikipedia. Your comments, themes and recommended seasons are kept.</p>
        <div class="search-row">
          <input type="search" name="q" placeholder="Search by title" enterkeyhint="search" autocomplete="off" value="${esc(v('title'))}" />
          <button type="button" class="btn" data-search>Search</button>
        </div>
        <p class="hint" data-tmdb-status role="status"></p>
        <ul class="results" data-results></ul>
      </details>

      <section class="block">
        <label class="field">Title
          <input name="title" required value="${esc(v('title'))}" autocomplete="off" />
        </label>
        <div class="row3">
          <label class="field">First year
            <input name="year_start" type="number" inputmode="numeric" min="1900" max="2100" value="${esc(v('year_start'))}" />
          </label>
          <label class="field">Last year
            <input name="year_end" type="number" inputmode="numeric" min="1900" max="2100" placeholder="ongoing" value="${esc(v('year_end'))}" />
          </label>
          <label class="field">Seasons
            <input name="total_seasons" type="number" inputmode="numeric" min="0" max="99" value="${esc(v('total_seasons'))}" />
          </label>
        </div>
        <label class="field">Original audio language
          <span class="inline">
            <input name="original_language" maxlength="3" placeholder="e.g. da" autocomplete="off" autocapitalize="none" value="${esc(v('original_language'))}" />
            <span class="muted" data-lang-name></span>
          </span>
        </label>
      </section>

      <section class="block">
        <h2>Recommended seasons</h2>
        <p class="hint">All seasons are ticked by default. Untick the ones not worth watching.</p>
        <div class="season-picks" data-seasons></div>
      </section>

      <section class="block">
        <h2>Cover</h2>
        <div class="cover-edit">
          <div class="poster" data-cover></div>
          <div class="cover-actions">
            <label class="btn">Upload image
              <input type="file" accept="${COVER_TYPES.join(',')}" data-file hidden />
            </label>
            <button type="button" class="btn ghost" data-cover-clear>Remove</button>
            <p class="hint">JPEG, PNG or WebP, up to 5 MB.</p>
          </div>
        </div>
      </section>

      <section class="block">
        <h2>Comments</h2>
        <textarea name="comments" rows="8" placeholder="Why it's worth watching…">${esc(v('comments'))}</textarea>
        <p class="hint">Blank line between paragraphs. *italic*, **bold**, [link](https://…), ||spoiler||.</p>
      </section>

      <section class="block">
        <h2>Themes</h2>
        <ul class="tags" data-theme-chips></ul>
        <div class="search-row">
          <input data-theme-input placeholder="Add a theme, e.g. small town" autocomplete="off" enterkeyhint="done" />
          <button type="button" class="btn" data-theme-add>Add</button>
        </div>
        <div class="suggest" data-theme-suggest></div>
      </section>

      <section class="block">
        <h2>Cast</h2>
        <datalist id="actor-names">${suggestions.actors.map((a) => `<option value="${esc(a.name)}"></option>`).join('')}</datalist>
        <ol class="cast-edit" data-cast></ol>
        <button type="button" class="btn" data-cast-add>Add actor</button>
      </section>

      <section class="block">
        <h2>My rating</h2>
        <div class="rating-pick" role="radiogroup" aria-label="Rating" data-rating></div>
        <label class="check"><input type="checkbox" name="owned" ${show?.owned ? 'checked' : ''} /> Owned <span class="muted">(shown publicly)</span></label>
        <label class="field">Last watched <span class="muted">(only you see this)</span>
          <input name="last_watched" type="date" value="${esc(priv?.last_watched_at ? toDateInput(priv.last_watched_at) : '')}" ${priv ? '' : 'disabled'} />
          ${priv ? '' : '<span class="hint">Could not load; it will be left unchanged.</span>'}
        </label>
      </section>

      <section class="block">
        <h2>Links</h2>
        <label class="field">Wikipedia URL
          <input name="wikipedia_url" type="url" inputmode="url" value="${esc(v('wikipedia_url'))}" />
        </label>
        <label class="field">IMDb ID or URL
          <input name="imdb_id" inputmode="url" placeholder="tt0903747" autocapitalize="none" value="${esc(v('imdb_id'))}" />
        </label>
        <label class="field">Rotten Tomatoes URL
          <input name="rotten_tomatoes_url" type="url" inputmode="url" value="${esc(v('rotten_tomatoes_url'))}" />
        </label>
      </section>

      <p class="error-msg" data-error role="alert"></p>
      <div class="actions">
        <button type="submit" class="btn primary" data-save>${isNew ? 'Add show' : 'Save'}</button>
        <a class="btn ghost" href="${isNew ? '/' : `/show/${encodeURIComponent(show.slug)}`}">Cancel</a>
        ${isNew ? '' : '<button type="button" class="btn danger" data-delete>Delete</button>'}
      </div>
    </form>`;

  const form = app.querySelector('form');
  const $ = (sel) => form.querySelector(sel);
  const field = (name) => form.elements.namedItem(name);
  const errorBox = $('[data-error]');

  // ---- Renderers ----
  function renderLang() {
    const code = field('original_language').value.trim().toLowerCase();
    const name = code ? languageName(code) : '';
    $('[data-lang-name]').textContent = name && name !== code ? name : '';
  }

  function renderSeasons() {
    const total = Math.min(intOrNull(field('total_seasons').value) ?? 0, 99);
    // If every season was ticked, keep it that way when the count grows.
    const allTicked = st.preferred.size === st.shownTotal;
    for (let n = 1; n <= total; n++) if (allTicked && n > st.shownTotal) st.preferred.add(n);
    for (const n of [...st.preferred]) if (n > total) st.preferred.delete(n);
    st.shownTotal = total;
    $('[data-seasons]').innerHTML = total
      ? Array.from({ length: total }, (_, i) => i + 1)
          .map((n) => `<label class="season-pick"><input type="checkbox" value="${n}" data-season ${st.preferred.has(n) ? 'checked' : ''} /><span>S${n}</span></label>`)
          .join('')
      : '<span class="muted">Enter the number of seasons first.</span>';
  }

  function renderRating() {
    const opts = [[null, 'Not rated'], ...[0, 1, 2, 3, 4, 5].map((n) => [n, `${n}★`])];
    $('[data-rating]').innerHTML = opts
      .map(([n, label]) => `<button type="button" role="radio" class="rate${n === null ? ' none' : ''}" data-rate="${n ?? ''}" aria-checked="${st.rating === n}" aria-label="${n === null ? 'Not rated' : `${n} out of 5`}">${label}</button>`)
      .join('');
  }

  function renderCover() {
    const url = safeUrl(st.cover) || (st.cover.startsWith('blob:') ? st.cover : '');
    $('[data-cover]').innerHTML = url
      ? `<img src="${esc(url)}" alt="Cover preview" />`
      : `<span class="poster-fallback">No cover</span>`;
    $('[data-cover-clear]').hidden = !url;
  }

  function renderThemes() {
    $('[data-theme-chips]').innerHTML = st.themes
      .map((t, i) => `<li><span class="chip on">${esc(t)}<button type="button" class="chip-x" data-theme-remove="${i}" aria-label="Remove ${esc(t)}">×</button></span></li>`)
      .join('');
    const q = $('[data-theme-input]').value.trim().toLowerCase();
    const pool = suggestions.themes.filter((t) => !st.themes.some((x) => sameName(x, t)));
    const matches = (q ? pool.filter((t) => t.toLowerCase().includes(q)) : pool).slice(0, 20);
    $('[data-theme-suggest]').innerHTML = matches
      .map((t) => `<button type="button" class="chip" data-theme-pick="${esc(t)}">+ ${esc(t)}</button>`)
      .join('');
  }

  function renderCast() {
    $('[data-cast]').innerHTML = st.cast
      .map(
        (a, i) => `
        <li class="cast-row">
          <input data-cast-name="${i}" list="actor-names" placeholder="Actor" value="${esc(a.name)}" autocomplete="off" aria-label="Actor ${i + 1}" />
          <input data-cast-char="${i}" placeholder="Character" value="${esc(a.character)}" autocomplete="off" aria-label="Character ${i + 1}" />
          <span class="row-btns">
            <button type="button" class="icon-btn" data-cast-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon-btn" data-cast-down="${i}" aria-label="Move down" ${i === st.cast.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="icon-btn" data-cast-remove="${i}" aria-label="Remove">×</button>
          </span>
        </li>`
      )
      .join('');
  }

  // ---- TMDB ----
  async function runSearch() {
    const q = field('q').value.trim();
    const status = $('[data-tmdb-status]');
    if (!q) return;
    status.textContent = 'Searching…';
    $('[data-results]').innerHTML = '';
    try {
      const results = await searchTmdb(q);
      status.textContent = results.length ? 'Pick the right one:' : 'No matches on TMDB.';
      $('[data-results]').innerHTML = results
        .map(
          (r) => `
          <li><button type="button" class="result" data-tmdb-id="${r.id}">
            ${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" />` : '<span class="result-noimg"></span>'}
            <span class="result-text">
              <strong>${esc(r.title)}</strong>
              <span class="muted">${esc([r.year, languageName(r.language), r.original_title !== r.title && r.original_title].filter(Boolean).join(' · '))}</span>
              <span class="result-overview">${esc(r.overview || '')}</span>
            </span>
          </button></li>`
        )
        .join('');
    } catch (ex) {
      status.textContent = ex.message;
    }
  }

  async function applyTmdb(id) {
    const status = $('[data-tmdb-status]');
    status.textContent = 'Loading details…';
    try {
      const d = await tmdbDetails(id);
      st.tmdbId = d.tmdb_id;
      field('title').value = d.title || field('title').value;
      field('year_start').value = d.year_start ?? '';
      field('year_end').value = d.year_end ?? '';
      field('total_seasons').value = d.total_seasons ?? '';
      field('original_language').value = d.original_language || '';
      if (d.imdb_id) field('imdb_id').value = d.imdb_id;
      if (d.wikipedia_url) field('wikipedia_url').value = d.wikipedia_url;
      if (d.cast.length) st.cast = d.cast.map((c) => ({ ...c, character: c.character || '' }));
      if (d.poster_path) {
        st.pendingPoster = d.poster_path;
        st.pendingBlob = null;
        st.cover = d.poster_preview;
      }
      renderLang();
      renderSeasons();
      renderCover();
      renderCast();
      $('[data-results]').innerHTML = '';
      status.textContent = `Filled from TMDB: ${d.title} (${formatYears(d.year_start, d.year_end)}).${d.wikipedia_url ? '' : ' No Wikipedia article found.'} Review below, then save.`;
      form.querySelector('details.tmdb').open = false;
      field('title').focus();
    } catch (ex) {
      status.textContent = ex.message;
    }
  }

  // ---- Themes ----
  function addTheme(raw) {
    for (const name of String(raw).split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
      // Reuse the existing spelling if the theme already exists.
      const existing = suggestions.themes.find((t) => sameName(t, name));
      if (!st.themes.some((t) => sameName(t, name))) st.themes.push(existing ?? name);
    }
    $('[data-theme-input]').value = '';
    renderThemes();
  }

  // ---- Save / delete ----
  function setBusy(on, label) {
    st.busy = on;
    form.querySelectorAll('button, input, textarea').forEach((el) => (el.disabled = on));
    if (label) $('[data-save]').textContent = label;
  }

  async function save() {
    errorBox.textContent = '';
    const title = field('title').value.trim();
    const yearStart = intOrNull(field('year_start').value);
    const yearEnd = intOrNull(field('year_end').value);
    const imdbRaw = field('imdb_id').value.trim();
    const imdb = parseImdb(imdbRaw);
    const problems = [];
    if (!title) problems.push('Title is required.');
    for (const [label, y] of [['First year', yearStart], ['Last year', yearEnd]]) {
      if (y != null && (y < 1900 || y > 2100)) problems.push(`${label} must be between 1900 and 2100.`);
    }
    if (yearStart && yearEnd && yearEnd < yearStart) problems.push('Last year is before first year.');
    const totalSeasons = intOrNull(field('total_seasons').value);
    if (totalSeasons && !st.preferred.size) problems.push('Tick at least one recommended season.');
    if (imdbRaw && !imdb) problems.push('IMDb ID should look like tt0903747.');
    for (const name of ['wikipedia_url', 'rotten_tomatoes_url']) {
      const val = field(name).value.trim();
      if (val && !safeUrl(val)) problems.push(`${name === 'wikipedia_url' ? 'Wikipedia' : 'Rotten Tomatoes'} link must start with https://`);
    }
    if (problems.length) {
      errorBox.textContent = problems.join(' ');
      return;
    }

    // Non-Latin titles have no ASCII slug; fall back to the TMDB id.
    const showSlug = slugify(title) || (st.tmdbId ? `tv-${st.tmdbId}` : 'show');
    setBusy(true, 'Saving…');
    let uploaded = '';
    try {
      let coverUrl = st.cover;
      if (st.pendingBlob || st.pendingPoster) {
        const blob = st.pendingBlob ?? (await tmdbPoster(st.pendingPoster));
        uploaded = await uploadCover(blob, showSlug.slice(0, 60));
        coverUrl = uploaded;
      }
      const payload = {
        id: st.id,
        slug: showSlug,
        title,
        year_start: yearStart,
        year_end: yearEnd,
        total_seasons: totalSeasons,
        // All ticked is stored as [] ("all recommended"), so a season added later is included.
        preferred_seasons: st.preferred.size === totalSeasons ? [] : [...st.preferred],
        cover_url: coverUrl || null,
        original_language: field('original_language').value.trim().toLowerCase() || null,
        comments: field('comments').value.trim() || null,
        tmdb_id: st.tmdbId,
        imdb_id: imdb || null,
        wikipedia_url: field('wikipedia_url').value.trim() || null,
        rotten_tomatoes_url: field('rotten_tomatoes_url').value.trim() || null,
        rating: st.rating,
        owned: field('owned').checked,
        ...(priv && { last_watched_at: fromDateInput(field('last_watched').value, priv.last_watched_at) }),
        themes: st.themes.map((name) => ({ name, slug: slugify(name) || 'theme' })),
        cast: st.cast
          .filter((a) => a.name.trim())
          .map((a) => ({
            name: a.name.trim(),
            slug: slugify(a.name) || 'actor',
            character: a.character.trim(),
            tmdb_person_id: a.tmdb_person_id ?? null,
          })),
      };
      const saved = await saveShow(payload);
      if (st.savedCover && st.savedCover !== coverUrl) removeCover(st.savedCover).catch(console.warn);
      clearGridCache();
      navigate(`/show/${encodeURIComponent(saved.slug)}`);
      window.scrollTo(0, 0);
    } catch (ex) {
      if (uploaded) removeCover(uploaded).catch(console.warn);
      setBusy(false, isNew ? 'Add show' : 'Save');
      errorBox.textContent = friendlyError(ex);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${show.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteShow(st.id);
      if (st.savedCover) removeCover(st.savedCover).catch(console.warn);
      clearGridCache();
      navigate('/');
    } catch (ex) {
      setBusy(false);
      errorBox.textContent = friendlyError(ex);
    }
  }

  // ---- Events ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!st.busy) save();
  });

  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target === field('q')) {
      e.preventDefault();
      runSearch();
    } else if (e.target.matches('[data-theme-input]')) {
      e.preventDefault();
      addTheme(e.target.value);
    } else if (e.target.tagName === 'INPUT') {
      e.preventDefault(); // don't submit from a stray Enter
    }
  });

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name !== 'q') errorBox.textContent = '';
    if (t.name === 'total_seasons') renderSeasons();
    else if (t.name === 'original_language') renderLang();
    else if (t.matches('[data-theme-input]')) {
      if (t.value.includes(',')) addTheme(t.value);
      else renderThemes();
    } else if (t.dataset.castName != null) {
      const a = st.cast[t.dataset.castName];
      a.name = t.value;
      a.tmdb_person_id = null; // a typed name may be a different person
    } else if (t.dataset.castChar != null) st.cast[t.dataset.castChar].character = t.value;
  });

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-season]')) {
      const n = Number(t.value);
      t.checked ? st.preferred.add(n) : st.preferred.delete(n);
    } else if (t.matches('[data-file]')) {
      const file = t.files?.[0];
      t.value = '';
      if (!file) return;
      if (!COVER_TYPES.includes(file.type)) return (errorBox.textContent = 'Cover must be JPEG, PNG or WebP.');
      if (file.size > MAX_COVER_BYTES) return (errorBox.textContent = 'Cover must be 5 MB or smaller.');
      errorBox.textContent = '';
      if (st.cover.startsWith('blob:')) URL.revokeObjectURL(st.cover);
      st.pendingBlob = file;
      st.pendingPoster = '';
      st.cover = URL.createObjectURL(file);
      renderCover();
    }
  });

  form.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.type === 'submit') return;
    const d = t.dataset;
    if ('search' in d) runSearch();
    else if (d.tmdbId) applyTmdb(d.tmdbId);
    else if (d.rate != null) {
      st.rating = d.rate === '' ? null : Number(d.rate);
      renderRating();
    }
    else if ('themeAdd' in d) addTheme($('[data-theme-input]').value);
    else if (d.themePick) addTheme(d.themePick);
    else if (d.themeRemove != null) {
      st.themes.splice(Number(d.themeRemove), 1);
      renderThemes();
    } else if ('castAdd' in d) {
      st.cast.push({ name: '', character: '', tmdb_person_id: null });
      renderCast();
      form.querySelector(`[data-cast-name="${st.cast.length - 1}"]`).focus();
    } else if (d.castRemove != null) {
      st.cast.splice(Number(d.castRemove), 1);
      renderCast();
    } else if (d.castUp != null || d.castDown != null) {
      const i = Number(d.castUp ?? d.castDown);
      const j = d.castUp != null ? i - 1 : i + 1;
      [st.cast[i], st.cast[j]] = [st.cast[j], st.cast[i]];
      renderCast();
    } else if ('coverClear' in d) {
      if (st.cover.startsWith('blob:')) URL.revokeObjectURL(st.cover);
      st.cover = '';
      st.pendingBlob = null;
      st.pendingPoster = '';
      renderCover();
    } else if ('delete' in d) remove();
  });

  renderLang();
  renderSeasons();
  renderRating();
  renderCover();
  renderThemes();
  renderCast();
  if (isNew) field('q').focus();
}

/** ISO timestamp → "YYYY-MM-DD" in local time. */
function toDateInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date input → ISO timestamp; keeps the original time if the day is unchanged. */
function fromDateInput(value, original) {
  if (!value) return null;
  if (original && toDateInput(original) === value) return original;
  return new Date(`${value}T12:00:00`).toISOString();
}

function friendlyError(ex) {
  const msg = ex?.message || String(ex);
  if (/JWT|not authenticated|401/i.test(msg)) return 'Your sign-in expired. Sign in again, then retry.';
  if (/Only the owner|42501|row-level security/i.test(msg)) return 'This account is not allowed to edit.';
  if (/tmdb_id|shows_tmdb_id_key/.test(msg)) return 'Another show already uses this TMDB entry.';
  return msg;
}
