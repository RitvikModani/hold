import type { Pool, PoolVideo, Rep } from './types'
import { RUNGS, rungBand } from './ladder'
import { type ChannelRecord, channelRecords, videoWeight, weightedSample } from './taste'

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
export interface PickOptions {
  /** History, used to favour channels you actually finish. */
  reps?: Rep[]
  /** Genres the user chose. Empty means no preference. */
  genres?: string[]
}

export function pickForRung(
  pool: Pool,
  rungSec: number,
  exclude: Set<string>,
  count: number,
  options: PickOptions = {},
): PoolVideo[] {
  const start = RUNGS.indexOf(rungSec as (typeof RUNGS)[number])
  const order = start === -1 ? [rungSec] : orderByDistance(start)
  const taken: PoolVideo[] = []
  const used = new Set(exclude)

  const genres = new Set(options.genres ?? [])
  const records = options.reps?.length
    ? new Map<string, ChannelRecord>(
        channelRecords(options.reps, indexById(pool)).map((r) => [r.channelId, r]),
      )
    : new Map<string, ChannelRecord>()

  for (const rung of order) {
    if (taken.length >= count) break
    const candidates = (pool.rungs[String(rung)] ?? []).filter((v) => !used.has(v.videoId))
    if (candidates.length === 0) continue

    // Weighted rather than shuffled: chosen genres dominate, and channels you
    // finish come up more often — but nothing is ever excluded outright, so
    // the feed can still surprise you.
    for (const video of weightedSample(
      candidates,
      (v) => videoWeight(v, records, { genres }),
      count - taken.length,
    )) {
      used.add(video.videoId)
      taken.push(video)
    }
  }
  return taken
}

let indexCache: { pool: Pool; map: Map<string, PoolVideo> } | null = null

/** videoId -> video, so history can be attributed back to its channel. */
export function indexById(pool: Pool): Map<string, PoolVideo> {
  if (indexCache?.pool === pool) return indexCache.map
  const map = new Map(
    Object.values(pool.rungs)
      .flat()
      .map((v) => [v.videoId, v] as const),
  )
  indexCache = { pool, map }
  return map
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
