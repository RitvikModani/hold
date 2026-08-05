import type { Rep } from './types'

/**
 * The ladder. Nine rungs from 45 seconds to the three-minute cap.
 *
 * Spacing widens then narrows on purpose: the early jumps are small because
 * that is where quitting happens, and the last few are small because 165 -> 180
 * is much harder than the numbers suggest.
 */
export const RUNGS = [45, 60, 75, 90, 110, 130, 150, 165, 180] as const

/** Hard ceiling. The whole point is that this never grows. */
export const MAX_RUNG_SEC = 180

export const PROMOTE_AFTER = 3
export const DEMOTE_AFTER = 2

/** Share of the video that must be watched for the rep to count. */
export const COMPLETION_THRESHOLD = 0.95

/** Share of the video you may spend looking away before the rep is void. */
export const DRIFT_TOLERANCE = 0.1

/** Below this, you did not really answer. */
export const MIN_RECALL_CHARS = 15

export interface LadderState {
  rungIndex: number
  rungSec: number
  /** Distinct clean reps banked at this rung, 0..PROMOTE_AFTER. */
  towardPromotion: number
  /** Longest video ever finished, in seconds. The headline number. */
  ceilingSec: number
  atCeiling: boolean
}

export function totalDriftSec(rep: Rep): number {
  return rep.driftEvents.reduce((sum, d) => sum + d.durationSec, 0)
}

/**
 * A rep counts only if you watched it through, stayed with it, and could say
 * something about it afterwards. Any one of those failing makes the rep void —
 * there is no partial credit, because partial credit is how a training log
 * starts lying to you.
 */
export function isSuccess(rep: Rep): boolean {
  if (rep.skippedAtSec !== null) return false
  if (rep.watchedSec < rep.durationSec * COMPLETION_THRESHOLD) return false
  if (totalDriftSec(rep) > rep.durationSec * DRIFT_TOLERANCE) return false
  if (rep.recallText.trim().length < MIN_RECALL_CHARS) return false
  return true
}

/**
 * Acceptable video lengths for a rung: 15% either side, clamped to the cap.
 * Bands overlap deliberately so that no real video length falls in a gap
 * between two rungs and becomes unservable.
 */
export function rungBand(rungSec: number): [number, number] {
  const lower = Math.round(rungSec * 0.85)
  const upper = Math.min(Math.round(rungSec * 1.15), MAX_RUNG_SEC)
  return [lower, upper]
}

/**
 * Replays the entire log to derive the current rung.
 *
 * Deriving rather than storing means there is no separate "current rung" value
 * that can fall out of step with the history behind it — delete a rep, import a
 * backup, and the ladder simply recomputes.
 */
export function ladderState(reps: Rep[]): LadderState {
  const top = RUNGS.length - 1
  let index = 0
  let successRun = 0
  let failRun = 0
  let ceilingSec = 0
  // Distinct-video guard: rewatching one easy video three times is not three reps.
  let bankedAtRung = new Set<string>()

  for (const rep of reps) {
    if (isSuccess(rep)) {
      failRun = 0
      if (rep.durationSec > ceilingSec) ceilingSec = rep.durationSec
      if (!bankedAtRung.has(rep.videoId)) {
        bankedAtRung.add(rep.videoId)
        successRun += 1
      }
      if (successRun >= PROMOTE_AFTER && index < top) {
        index += 1
        successRun = 0
        bankedAtRung = new Set()
      }
    } else {
      successRun = 0
      bankedAtRung = new Set()
      failRun += 1
      if (failRun >= DEMOTE_AFTER && index > 0) {
        index -= 1
        failRun = 0
      }
    }
  }

  return {
    rungIndex: index,
    rungSec: RUNGS[index],
    towardPromotion: Math.min(successRun, PROMOTE_AFTER),
    ceilingSec,
    atCeiling: index === top,
  }
}
