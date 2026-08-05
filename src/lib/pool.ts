import type { Pool, PoolVideo } from './types'
import { RUNGS, rungBand } from './ladder'

export class PoolMissingError extends Error {
  constructor() {
    super('No content pool. Run: npm run harvest')
    this.name = 'PoolMissingError'
  }
}

let cached: Pool | null = null

export async function loadPool(): Promise<Pool> {
  if (cached) return cached
  let res: Response
  try {
    res = await fetch(`${import.meta.env.BASE_URL}content/pool.json`, { cache: 'no-cache' })
  } catch {
    throw new PoolMissingError()
  }
  if (!res.ok) throw new PoolMissingError()
  const pool = (await res.json()) as Pool
  if (!pool?.rungs || Object.keys(pool.rungs).length === 0) throw new PoolMissingError()
  cached = pool
  return pool
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The rung itself first, then its nearest neighbours, widening outward. */
function orderByDistance(start: number): number[] {
  const order: number[] = [RUNGS[start]]
  for (let d = 1; d < RUNGS.length; d++) {
    if (start - d >= 0) order.push(RUNGS[start - d])
    if (start + d < RUNGS.length) order.push(RUNGS[start + d])
  }
  return order
}

/**
 * Picks `count` unseen videos for a rung.
 *
 * If the exact rung runs dry it widens outward to neighbouring rungs rather
 * than repeating a video. A slightly-off duration is a much smaller lie than
 * serving something already watched, which would break both the distinct-video
 * promotion rule and any belief in the ceiling number.
 */
export function pickForRung(
  pool: Pool,
  rungSec: number,
  exclude: Set<string>,
  count: number,
): PoolVideo[] {
  const start = RUNGS.indexOf(rungSec as (typeof RUNGS)[number])
  const order = start === -1 ? [rungSec] : orderByDistance(start)
  const taken: PoolVideo[] = []
  const used = new Set(exclude)

  for (const rung of order) {
    if (taken.length >= count) break
    const bucket = pool.rungs[String(rung)] ?? []
    for (const video of shuffle(bucket)) {
      if (taken.length >= count) break
      if (used.has(video.videoId)) continue
      used.add(video.videoId)
      taken.push(video)
    }
  }
  return taken
}

/** How much unseen material is left at a rung — drives the low-pool warning. */
export function remainingAtRung(pool: Pool, rungSec: number, exclude: Set<string>): number {
  const [lo, hi] = rungBand(rungSec)
  return (pool.rungs[String(rungSec)] ?? []).filter(
    (v) => !exclude.has(v.videoId) && v.durationSec >= lo && v.durationSec <= hi,
  ).length
}

export function poolSize(pool: Pool): number {
  return new Set(
    Object.values(pool.rungs)
      .flat()
      .map((v) => v.videoId),
  ).size
}
