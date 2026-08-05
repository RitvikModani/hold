import { describe, it, expect } from 'vitest'
import type { PoolVideo } from '../src/lib/types'
import {
  channelRecords,
  describeRecord,
  matchesGenres,
  videoWeight,
  weightedSample,
} from '../src/lib/taste'
import { rep } from './factory'

function video(over: Partial<PoolVideo> = {}): PoolVideo {
  return {
    videoId: 'v1',
    durationSec: 60,
    title: 'a video',
    channelTitle: 'Test Channel',
    channelId: 'UC_A',
    publishedAt: '2026-01-15T00:00:00.000Z',
    tags: ['science'],
    ...over,
  }
}

const index = (videos: PoolVideo[]) => new Map(videos.map((v) => [v.videoId, v]))

describe('channelRecords', () => {
  it('separates videos held from videos merely attempted', () => {
    const videos = [video({ videoId: 'a' }), video({ videoId: 'b' }), video({ videoId: 'c' })]
    const reps = [
      rep({ videoId: 'a' }),
      rep({ videoId: 'b' }),
      rep({ videoId: 'c', watchedSec: 5, skippedAtSec: 5 }),
    ]
    const [record] = channelRecords(reps, index(videos))
    expect(record.attempts).toBe(3)
    expect(record.held).toBe(2)
  })

  it('never reports certainty from a single rep', () => {
    const videos = [video({ videoId: 'a' })]
    const [record] = channelRecords([rep({ videoId: 'a' })], index(videos))
    expect(record.rate).toBeGreaterThan(0.5)
    expect(record.rate).toBeLessThan(1)
  })

  it('ignores reps whose video is no longer in the pool', () => {
    expect(channelRecords([rep({ videoId: 'gone' })], index([video({ videoId: 'a' })]))).toEqual([])
  })

  it('ranks a reliably held channel above a reliably abandoned one', () => {
    const videos = [
      video({ videoId: 'g1', channelId: 'GOOD' }),
      video({ videoId: 'g2', channelId: 'GOOD' }),
      video({ videoId: 'g3', channelId: 'GOOD' }),
      video({ videoId: 'b1', channelId: 'BAD' }),
      video({ videoId: 'b2', channelId: 'BAD' }),
      video({ videoId: 'b3', channelId: 'BAD' }),
    ]
    const reps = [
      rep({ videoId: 'g1' }),
      rep({ videoId: 'g2' }),
      rep({ videoId: 'g3' }),
      rep({ videoId: 'b1', watchedSec: 3, skippedAtSec: 3 }),
      rep({ videoId: 'b2', watchedSec: 3, skippedAtSec: 3 }),
      rep({ videoId: 'b3', watchedSec: 3, skippedAtSec: 3 }),
    ]
    expect(channelRecords(reps, index(videos))[0].channelId).toBe('GOOD')
  })
})

describe('matchesGenres', () => {
  it('matches on any overlapping tag', () => {
    expect(matchesGenres(video({ tags: ['maths', 'science'] }), new Set(['science']))).toBe(true)
  })

  it('rejects a video sharing no tag', () => {
    expect(matchesGenres(video({ tags: ['maths'] }), new Set(['cooking']))).toBe(false)
  })

  it('keeps untagged videos eligible, so an old pool degrades rather than empties', () => {
    expect(matchesGenres(video({ tags: [] }), new Set(['science']))).toBe(true)
  })

  it('matches everything when nothing is chosen', () => {
    expect(matchesGenres(video({ tags: ['maths'] }), new Set())).toBe(true)
  })
})

describe('videoWeight', () => {
  const records = new Map([
    ['GOOD', { channelId: 'GOOD', channelTitle: 'g', held: 9, attempts: 10, rate: 0.85 }],
    ['BAD', { channelId: 'BAD', channelTitle: 'b', held: 1, attempts: 10, rate: 0.16 }],
  ])

  it('favours a channel you finish over one you abandon', () => {
    expect(videoWeight(video({ channelId: 'GOOD' }), records)).toBeGreaterThan(
      videoWeight(video({ channelId: 'BAD' }), records),
    )
  })

  it('leaves an unseen channel neutral rather than penalised', () => {
    expect(videoWeight(video({ channelId: 'NEW' }), records)).toBe(1)
  })

  it('never drops a channel to zero, so nothing is silently blacklisted', () => {
    expect(videoWeight(video({ channelId: 'BAD' }), records)).toBeGreaterThan(0)
  })

  it('heavily demotes a video outside the chosen genres without excluding it', () => {
    const opts = { genres: new Set(['maths']) }
    const off = videoWeight(video({ channelId: 'NEW', tags: ['cooking'] }), records, opts)
    const on = videoWeight(video({ channelId: 'NEW', tags: ['maths'] }), records, opts)
    expect(off).toBeGreaterThan(0)
    expect(on).toBeGreaterThan(off * 5)
  })
})

describe('weightedSample', () => {
  const rand = (seq: number[]) => {
    let i = 0
    return () => seq[i++ % seq.length]
  }

  it('never returns the same item twice', () => {
    const out = weightedSample(['a', 'b', 'c', 'd'], () => 1, 4, rand([0.1, 0.9, 0.4, 0.7]))
    expect(new Set(out).size).toBe(4)
  })

  it('returns everything available when asked for more than exists', () => {
    expect(weightedSample(['a', 'b'], () => 1, 5, rand([0.5])).length).toBe(2)
  })

  it('still fills the set when every weight is zero', () => {
    expect(weightedSample(['a', 'b', 'c'], () => 0, 2, rand([0.5]))).toHaveLength(2)
  })

  it('picks the heavy item far more often across many draws', () => {
    let seed = 0.123
    const pseudo = () => (seed = ((seed * 9301 + 49297) % 233280) / 233280)
    let heavyFirst = 0
    for (let i = 0; i < 300; i++) {
      const [first] = weightedSample(['heavy', 'light'], (x) => (x === 'heavy' ? 20 : 1), 1, pseudo)
      if (first === 'heavy') heavyFirst++
    }
    expect(heavyFirst).toBeGreaterThan(240)
  })

  it('handles an empty pool', () => {
    expect(weightedSample([], () => 1, 3)).toEqual([])
  })
})

describe('describeRecord', () => {
  it('admits when the evidence is thin', () => {
    expect(
      describeRecord({ channelId: 'x', channelTitle: 'x', held: 1, attempts: 1, rate: 0.6 }),
    ).toMatch(/only 1/)
  })

  it('states a strong hold rate plainly', () => {
    expect(
      describeRecord({ channelId: 'x', channelTitle: 'x', held: 8, attempts: 10, rate: 0.8 }),
    ).toMatch(/finish 80%/)
  })
})
