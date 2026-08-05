import { Suspense, lazy, useMemo } from 'react'
import { PROMOTE_AFTER, RUNGS, ladderState } from '../lib/ladder'
import { currentStreakDays, driftRatePerMin, totalFocusedMinutes } from '../lib/stats'
import { load } from '../lib/store'
import { Button, Screen, fmtDuration } from '../components/ui'
// Lazy so the Supabase client stays out of the entry chunk. This is one
// optional line of text on the home screen; it is not worth 55 kB on first load.
const SyncNudge = lazy(() => import('./Sync').then((m) => ({ default: m.SyncNudge })))

export function Home({
  onStart,
  onStats,
  onBoard,
}: {
  onStart: () => void
  onStats: () => void
  onBoard: () => void
}) {
  const state = useMemo(() => load(), [])
  const ladder = useMemo(() => ladderState(state.reps), [state.reps])
  const now = useMemo(() => new Date(), [])
  const streak = useMemo(() => currentStreakDays(state.reps, now), [state.reps, now])
  const minutes = useMemo(() => totalFocusedMinutes(state.reps), [state.reps])
  const drift = useMemo(() => driftRatePerMin(state.reps), [state.reps])

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        {/* Left on a laptop, top on a phone: the one number that says what today asks of you. */}
        <div className="space-y-8">
          <div className="rise">
            <div className="label">today&rsquo;s rung</div>
            <div className="tnum mt-1 text-7xl leading-none tracking-tight text-[var(--color-amber)] lg:text-8xl">
              {fmtDuration(ladder.rungSec)}
            </div>
            <p className="mt-4 max-w-[22rem] text-sm leading-relaxed text-[var(--color-ink-dim)]">
              {ladder.atCeiling
                ? 'Top of the ladder. Three minutes, held on purpose, as often as you like.'
                : `Five videos at this length. ${PROMOTE_AFTER - ladder.towardPromotion} more clean and the rung goes up.`}
            </p>
          </div>

          <Ladder index={ladder.rungIndex} banked={ladder.towardPromotion} />

          <div className="rise space-y-3" style={{ animationDelay: '160ms' }}>
            <Button variant="primary" full onClick={onStart}>
              Start session
            </Button>
            <div className="flex gap-2">
              <Button full onClick={onStats}>
                Stats
              </Button>
              <Button full onClick={onBoard}>
                Leaderboard
              </Button>
            </div>
            <Suspense fallback={null}>
              <SyncNudge repCount={state.reps.length} streakDays={streak} />
            </Suspense>
          </div>
        </div>

        {/* Right on a laptop only. Uses the space the phone layout does not have,
            rather than stretching one column across a wide screen. */}
        <div className="rise grid grid-cols-2 gap-3" style={{ animationDelay: '100ms' }}>
          <Mini label="ceiling" value={ladder.ceilingSec ? fmtDuration(ladder.ceilingSec) : '—'} />
          <Mini label="streak" value={streak ? `${streak}d` : '—'} />
          <Mini
            label="held"
            value={minutes ? String(minutes) : '—'}
            unit={minutes ? 'min' : undefined}
          />
          <Mini
            label="drift"
            value={state.reps.length ? drift.toFixed(2) : '—'}
            unit={state.reps.length ? '/min' : undefined}
          />
        </div>
      </div>
    </Screen>
  )
}

/** The ladder as an object: where you are, and what is still above you. */
function Ladder({ index, banked }: { index: number; banked: number }) {
  return (
    <div className="rise flex items-end gap-1.5" style={{ animationDelay: '60ms' }}>
      {RUNGS.map((sec, i) => {
        const done = i < index
        const here = i === index
        return (
          <div key={sec} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className="w-full rounded-sm transition-all duration-300"
              title={`${sec}s`}
              style={{
                height: `${14 + i * 5}px`,
                background: done
                  ? 'var(--color-amber-dim)'
                  : here
                    ? 'var(--color-amber)'
                    : 'var(--color-line)',
              }}
            />
            {here && (
              <div className="flex gap-0.5">
                {Array.from({ length: PROMOTE_AFTER }, (_, k) => (
                  <span
                    key={k}
                    className="h-1 w-1 rounded-full transition-colors"
                    style={{
                      background: k < banked ? 'var(--color-amber)' : 'var(--color-line-bright)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Mini({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="panel hairline rounded-xl px-4 py-3.5 transition-colors duration-200 hover:border-[var(--color-line-bright)]">
      <div className="label">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tnum text-2xl lg:text-3xl">{value}</span>
        {unit && <span className="tnum text-xs text-[var(--color-ink-faint)]">{unit}</span>}
      </div>
    </div>
  )
}
