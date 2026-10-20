// The one Supabase client. Only the project URL and the public key are used here.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    if (!url || !key) throw new Error('Supabase settings are missing');
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export const SCREENSHOTS = 'screenshots';
