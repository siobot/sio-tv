import { supabase } from '../supabase.js';

/** Actor with every show of theirs in the catalog, or null. */
export async function getActor(slug) {
  const { data, error } = await supabase
    .from('actors')
    .select('id, name, slug, show_actors(character, shows(id, slug, title, year_start, year_end, cover_url, rating, owned))')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    shows: data.show_actors
      .map((sa) => ({ ...sa.shows, character: sa.character }))
      .sort((a, b) => (a.year_start ?? 0) - (b.year_start ?? 0) || a.title.localeCompare(b.title)),
  };
}
