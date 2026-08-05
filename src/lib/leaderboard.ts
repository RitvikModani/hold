import { supabase } from './supabase'
import type { Rep } from './types'
import { isSuccess } from './ladder'
import { currentStreakDays, focusCeilingSec, totalFocusedMinutes } from './stats'

export interface BoardRow {
  id: string
  display_name: string
  ceiling_sec: number
  clean_reps: number
  focused_minutes: number
  streak_days: number
}

export const MAX_NAME_LENGTH = 24

/**
 * What gets published. Aggregates only — no reps, no video ids, no recall text.
 * The board is world-readable, so nothing revealing what someone actually
 * watched or wrote is allowed to leave the device.
 */
export function deriveStanding(reps: Rep[], now: Date) {
  return {
    ceiling_sec: focusCeilingSec(reps),
    clean_reps: reps.filter(isSuccess).length,
    focused_minutes: totalFocusedMinutes(reps),
    streak_days: currentStreakDays(reps, now),
  }
}

/**
 * Ranked by ceiling, then by clean reps.
 *
 * Not by minutes watched: that would reward leaving a video running in a dead
 * tab, the exact behaviour the drift detector exists to catch. A ceiling needs
 * 95% watched, under 10% drift and a typed recall answer, so it cannot be
 * posted without having actually held the video.
 */
export async function fetchBoard(limit = 50): Promise<BoardRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, ceiling_sec, clean_reps, focused_minutes, streak_days')
    .order('ceiling_sec', { ascending: false })
    .order('clean_reps', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as BoardRow[]
}

export async function publishStanding(
  userId: string,
  displayName: string,
  reps: Rep[],
  now: Date,
): Promise<void> {
  if (!supabase) return
  const name = displayName.trim().slice(0, MAX_NAME_LENGTH) || 'anonymous'
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: name,
      ...deriveStanding(reps, now),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

/** Whether this user has ever published, and under what name. */
export async function fetchOwnProfile(userId: string): Promise<BoardRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, ceiling_sec, clean_reps, focused_minutes, streak_days')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as BoardRow) ?? null
}

export async function leaveBoard(userId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('profiles').delete().eq('id', userId)
  if (error) throw error
}
