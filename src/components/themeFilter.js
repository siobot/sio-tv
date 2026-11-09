import { esc } from '../lib/dom.js';

/**
 * Theme filter bar.
 * Counts are contextual:
 *   - no selection: total shows per theme
 *   - "all" mode:   shows in the current results that also have the theme
 *                   (i.e. what you'd get by adding it); 0 = dimmed
 *   - "any" mode:   total shows per theme (adding one widens the results)
 */
export function themeFilter({ themes, shows, results, selected, match }) {
  const base = selected.size && match === 'all' ? results : shows;
  const counts = new Map(themes.map((t) => [t.id, 0]));
  for (const s of base) for (const id of s.themeIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  const chips = themes
    .map((t) => {
      const on = selected.has(t.slug);
      const n = counts.get(t.id) ?? 0;
      const dim = !on && n === 0;
      return `<button type="button" class="chip${on ? ' on' : ''}${dim ? ' dim' : ''}"
        data-theme="${esc(t.slug)}" aria-pressed="${on}">
        ${esc(t.name)}<span class="count">${n}</span></button>`;
    })
    .join('');

  return `
    <section class="filter" aria-label="Filter by theme">
      <div class="filter-head">
        <span class="filter-label">Themes</span>
        <div class="seg" role="group" aria-label="Match mode">
          <button type="button" data-match="any" aria-pressed="${match === 'any'}">Any</button>
          <button type="button" data-match="all" aria-pressed="${match === 'all'}">All</button>
        </div>
        ${selected.size ? `<button type="button" class="link-btn" data-clear>Clear</button>` : ''}
      </div>
      <div class="chips" data-chips>${chips || '<span class="muted">No themes yet.</span>'}</div>
      <button type="button" class="link-btn more" data-more hidden>Show all themes</button>
    </section>`;
}
