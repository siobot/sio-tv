import { supabase } from '../supabase.js';
import { accessToken } from '../auth.js';

const FN = '/.netlify/functions/tmdb';
const BUCKET = 'covers';

async function callTmdb(params) {
  const r = await fetch(`${FN}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${accessToken()}` },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `TMDB lookup failed (${r.status})`);
  }
  return r;
}

export const searchTmdb = async (q) => (await callTmdb({ q })).json();
export const tmdbDetails = async (id) => (await callTmdb({ id })).json();
export const tmdbPoster = async (path) => (await callTmdb({ poster: path })).blob();

/** Every theme and actor name, for autocomplete. */
export async function listSuggestions() {
  const [t, a] = await Promise.all([
    supabase.from('themes').select('name').order('name'),
    supabase.from('actors').select('name, tmdb_person_id').order('name'),
  ]);
  if (t.error) throw t.error;
  if (a.error) throw a.error;
  return { themes: t.data.map((x) => x.name), actors: a.data };
}

/** Upload an image to the public covers bucket; returns its public URL. */
export async function uploadCover(blob, baseName) {
  const ext = { 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'jpg';
  const path = `${baseName || 'cover'}-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Delete a cover if it lives in our bucket (ignores external URLs). */
export async function removeCover(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url ? url.indexOf(marker) : -1;
  if (i < 0) return;
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
}

export async function saveShow(payload) {
  const { data, error } = await supabase.rpc('save_show', { p: payload });
  if (error) throw error;
  return data; // { id, slug }
}

export async function deleteShow(id) {
  const { error } = await supabase.rpc('delete_show', { p_id: id });
  if (error) throw error;
}
