import { supabase } from '../supabase.js';

/** All shows for the grid, with their theme ids. */
export async function listShows() {
  const { data, error } = await supabase
    .from('shows')
    .select('id, slug, title, year_start, year_end, cover_url, rating, owned, show_themes(theme_id)')
    .order('title');
  if (error) throw error;
  return data.map((s) => ({ ...s, themeIds: s.show_themes.map((t) => t.theme_id) }));
}

/** One show with cast and themes, or null. */
export async function getShow(slug) {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `*,
       show_actors(character, billing_order, actors(id, name, slug)),
       show_themes(themes(id, name, slug))`
    )
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    cast: data.show_actors
      .sort((a, b) => a.billing_order - b.billing_order)
      .map((sa) => ({ ...sa.actors, character: sa.character })),
    themes: data.show_themes.map((st) => st.themes).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Owner-only fields (RLS returns nothing for anyone else). */
export async function getPrivate(showId) {
  const { data, error } = await supabase.from('show_private').select('last_watched_at').eq('show_id', showId).maybeSingle();
  if (error) throw error;
  return data ?? { last_watched_at: null };
}
