import type { Rep } from '../src/lib/types'

let seq = 0

/**
 * Builds a rep that succeeds by default. Override fields to make it fail in a
 * specific way — that keeps each test's intent visible in its overrides.
 */
export function rep(over: Partial<Rep> = {}): Rep {
  seq += 1
  const durationSec = over.durationSec ?? 60
  return {
    id: `rep-${seq}`,
    videoId: `vid-${seq}`,
    rungSec: 60,
    durationSec,
    watchedSec: durationSec,
    skippedAtSec: null,
    driftEvents: [],
    recallText: 'the presenter argued that attention is trainable',
    recallGrade: 2,
    at: '2026-08-04T12:00:00.000Z',
    ...over,
  }
}

/** n reps that all succeed. */
export function successes(n: number, over: Partial<Rep> = {}): Rep[] {
  return Array.from({ length: n }, () => rep(over))
}

/** n reps that all fail, by skipping almost immediately. */
export function failures(n: number, over: Partial<Rep> = {}): Rep[] {
  return Array.from({ length: n }, () => rep({ watchedSec: 3, skippedAtSec: 3, ...over }))
}

/** ISO timestamp `daysAgo` days before `from`, at midday local time. */
export function daysBefore(from: Date, daysAgo: number): string {
  const d = new Date(from)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}
