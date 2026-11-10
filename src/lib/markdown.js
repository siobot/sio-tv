import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

// Spoilers: ||hidden text|| → tap to reveal.
marked.use({
  extensions: [
    {
      name: 'spoiler',
      level: 'inline',
      start: (src) => src.indexOf('||'),
      tokenizer(src) {
        const m = /^\|\|(?=\S)([\s\S]*?\S)\|\|/.exec(src);
        if (m) return { type: 'spoiler', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(token) {
        return `<span class="spoiler" tabindex="0" role="button" aria-expanded="false" title="Spoiler: tap to reveal">${this.parser.parseInline(token.tokens)}</span>`;
      },
    },
  ],
});

// Open external links in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(src) {
  if (!src) return '';
  return DOMPurify.sanitize(marked.parse(src), { USE_PROFILES: { html: true }, ADD_ATTR: ['tabindex', 'aria-expanded'] });
}

/** Reveal/hide spoilers on tap, Enter or Space. Call once at startup. */
export function enableSpoilers(root = document) {
  const toggle = (el) => {
    const open = el.classList.toggle('revealed');
    el.setAttribute('aria-expanded', String(open));
  };
  root.addEventListener('click', (e) => {
    const el = e.target.closest('.spoiler');
    if (!el) return;
    // Hidden spoiler: first tap reveals and must not follow a link inside it.
    if (!el.classList.contains('revealed')) e.preventDefault();
    if (!el.classList.contains('revealed') || !e.target.closest('a')) toggle(el);
  }, true);
  root.addEventListener('keydown', (e) => {
    const el = e.target.closest?.('.spoiler');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggle(el);
    }
  });
}
