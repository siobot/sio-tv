import { getActor } from '../api/actors.js';
import { showCard } from '../components/showCard.js';
import { setTitle, esc } from '../lib/dom.js';
import { formatYears } from '../lib/format.js';
import { notFound } from './notFound.js';

export async function actorView(app, { slug }) {
  app.innerHTML = '<p class="status">Loading…</p>';
  const actor = await getActor(slug);
  if (!actor) return notFound(app);
  setTitle(actor.name);
  const n = actor.shows.length;
  app.innerHTML = `
    <header class="page-head">
      <h1>${esc(actor.name)}</h1>
      <p class="meta">${n} show${n === 1 ? '' : 's'} in this list</p>
    </header>
    <ul class="grid">
      ${actor.shows
        .map((s) => showCard(s, [s.character && `as ${s.character}`, formatYears(s.year_start, s.year_end)].filter(Boolean).join(' · ')))
        .join('')}
    </ul>`;
}
