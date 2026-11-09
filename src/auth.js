import { supabase } from './supabase.js';

let session = null;
const listeners = new Set();

/** Load the stored session once and keep it current. Signed in = owner (sign-ups are off). */
export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  session = data.session;
  supabase.auth.onAuthStateChange((_event, s) => {
    const changed = Boolean(s) !== Boolean(session);
    session = s;
    if (changed) listeners.forEach((fn) => fn(session));
  });
}

export const isSignedIn = () => Boolean(session);
export const accessToken = () => session?.access_token ?? '';
export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
