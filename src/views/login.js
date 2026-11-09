import { signIn, isSignedIn } from '../auth.js';
import { navigate } from '../router.js';
import { setTitle } from '../lib/dom.js';

/** Only allow same-site paths as the post-login destination. */
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export function loginView(app, _params, query) {
  const next = safeNext(query.get('next'));
  if (isSignedIn()) return navigate(next, { replace: true });
  setTitle('Sign in');
  app.innerHTML = `
    <form class="auth block" novalidate>
      <h1>Sign in</h1>
      <p class="meta">Editing is for the owner only.</p>
      <label class="field">Email
        <input name="email" type="email" autocomplete="username" required inputmode="email" />
      </label>
      <label class="field">Password
        <input name="password" type="password" autocomplete="current-password" required />
      </label>
      <p class="error-msg" data-error role="alert"></p>
      <button class="btn primary" type="submit">Sign in</button>
    </form>`;
  const form = app.querySelector('form');
  const err = app.querySelector('[data-error]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(form));
    if (!email || !password) return (err.textContent = 'Enter your email and password.');
    const btn = form.querySelector('button');
    btn.disabled = true;
    err.textContent = '';
    try {
      await signIn(email.trim(), password);
      navigate(next, { replace: true });
    } catch (ex) {
      err.textContent = ex.message === 'Invalid login credentials' ? 'Wrong email or password.' : ex.message;
      btn.disabled = false;
    }
  });
}
