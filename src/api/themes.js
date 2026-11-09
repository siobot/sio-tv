import { supabase } from '../supabase.js';

export async function listThemes() {
  const { data, error } = await supabase.from('themes').select('id, name, slug').order('name');
  if (error) throw error;
  return data;
}
