/** A single lapse of attention away from the player. */
export interface DriftEvent {
  /** Playback position when attention left, in seconds. */
  atSec: number
  /** How long attention was away, in seconds. */
  durationSec: number
}

/**
 * One rep: a single video served, watched (or abandoned), and recalled.
 *
 * Deliberately stores only observed facts. Anything derivable — whether the rep
 * succeeded, which rung you were on, your streak — is computed from the log so
 * there is exactly one source of truth and no stored field can drift out of
 * sync with reality.
 */
export interface Rep {
  id: string
  videoId: string
  /** The rung target this rep was served for, in seconds. */
  rungSec: number
  /** True length of the video, in seconds. */
  durationSec: number
  /** Furthest playback position reached, in seconds. */
  watchedSec: number
  /** Playback position at which the user skipped, or null if never skipped. */
  skippedAtSec: number | null
  driftEvents: DriftEvent[]
  recallText: string
  recallGrade: RecallGrade | null
  /** ISO-8601 UTC. */
  at: string
}

/** 1 = missed it, 2 = got the gist, 3 = nailed it. */
export type RecallGrade = 1 | 2 | 3

export interface PoolVideo {
  videoId: string
  durationSec: number
  title: string
  channelTitle: string
  channelId: string
  publishedAt: string
}

export interface Pool {
  generatedAt: string
  /** Keyed by rung target in seconds, e.g. "45". */
  rungs: Record<string, PoolVideo[]>
}
