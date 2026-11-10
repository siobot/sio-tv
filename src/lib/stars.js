import { esc } from './dom.js';

/** 0–5 → "★★★☆☆" with an accessible label; null/undefined → "". */
export function stars(rating, { compact = false } = {}) {
  if (rating == null) return '';
  const n = Math.max(0, Math.min(5, rating));
  const label = `Rated ${n} out of 5`;
  return `<span class="stars${compact ? ' compact' : ''}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(5 - n)}</span></span>`;
}
