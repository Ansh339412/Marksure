import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || '';

export const isFrontendSupabaseConfigured =
  Boolean(supabaseUrl) &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('YOUR_PROJECT_REF') &&
  Boolean(supabaseKey);

export const supabase: SupabaseClient | null = isFrontendSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;
