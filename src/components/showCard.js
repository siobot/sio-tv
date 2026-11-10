import { esc, safeUrl } from '../lib/dom.js';
import { formatYears } from '../lib/format.js';
import { stars } from '../lib/stars.js';

/** Poster tile linking to the show page. `subtitle` overrides the years line. */
export function showCard(show, subtitle) {
  const cover = safeUrl(show.cover_url);
  const sub = subtitle ?? formatYears(show.year_start, show.year_end);
  return `
    <li>
      <a class="card" href="/show/${encodeURIComponent(show.slug)}">
        <div class="poster">
          ${
            cover
              ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async" />`
              : `<span class="poster-fallback">${esc(show.title)}</span>`
          }
          ${show.owned ? '<span class="owned-badge">Owned</span>' : ''}
        </div>
        <div class="card-title">${esc(show.title)}</div>
        ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
        ${stars(show.rating, { compact: true })}
      </a>
    </li>`;
}
