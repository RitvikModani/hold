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

/**
 * Supabase rejects with plain objects carrying `message`/`hint`/`code`, not
 * Error instances — so an `err instanceof Error` check silently discards the
 * only useful part and leaves the user staring at a generic failure. This digs
 * the real reason out, and translates the failures people actually hit.
 */
export function describeError(err: unknown): string {
  const e = err as { message?: string; hint?: string; code?: string } | null
  const raw = (e?.message ?? '').trim()

  if (!raw) return 'no reason given by the server'
  // 42P01: relation does not exist — the schema was never run.
  if (e?.code === '42P01' || /relation .* does not exist/i.test(raw)) {
    return 'that table does not exist yet — run supabase/schema.sql in the SQL editor'
  }
  if (/JWT|not authenticated|invalid claim/i.test(raw)) {
    return 'your session expired — sign out and back in'
  }
  if (/Failed to fetch|NetworkError/i.test(raw)) {
    return 'could not reach Supabase — check your connection and the project URL'
  }
  return e?.hint ? `${raw} (${e.hint})` : raw
}
