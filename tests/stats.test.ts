import { describe, it, expect } from 'vitest'
import {
  focusCeilingSec,
  driftRatePerMin,
  medianTimeToFirstSkipSec,
  currentStreakDays,
  totalFocusedMinutes,
  completionRate,
  meanRecallGrade,
  dailyFocusMinutes,
  ladderSeries,
} from '../src/lib/stats'
import { rep, successes, failures, daysBefore } from './factory'

const NOW = new Date('2026-08-04T18:00:00.000Z')

describe('empty log', () => {
  it('returns zeros and nulls rather than NaN', () => {
    expect(focusCeilingSec([])).toBe(0)
    expect(driftRatePerMin([])).toBe(0)
    expect(medianTimeToFirstSkipSec([])).toBeNull()
    expect(currentStreakDays([], NOW)).toBe(0)
    expect(totalFocusedMinutes([])).toBe(0)
    expect(completionRate([], 7, NOW)).toBe(0)
    expect(meanRecallGrade([])).toBeNull()
  })
})

describe('focusCeilingSec', () => {
  it('ignores videos that were not finished', () => {
    expect(
      focusCeilingSec([
        rep({ durationSec: 60 }),
        rep({ durationSec: 180, watchedSec: 30, skippedAtSec: 30 }),
      ]),
    ).toBe(60)
  })
})

describe('driftRatePerMin', () => {
  it('normalises drift events by minutes actually watched', () => {
    // 120s watched = 2 minutes, 3 drift events -> 1.5 per minute
    const reps = [
      rep({
        durationSec: 60,
        driftEvents: [{ atSec: 10, durationSec: 1 }, { atSec: 20, durationSec: 1 }],
      }),
      rep({ durationSec: 60, driftEvents: [{ atSec: 30, durationSec: 1 }] }),
    ]
    expect(driftRatePerMin(reps)).toBeCloseTo(1.5, 5)
  })

  it('counts watch time from skipped reps too — drifting then skipping still happened', () => {
    const reps = [
      rep({
        durationSec: 120,
        watchedSec: 60,
        skippedAtSec: 60,
        driftEvents: [{ atSec: 5, durationSec: 2 }],
      }),
    ]
    expect(driftRatePerMin(reps)).toBeCloseTo(1, 5)
  })
})

describe('medianTimeToFirstSkipSec', () => {
  it('takes the median of skip positions, ignoring completed reps', () => {
    const reps = [
      rep({ durationSec: 60 }),
      rep({ durationSec: 60, watchedSec: 10, skippedAtSec: 10 }),
      rep({ durationSec: 60, watchedSec: 30, skippedAtSec: 30 }),
      rep({ durationSec: 60, watchedSec: 50, skippedAtSec: 50 }),
    ]
    expect(medianTimeToFirstSkipSec(reps)).toBe(30)
  })

  it('averages the middle two on an even count', () => {
    const reps = [
      rep({ watchedSec: 10, skippedAtSec: 10 }),
      rep({ watchedSec: 20, skippedAtSec: 20 }),
      rep({ watchedSec: 30, skippedAtSec: 30 }),
      rep({ watchedSec: 40, skippedAtSec: 40 }),
    ]
    expect(medianTimeToFirstSkipSec(reps)).toBe(25)
  })
})

describe('currentStreakDays', () => {
  it('counts consecutive days ending today', () => {
    const reps = [0, 1, 2].map((d) => rep({ at: daysBefore(NOW, d) }))
    expect(currentStreakDays(reps, NOW)).toBe(3)
  })

  it('survives a session yesterday but none yet today', () => {
    const reps = [1, 2].map((d) => rep({ at: daysBefore(NOW, d) }))
    expect(currentStreakDays(reps, NOW)).toBe(2)
  })

  it('breaks on a missed day', () => {
    const reps = [0, 1, 3, 4].map((d) => rep({ at: daysBefore(NOW, d) }))
    expect(currentStreakDays(reps, NOW)).toBe(2)
  })

  it('ignores days that contain only failures', () => {
    const reps = [...failures(2, { at: daysBefore(NOW, 0) }), rep({ at: daysBefore(NOW, 1) })]
    expect(currentStreakDays(reps, NOW)).toBe(1)
  })

  it('is zero when the last success is too long ago', () => {
    expect(currentStreakDays([rep({ at: daysBefore(NOW, 3) })], NOW)).toBe(0)
  })

  it('counts several reps on one day once', () => {
    const reps = successes(5, { at: daysBefore(NOW, 0) })
    expect(currentStreakDays(reps, NOW)).toBe(1)
  })
})

describe('completionRate', () => {
  it('is the share of successful reps inside the window', () => {
    const reps = [
      ...successes(3, { at: daysBefore(NOW, 1) }),
      ...failures(1, { at: daysBefore(NOW, 2) }),
    ]
    expect(completionRate(reps, 7, NOW)).toBeCloseTo(0.75, 5)
  })

  it('excludes reps older than the window', () => {
    const reps = [
      ...successes(1, { at: daysBefore(NOW, 1) }),
      ...failures(9, { at: daysBefore(NOW, 30) }),
    ]
    expect(completionRate(reps, 7, NOW)).toBe(1)
  })
})

describe('totalFocusedMinutes', () => {
  it('sums watched time across every rep, skipped or not', () => {
    expect(
      totalFocusedMinutes([
        rep({ durationSec: 90 }),
        rep({ durationSec: 60, watchedSec: 30, skippedAtSec: 30 }),
      ]),
    ).toBe(2)
  })
})

describe('meanRecallGrade', () => {
  it('averages only graded reps', () => {
    const reps = [rep({ recallGrade: 3 }), rep({ recallGrade: 1 }), rep({ recallGrade: null })]
    expect(meanRecallGrade(reps)).toBe(2)
  })
})

describe('dailyFocusMinutes', () => {
  it('returns one entry per day in the window, oldest first, zero-filled', () => {
    const reps = [rep({ durationSec: 120, at: daysBefore(NOW, 2) })]
    const series = dailyFocusMinutes(reps, 7, NOW)
    expect(series).toHaveLength(7)
    expect(series[0].date < series[6].date).toBe(true)
    expect(series[4].minutes).toBe(2)
    expect(series[6].minutes).toBe(0)
  })
})

describe('ladderSeries', () => {
  it('emits one point per rep in log order for the staircase chart', () => {
    const reps = [rep({ durationSec: 45 }), ...failures(1, { durationSec: 60 })]
    const series = ladderSeries(reps)
    expect(series).toHaveLength(2)
    expect(series[0]).toMatchObject({ durationSec: 45, success: true })
    expect(series[1]).toMatchObject({ durationSec: 60, success: false })
  })
})
