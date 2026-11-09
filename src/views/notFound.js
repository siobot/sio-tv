import { setTitle } from '../lib/dom.js';

export function notFound(app) {
  setTitle('Not found');
  app.innerHTML = `
    <div class="status">
      <h1>Not found</h1>
      <p><a href="/">Back to all shows</a></p>
    </div>`;
}
