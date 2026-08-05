import { useMemo } from 'react'
import { PROMOTE_AFTER, RUNGS, ladderState } from '../lib/ladder'
import { currentStreakDays } from '../lib/stats'
import { load } from '../lib/store'
import { Button, Screen, fmtDuration } from '../components/ui'
import { SyncNudge } from './Sync'

export function Home({ onStart, onStats }: { onStart: () => void; onStats: () => void }) {
  const state = useMemo(() => load(), [])
  const ladder = useMemo(() => ladderState(state.reps), [state.reps])
  const streak = useMemo(() => currentStreakDays(state.reps, new Date()), [state.reps])

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-10">
        <div className="rise">
          <div className="label">today&rsquo;s rung</div>
          <div className="tnum mt-1 text-7xl leading-none text-[var(--color-amber)]">
            {fmtDuration(ladder.rungSec)}
          </div>
          <p className="mt-3 max-w-[18rem] text-sm text-[var(--color-ink-dim)]">
            {ladder.atCeiling
              ? 'Top of the ladder. Three minutes, held on purpose, as often as you like.'
              : `Five videos at this length. ${PROMOTE_AFTER - ladder.towardPromotion} more clean and the rung goes up.`}
          </p>
        </div>

        <Ladder index={ladder.rungIndex} banked={ladder.towardPromotion} />

        <div className="rise grid grid-cols-2 gap-3" style={{ animationDelay: '100ms' }}>
          <Mini label="ceiling" value={ladder.ceilingSec ? fmtDuration(ladder.ceilingSec) : '—'} />
          <Mini label="streak" value={streak ? `${streak}d` : '—'} />
        </div>

        <div className="rise space-y-3" style={{ animationDelay: '160ms' }}>
          <Button variant="primary" full onClick={onStart}>
            Start session
          </Button>
          <Button variant="quiet" full onClick={onStats}>
            Stats
          </Button>
          <SyncNudge repCount={state.reps.length} streakDays={streak} />
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
              className="w-full rounded-sm transition-all"
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
                    className="h-1 w-1 rounded-full"
                    style={{ background: k < banked ? 'var(--color-amber)' : 'var(--color-line-bright)' }}
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel hairline rounded-lg px-4 py-3">
      <div className="label">{label}</div>
      <div className="tnum mt-1 text-2xl">{value}</div>
    </div>
  )
}
