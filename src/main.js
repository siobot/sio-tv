import './styles.css';
import { isConfigured } from './supabase.js';
import { route, setNotFound, startRouter } from './router.js';
import { gridView } from './views/grid.js';
import { showView } from './views/show.js';
import { actorView } from './views/actor.js';
import { notFound } from './views/notFound.js';
import { loginView } from './views/login.js';
import { editView } from './views/edit.js';
import { initAuth, isSignedIn, onAuthChange, signOut } from './auth.js';
import { navigate } from './router.js';
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
  start();
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = isSignedIn()
    ? `<a class="btn sm primary" href="/new">+ Add</a><button type="button" class="btn sm ghost" data-signout>Sign out</button>`
    : '';
}

async function start() {
  await initAuth();
  renderNav();
  onAuthChange(renderNav); // sign-in/out views navigate themselves

  document.getElementById('nav').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-signout]')) return;
    await signOut();
    navigate('/');
  });

  route('/', guard(gridView));
  route('/show/:slug', guard(showView));
  route('/show/:slug/edit', guard(editView));
  route('/actor/:slug', guard(actorView));
  route('/new', guard(editView));
  route('/login', guard(loginView));
  setNotFound(() => notFound(app));
  startRouter();
}
