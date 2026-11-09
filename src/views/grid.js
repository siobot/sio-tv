import { listShows } from '../api/shows.js';
import { listThemes } from '../api/themes.js';
import { themeFilter } from '../components/themeFilter.js';
import { showCard } from '../components/showCard.js';
import { setTitle } from '../lib/dom.js';

let cache = null; // { shows, themes } — reused across navigations within the session

function readState(query) {
  const selected = new Set((query.get('themes') || '').split(',').map((s) => s.trim()).filter(Boolean));
  const match = query.get('match') === 'all' ? 'all' : 'any';
  return { selected, match };
}

function writeUrl({ selected, match }) {
  const parts = [];
  if (selected.size) parts.push('themes=' + [...selected].map(encodeURIComponent).join(','));
  if (match === 'all') parts.push('match=all');
  history.replaceState(null, '', parts.length ? `/?${parts.join('&')}` : '/');
}

function filterShows(shows, themes, { selected, match }) {
  if (!selected.size) return shows;
  const ids = themes.filter((t) => selected.has(t.slug)).map((t) => t.id);
  if (!ids.length) return match === 'all' ? [] : shows;
  return shows.filter((s) =>
    match === 'all' ? ids.every((id) => s.themeIds.includes(id)) : ids.some((id) => s.themeIds.includes(id))
  );
}

export async function gridView(app, _params, query) {
  setTitle();
  if (!cache) {
    app.innerHTML = '<p class="status">Loading…</p>';
    const [shows, themes] = await Promise.all([listShows(), listThemes()]);
    cache = { shows, themes };
  }
  const { shows, themes } = cache;
  const state = readState(query);
  // Drop unknown theme slugs from shared links.
  for (const slug of state.selected) if (!themes.some((t) => t.slug === slug)) state.selected.delete(slug);

  let expanded = false;

  function render() {
    const results = filterShows(shows, themes, state);
    app.innerHTML = `
      ${themeFilter({ themes, shows, results, selected: state.selected, match: state.match })}
      <p class="result-count">${results.length} of ${shows.length} show${shows.length === 1 ? '' : 's'}</p>
      ${
        results.length
          ? `<ul class="grid">${results.map((s) => showCard(s)).join('')}</ul>`
          : `<p class="status">${shows.length ? 'No shows match these themes.' : 'No shows yet.'}</p>`
      }`;
    const chips = app.querySelector('[data-chips]');
    const more = app.querySelector('[data-more]');
    chips.classList.toggle('expanded', expanded);
    if (!expanded && chips.scrollHeight > chips.clientHeight + 4) more.hidden = false;
  }

  function onClick(e) {
    const chip = e.target.closest('[data-theme]');
    const mode = e.target.closest('[data-match]');
    if (chip) {
      const slug = chip.dataset.theme;
      state.selected.has(slug) ? state.selected.delete(slug) : state.selected.add(slug);
    } else if (mode) {
      state.match = mode.dataset.match;
    } else if (e.target.closest('[data-clear]')) {
      state.selected.clear();
    } else if (e.target.closest('[data-more]')) {
      expanded = true;
    } else return;
    writeUrl(state);
    render();
  }

  render();
  app.addEventListener('click', onClick);
  return () => app.removeEventListener('click', onClick);
}

/** Invalidate after edits (used by edit mode later). */
export function clearGridCache() {
  cache = null;
}
