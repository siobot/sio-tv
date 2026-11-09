import './styles.css';
import { isConfigured } from './supabase.js';
import { route, setNotFound, startRouter } from './router.js';
import { gridView } from './views/grid.js';
import { showView } from './views/show.js';
import { actorView } from './views/actor.js';
import { notFound } from './views/notFound.js';
import { esc } from './lib/dom.js';

const app = document.getElementById('app');

function guard(view) {
  return async (params, query) => {
    try {
      return await view(app, params, query);
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="status error"><h1>Something went wrong</h1><p>${esc(err.message || err)}</p></div>`;
    }
  };
}

if (!isConfigured) {
  app.innerHTML = `<div class="status error"><h1>Not configured</h1>
    <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README).</p></div>`;
} else {
  route('/', guard(gridView));
  route('/show/:slug', guard(showView));
  route('/actor/:slug', guard(actorView));
  setNotFound(() => notFound(app));
  startRouter();
}
