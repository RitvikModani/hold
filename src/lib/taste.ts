import type { PoolVideo, Rep } from './types'
import { isSuccess } from './ladder'

/**
 * Feed personalisation.
 *
 * Two layers, deliberately in this order:
 *
 *  1. Genres you pick yourself. A hard preference — you said what you came
 *     for, and the feed should respect that rather than second-guess it.
 *  2. Within those genres, channels you actually *finish* are favoured.
 *
 * That second signal is completion, not engagement. Every recommender you have
 * used optimises for what holds your thumb; this one optimises for what you
 * watch to the end without drifting and can describe afterwards. Only one of
 * those is aligned with training attention.
 *
 * Everything is a pure function of the log, so the feed can explain itself and
 * no hidden profile accumulates anywhere.
 */

export const MIN_GENRES = 3
export const MAX_GENRES = 4

export interface ChannelRecord {
  channelId: string
  channelTitle: string
  held: number
  attempts: number
  /** Laplace-smoothed hold rate. Never 0 or 1 on thin evidence. */
  rate: number
}

/** Pseudo-count either side, so one lucky rep cannot mint a favourite. */
const PRIOR = 2

export function channelRecords(reps: Rep[], byId: Map<string, PoolVideo>): ChannelRecord[] {
  const acc = new Map<string, { title: string; held: number; attempts: number }>()

  for (const rep of reps) {
    const video = byId.get(rep.videoId)
    if (!video) continue
    const row = acc.get(video.channelId) ?? { title: video.channelTitle, held: 0, attempts: 0 }
    row.attempts += 1
    if (isSuccess(rep)) row.held += 1
    acc.set(video.channelId, row)
  }

  return [...acc.entries()]
    .map(([channelId, r]) => ({
      channelId,
      channelTitle: r.title,
      held: r.held,
      attempts: r.attempts,
      rate: (r.held + PRIOR / 2) / (r.attempts + PRIOR),
    }))
    .sort((a, b) => b.rate - a.rate || b.attempts - a.attempts)
}

/** True when the video carries at least one of the chosen genres. */
export function matchesGenres(video: PoolVideo, genres: Set<string>): boolean {
  if (genres.size === 0) return true
  const tags = video.tags ?? []
  // Untagged videos stay eligible. A pool harvested before tags existed should
  // degrade to "no personalisation", never to an empty feed.
  if (tags.length === 0) return true
  return tags.some((tag) => genres.has(tag))
}

export interface TasteOptions {
  genres?: Set<string>
  /**
   * How hard the completion weighting bites, 0..1. Never 1: a feed that only
   * serves proven winners stops finding anything new, and the pool is the only
   * place a higher ceiling can come from.
   */
  strength?: number
}

/**
 * Relative weight for one video. Unknown channels sit at 1 — neutral, not
 * penalised, so unseen material always has a real chance of being served.
 */
export function videoWeight(
  video: PoolVideo,
  records: Map<string, ChannelRecord>,
  options: TasteOptions = {},
): number {
  const { genres, strength = 0.6 } = options
  const base = genres && genres.size > 0 && !matchesGenres(video, genres) ? 0.12 : 1

  const record = records.get(video.channelId)
  if (!record) return base

  // rate sits in (0,1); 0.5 means "no evidence either way".
  const lift = record.rate / 0.5
  return Math.max(0.15, base * (1 + (lift - 1) * strength))
}

/**
 * Weighted sample without replacement.
 *
 * `random` is injected rather than called directly so selection is
 * reproducible under test — a recommender you cannot pin down is one you
 * cannot check for bias.
 */
export function weightedSample<T>(
  items: T[],
  weightOf: (item: T) => number,
  count: number,
  random: () => number = Math.random,
): T[] {
  const pool = items.map((item) => ({ item, weight: Math.max(0, weightOf(item)) }))
  const picked: T[] = []

  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    if (total <= 0) {
      // Everything left is zero-weighted; fall back to order so the session
      // still fills rather than coming up short.
      picked.push(...pool.splice(0, count - picked.length).map((e) => e.item))
      break
    }
    let threshold = random() * total
    let index = pool.findIndex((entry) => (threshold -= entry.weight) < 0)
    if (index < 0) index = pool.length - 1
    picked.push(pool[index].item)
    pool.splice(index, 1)
  }

  return picked
}

/** Plain-language reason a channel is being favoured or avoided. */
export function describeRecord(record: ChannelRecord): string {
  if (record.attempts < 3) return `only ${record.attempts} so far`
  const pct = Math.round((record.held / record.attempts) * 100)
  if (pct >= 70) return `you finish ${pct}% of these`
  if (pct <= 30) return `you bail on ${100 - pct}% of these`
  return `${pct}% finished`
}
