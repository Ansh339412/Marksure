import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env.js';

let supabaseAdminInstance: SupabaseClient | null = null;

/**
 * Returns the server-side Supabase client initialized with the secret/service key.
 * Never expose this key or client to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase URL is not configured yet. Set SUPABASE_URL in server/.env (e.g. https://<project-ref>.supabase.co).'
    );
  }
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdminInstance;
}
