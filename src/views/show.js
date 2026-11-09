import { getShow } from '../api/shows.js';
import { esc, safeUrl, setTitle } from '../lib/dom.js';
import { formatYears, languageName, formatSeasonRanges, imdbUrl } from '../lib/format.js';
import { renderMarkdown } from '../lib/markdown.js';
import { notFound } from './notFound.js';

function seasonsBlock(total, preferred) {
  if (!total) return '';
  const pref = new Set(preferred ?? []);
  const all = !pref.size;
  const chips = Array.from({ length: total }, (_, i) => i + 1)
    .map((n) => `<li class="season${all || pref.has(n) ? ' good' : ''}">S${n}</li>`)
    .join('');
  const note = all
    ? `All ${total} season${total === 1 ? '' : 's'} recommended`
    : `Watch ${formatSeasonRanges([...pref])} of ${total}`;
  return `
    <section class="block">
      <h2>Seasons</h2>
      <p class="season-note">${esc(note)}</p>
      <ul class="seasons" aria-label="Seasons; highlighted are recommended">${chips}</ul>
    </section>`;
}

function linksBlock(show) {
  const links = [
    ['Wikipedia', safeUrl(show.wikipedia_url)],
    ['IMDb', imdbUrl(show.imdb_id)],
    ['Rotten Tomatoes', safeUrl(show.rotten_tomatoes_url)],
  ].filter(([, url]) => url);
  if (!links.length) return '';
  return `
    <section class="block">
      <h2>Links</h2>
      <div class="links">
        ${links
          .map(([label, url]) => `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`)
          .join('')}
      </div>
    </section>`;
}

export async function showView(app, { slug }) {
  app.innerHTML = '<p class="status">Loading…</p>';
  const show = await getShow(slug);
  if (!show) return notFound(app);
  setTitle(show.title);

  const cover = safeUrl(show.cover_url);
  const years = formatYears(show.year_start, show.year_end);
  const lang = languageName(show.original_language);
  const meta = [years, lang && `${lang} audio`].filter(Boolean);

  app.innerHTML = `
    <article class="detail">
      <header class="detail-head">
        <div class="poster detail-poster">
          ${cover ? `<img src="${esc(cover)}" alt="${esc(show.title)} poster" />` : `<span class="poster-fallback">${esc(show.title)}</span>`}
        </div>
        <div class="detail-title">
          <h1>${esc(show.title)}</h1>
          ${meta.length ? `<p class="meta">${meta.map(esc).join(' · ')}</p>` : ''}
          ${
            show.themes.length
              ? `<ul class="tags">${show.themes
                  .map((t) => `<li><a class="chip" href="/?themes=${encodeURIComponent(t.slug)}">${esc(t.name)}</a></li>`)
                  .join('')}</ul>`
              : ''
          }
        </div>
      </header>

      ${show.comments ? `<section class="block prose">${renderMarkdown(show.comments)}</section>` : ''}

      ${seasonsBlock(show.total_seasons, show.preferred_seasons)}

      ${
        show.cast.length
          ? `<section class="block">
              <h2>Cast</h2>
              <ul class="cast">
                ${show.cast
                  .map(
                    (a) => `<li><a href="/actor/${encodeURIComponent(a.slug)}">
                      <span class="actor">${esc(a.name)}</span>
                      ${a.character ? `<span class="character">${esc(a.character)}</span>` : ''}
                    </a></li>`
                  )
                  .join('')}
              </ul>
            </section>`
          : ''
      }

      ${linksBlock(show)}
    </article>`;
}
