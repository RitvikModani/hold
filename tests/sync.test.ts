import { describe, it, expect } from 'vitest'
import { mergeReps, unsynced } from '../src/lib/sync'
import { rep } from './factory'

const at = (iso: string) => ({ at: iso })

describe('mergeReps', () => {
  it('unions both sides without duplicating shared reps', () => {
    const shared = rep({ id: 'shared' })
    const merged = mergeReps([shared, rep({ id: 'a' })], [shared, rep({ id: 'b' })])
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b', 'shared'])
  })

  it('orders by time, because the ladder replays the log in order', () => {
    const merged = mergeReps(
      [rep({ id: 'phone', ...at('2026-08-02T10:00:00.000Z') })],
      [
        rep({ id: 'laptop-late', ...at('2026-08-03T10:00:00.000Z') }),
        rep({ id: 'laptop-early', ...at('2026-08-01T10:00:00.000Z') }),
      ],
    )
    expect(merged.map((r) => r.id)).toEqual(['laptop-early', 'phone', 'laptop-late'])
  })

  it('keeps the local copy when both sides hold the same id', () => {
    const merged = mergeReps(
      [rep({ id: 'x', recallText: 'what I actually wrote at the time' })],
      [rep({ id: 'x', recallText: 'stale server copy' })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].recallText).toBe('what I actually wrote at the time')
  })

  it('is idempotent — syncing twice changes nothing', () => {
    const a = [rep({ id: 'a' })]
    const b = [rep({ id: 'b' })]
    const once = mergeReps(a, b)
    expect(mergeReps(once, b)).toEqual(once)
  })

  it('is order-independent, so two devices converge on identical output', () => {
    const a = [rep({ id: 'a', ...at('2026-08-01T10:00:00.000Z') })]
    const b = [rep({ id: 'b', ...at('2026-08-02T10:00:00.000Z') })]
    expect(mergeReps(a, b)).toEqual(mergeReps(b, a))
  })

  it('breaks identical timestamps deterministically', () => {
    const same = '2026-08-01T10:00:00.000Z'
    const merged = mergeReps([rep({ id: 'zzz', ...at(same) })], [rep({ id: 'aaa', ...at(same) })])
    expect(merged.map((r) => r.id)).toEqual(['aaa', 'zzz'])
  })

  it('handles either side being empty', () => {
    const one = [rep({ id: 'only' })]
    expect(mergeReps(one, [])).toHaveLength(1)
    expect(mergeReps([], one)).toHaveLength(1)
    expect(mergeReps([], [])).toEqual([])
  })
})

describe('unsynced', () => {
  it('returns only what the other side has never seen', () => {
    const result = unsynced([rep({ id: 'a' }), rep({ id: 'b' })], [rep({ id: 'a' })])
    expect(result.map((r) => r.id)).toEqual(['b'])
  })

  it('returns nothing when the server is already ahead', () => {
    expect(unsynced([rep({ id: 'a' })], [rep({ id: 'a' }), rep({ id: 'b' })])).toEqual([])
  })
})
