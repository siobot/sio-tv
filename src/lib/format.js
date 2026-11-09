const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** "2011–2018", "2011–", "2011", or "" */
export function formatYears(start, end) {
  if (!start) return end ? String(end) : '';
  if (end == null) return `${start}–`;
  return end === start ? String(start) : `${start}–${end}`;
}

/** ISO 639-1 code → English name ("da" → "Danish"). Falls back to the raw code. */
export function languageName(code) {
  if (!code) return '';
  try {
    return languageNames.of(code) || code;
  } catch {
    return code;
  }
}

/** [1,2,3,5] → "S1–3, S5" */
export function formatSeasonRanges(seasons) {
  const s = [...new Set(seasons)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `S${s[i]}` : `S${s[i]}–${s[j]}`);
    i = j;
  }
  return out.join(', ');
}

export function imdbUrl(imdbId) {
  return imdbId ? `https://www.imdb.com/title/${imdbId}/` : '';
}
