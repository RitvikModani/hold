import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Sync is optional. With no credentials configured the client is null and the
 * whole feature simply does not appear — the app runs exactly as it did before,
 * on localStorage alone. Anyone cloning this repo gets a working app without
 * having to stand up a backend first.
 *
 * The anon key is meant to be public. Row-level security in supabase/schema.sql
 * is what protects the data, not the secrecy of this string.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // PKCE, never a client secret. Anything bundled into a static site is
          // readable by anyone who opens devtools; the Google client secret
          // lives in Supabase's server-side config and never comes near here.
          flowType: 'pkce',
        },
      })
    : null

export const syncAvailable = supabase !== null
