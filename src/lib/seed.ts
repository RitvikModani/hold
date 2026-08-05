import type { Rep } from './types'
import { MAX_RUNG_SEC, RUNGS } from './ladder'
import { replaceAll } from './store'

/**
 * Fills the log with a plausible history so the stats screens can be checked at
 * 0, 1 and 200 reps without waiting weeks for real data.
 *
 * Reached with `?seed=200` (or `?seed=0` to wipe). Deliberately not hidden
 * behind a dev-only flag — being able to demo the finished state on a phone is
 * worth more than the handful of bytes it costs.
 */
export function seedFromQueryString(): void {
  const raw = new URLSearchParams(window.location.search).get('seed')
  if (raw === null) return
  const n = Math.max(0, Math.min(500, Number(raw) || 0))
  replaceAll(synthesise(n))
  // Drop the parameter so a refresh does not regenerate a different history.
  window.history.replaceState({}, '', window.location.pathname)
}

function synthesise(count: number): Rep[] {
  const reps: Rep[] = []
  const now = Date.now()
  // Spread over roughly six weeks at five reps a day, improving as it goes.
  const days = Math.max(1, Math.ceil(count / 5))

  for (let i = 0; i < count; i++) {
    const dayIndex = Math.floor(i / 5)
    const progress = days === 1 ? 1 : dayIndex / (days - 1)
    const rungSec = RUNGS[Math.min(RUNGS.length - 1, Math.floor(progress * RUNGS.length))]
    // Clamped, because the harvest never admits anything past the cap. Without
    // this the demo history claims a ceiling above three minutes, which the
    // real app cannot produce.
    const durationSec = Math.min(MAX_RUNG_SEC, Math.round(rungSec * (0.9 + Math.random() * 0.2)))

    // Skipping and drifting both fall off as the weeks go by.
    const skipped = Math.random() < 0.35 * (1 - progress)
    const driftCount = Math.random() < 0.5 * (1 - progress) ? 1 : 0
    const bailAt = Math.round(durationSec * (0.1 + Math.random() * 0.5))
    const at = new Date(now - (days - 1 - dayIndex) * 86_400_000 + (i % 5) * 600_000)

    reps.push({
      id: `seed-${i}`,
      videoId: `seed-vid-${i}`,
      rungSec,
      durationSec,
      watchedSec: skipped ? bailAt : durationSec,
      skippedAtSec: skipped ? bailAt : null,
      driftEvents: Array.from({ length: driftCount }, () => ({
        atSec: Math.round(durationSec * Math.random()),
        durationSec: 2 + Math.round(Math.random() * 4),
      })),
      recallText: skipped ? '' : SAMPLE_RECALLS[i % SAMPLE_RECALLS.length],
      recallGrade: skipped ? null : ((1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3),
      at: at.toISOString(),
    })
  }
  return reps
}

const SAMPLE_RECALLS = [
  'argued that the bottleneck is heat dissipation, not transistor size',
  'showed why the bridge failed from resonance rather than load',
  'the point was that survivorship bias flips the obvious conclusion',
  'walked through why the map projection distorts area near the poles',
  'explained the delay as latency in the ground station, not the satellite',
  'claimed the cost curve fell because of manufacturing scale, not research',
]
