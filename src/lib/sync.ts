import type { Rep } from './types'
import { supabase } from './supabase'

/**
 * Merges two rep logs.
 *
 * Reps are immutable events with client-generated ids, so this is a set union —
 * there is no such thing as a conflicting edit, and nothing can be lost. The
 * result is sorted by time because the ladder replays the log in order, and a
 * merged history has to replay as the true combined history rather than as
 * either device's partial view of it.
 *
 * Ties break on id so two devices merging the same data independently always
 * land on identical output.
 */
export function mergeReps(a: Rep[], b: Rep[]): Rep[] {
  const byId = new Map<string, Rep>()
  for (const rep of a) byId.set(rep.id, rep)
  // Existing entries win: a rep already held locally is the one already
  // reflected in what the user has seen.
  for (const rep of b) if (!byId.has(rep.id)) byId.set(rep.id, rep)

  return [...byId.values()].sort((x, y) => {
    const t = Date.parse(x.at) - Date.parse(y.at)
    return t !== 0 ? t : x.id.localeCompare(y.id)
  })
}

/** Which of `local` the other side has never seen. */
export function unsynced(local: Rep[], remote: Rep[]): Rep[] {
  const known = new Set(remote.map((r) => r.id))
  return local.filter((r) => !known.has(r.id))
}

/* ----------------------------------------------------------------- transport */

interface Row {
  id: string
  user_id: string
  video_id: string
  rung_sec: number
  duration_sec: number
  watched_sec: number
  skipped_at_sec: number | null
  drift_events: Rep['driftEvents']
  recall_text: string
  recall_grade: number | null
  at: string
}

function toRow(rep: Rep, userId: string): Row {
  return {
    id: rep.id,
    user_id: userId,
    video_id: rep.videoId,
    rung_sec: rep.rungSec,
    duration_sec: rep.durationSec,
    watched_sec: rep.watchedSec,
    skipped_at_sec: rep.skippedAtSec,
    drift_events: rep.driftEvents,
    recall_text: rep.recallText,
    recall_grade: rep.recallGrade,
    at: rep.at,
  }
}

function fromRow(row: Row): Rep {
  return {
    id: row.id,
    videoId: row.video_id,
    rungSec: row.rung_sec,
    durationSec: row.duration_sec,
    watchedSec: row.watched_sec,
    skippedAtSec: row.skipped_at_sec,
    driftEvents: row.drift_events ?? [],
    recallText: row.recall_text ?? '',
    recallGrade: (row.recall_grade as Rep['recallGrade']) ?? null,
    at: new Date(row.at).toISOString(),
  }
}

export async function fetchRemote(userId: string): Promise<Rep[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('reps')
    .select('*')
    .eq('user_id', userId)
    .order('at', { ascending: true })
  if (error) throw error
  return (data as Row[]).map(fromRow)
}

/**
 * Uploads only what the server lacks, in chunks so one long history does not
 * become one enormous request. Upserting on the primary key makes a retry after
 * a half-finished push harmless.
 */
export async function pushReps(reps: Rep[], userId: string): Promise<number> {
  if (!supabase || reps.length === 0) return 0
  const CHUNK = 200
  let sent = 0
  for (let i = 0; i < reps.length; i += CHUNK) {
    const batch = reps.slice(i, i + CHUNK).map((r) => toRow(r, userId))
    const { error } = await supabase.from('reps').upsert(batch, { onConflict: 'id' })
    if (error) throw error
    sent += batch.length
  }
  return sent
}

export interface SyncResult {
  merged: Rep[]
  uploaded: number
  downloaded: number
}

/**
 * Full reconcile: pull everything, union it with local, push whatever was
 * missing upstream. Safe to run repeatedly — it converges and is idempotent.
 */
export async function syncAll(local: Rep[], userId: string): Promise<SyncResult> {
  const remote = await fetchRemote(userId)
  const toUpload = unsynced(local, remote)
  const uploaded = await pushReps(toUpload, userId)
  return {
    merged: mergeReps(local, remote),
    uploaded,
    downloaded: unsynced(remote, local).length,
  }
}
