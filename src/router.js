const routes = [];
let currentCleanup = null;

/** Register a route. `pattern` like "/show/:slug". */
export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp(
    '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')).replace(/\/$/, '') + '/?$'
  );
  routes.push({ re, keys, handler });
}

export function navigate(to, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  resolve();
}

export async function resolve() {
  const path = location.pathname;
  for (const { re, keys, handler } of routes) {
    const m = path.match(re);
    if (!m) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    if (typeof currentCleanup === 'function') currentCleanup();
    currentCleanup = await handler(params, new URLSearchParams(location.search));
    return;
  }
  if (typeof currentCleanup === 'function') currentCleanup();
  currentCleanup = null;
  routes.notFound?.();
}

export function setNotFound(fn) {
  routes.notFound = fn;
}

export function startRouter() {
  // Intercept same-origin link clicks for client-side navigation.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    if (url.pathname + url.search === location.pathname + location.search) return;
    navigate(url.pathname + url.search);
    window.scrollTo(0, 0);
  });
  window.addEventListener('popstate', resolve);
  resolve();
}
