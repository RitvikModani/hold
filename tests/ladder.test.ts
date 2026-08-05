import { describe, it, expect } from 'vitest'
import {
  RUNGS,
  PROMOTE_AFTER,
  DEMOTE_AFTER,
  isSuccess,
  totalDriftSec,
  rungBand,
  ladderState,
} from '../src/lib/ladder'
import { rep, successes, failures } from './factory'

describe('isSuccess', () => {
  it('accepts a fully watched, undistracted, recalled rep', () => {
    expect(isSuccess(rep())).toBe(true)
  })

  it('accepts a rep watched to exactly the 95% threshold', () => {
    expect(isSuccess(rep({ durationSec: 100, watchedSec: 95 }))).toBe(true)
  })

  it('rejects a rep watched to just under the threshold', () => {
    expect(isSuccess(rep({ durationSec: 100, watchedSec: 94.9 }))).toBe(false)
  })

  it('rejects any skipped rep, even one skipped near the end', () => {
    expect(isSuccess(rep({ durationSec: 100, watchedSec: 99, skippedAtSec: 99 }))).toBe(false)
  })

  it('rejects a rep whose drift exceeds 10% of the video', () => {
    const drifted = rep({
      durationSec: 100,
      driftEvents: [{ atSec: 20, durationSec: 6 }, { atSec: 50, durationSec: 5 }],
    })
    expect(totalDriftSec(drifted)).toBe(11)
    expect(isSuccess(drifted)).toBe(false)
  })

  it('tolerates drift at exactly 10%', () => {
    const drifted = rep({ durationSec: 100, driftEvents: [{ atSec: 20, durationSec: 10 }] })
    expect(isSuccess(drifted)).toBe(true)
  })

  it('rejects a rep with no real recall answer', () => {
    expect(isSuccess(rep({ recallText: '' }))).toBe(false)
    expect(isSuccess(rep({ recallText: '   idk   ' }))).toBe(false)
  })
})

describe('rungBand', () => {
  it('spans 15% either side of the target', () => {
    expect(rungBand(100)).toEqual([85, 115])
  })

  it('produces overlapping bands so no duration falls between rungs', () => {
    for (let i = 0; i < RUNGS.length - 1; i++) {
      const [, upper] = rungBand(RUNGS[i])
      const [lowerNext] = rungBand(RUNGS[i + 1])
      expect(upper).toBeGreaterThanOrEqual(lowerNext)
    }
  })
})

describe('ladderState', () => {
  it('starts on the first rung with an empty log', () => {
    const s = ladderState([])
    expect(s.rungIndex).toBe(0)
    expect(s.rungSec).toBe(RUNGS[0])
    expect(s.towardPromotion).toBe(0)
    expect(s.ceilingSec).toBe(0)
  })

  it('promotes after three consecutive successes', () => {
    expect(ladderState(successes(PROMOTE_AFTER)).rungIndex).toBe(1)
  })

  it('does not promote on two successes', () => {
    const s = ladderState(successes(2))
    expect(s.rungIndex).toBe(0)
    expect(s.towardPromotion).toBe(2)
  })

  it('resets progress toward promotion after a single failure', () => {
    const s = ladderState([...successes(2), ...failures(1)])
    expect(s.rungIndex).toBe(0)
    expect(s.towardPromotion).toBe(0)
  })

  it('counts a repeated video only once toward promotion', () => {
    const s = ladderState([
      rep({ videoId: 'same' }),
      rep({ videoId: 'same' }),
      rep({ videoId: 'same' }),
    ])
    expect(s.rungIndex).toBe(0)
    expect(s.towardPromotion).toBe(1)
  })

  it('climbs several rungs across a long clean run', () => {
    expect(ladderState(successes(PROMOTE_AFTER * 3)).rungIndex).toBe(3)
  })

  it('survives a single bad rep without demoting', () => {
    const s = ladderState([...successes(PROMOTE_AFTER), ...failures(1)])
    expect(s.rungIndex).toBe(1)
  })

  it('demotes one rung after two consecutive failures', () => {
    const s = ladderState([...successes(PROMOTE_AFTER), ...failures(DEMOTE_AFTER)])
    expect(s.rungIndex).toBe(0)
  })

  it('demotes only one rung at a time, not one per failure', () => {
    const s = ladderState([...successes(PROMOTE_AFTER * 2), ...failures(DEMOTE_AFTER)])
    expect(s.rungIndex).toBe(1)
  })

  it('never falls below the first rung', () => {
    expect(ladderState(failures(20)).rungIndex).toBe(0)
  })

  it('never climbs past the 180s cap the user asked for', () => {
    const s = ladderState(successes(PROMOTE_AFTER * RUNGS.length * 2))
    expect(s.rungIndex).toBe(RUNGS.length - 1)
    expect(s.rungSec).toBe(180)
    expect(s.atCeiling).toBe(true)
  })

  it('reports the longest video ever fully completed', () => {
    const s = ladderState([
      rep({ durationSec: 45 }),
      rep({ durationSec: 170, watchedSec: 20, skippedAtSec: 20 }),
      rep({ durationSec: 90 }),
    ])
    expect(s.ceilingSec).toBe(90)
  })

  it('is a pure replay — same log always yields the same state', () => {
    const log = [...successes(4), ...failures(2), ...successes(3)]
    expect(ladderState(log)).toEqual(ladderState(log))
  })
})
