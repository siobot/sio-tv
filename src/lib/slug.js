// Letters that Unicode normalisation does not split into base + accent.
const FOLD = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ð: 'd', þ: 'th', ł: 'l', ı: 'i' };

/** "Small Town" → "small-town"; "Birgitte Hjort Sørensen" → "birgitte-hjort-sorensen" */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[øæœßđðþłı]/g, (c) => FOLD[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
