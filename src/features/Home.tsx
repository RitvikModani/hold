import { Suspense, lazy, useMemo, useState } from 'react'
import { PROMOTE_AFTER, RUNGS, ladderState } from '../lib/ladder'
import { currentStreakDays, driftRatePerMin, totalFocusedMinutes } from '../lib/stats'
import { load } from '../lib/store'
import { Button, fmtDuration } from '../components/ui'
import { GenrePicker } from './Topics'

// Lazy so the Supabase client stays out of the entry chunk. This is one
// optional line of text; it is not worth 54 kB on first load.
const SyncNudge = lazy(() => import('./Sync').then((m) => ({ default: m.SyncNudge })))

export function Home({ onStart }: { onStart: () => void }) {
  const state = useMemo(() => load(), [])
  const ladder = useMemo(() => ladderState(state.reps), [state.reps])
  const now = useMemo(() => new Date(), [])
  const streak = useMemo(() => currentStreakDays(state.reps, now), [state.reps, now])
  const minutes = useMemo(() => totalFocusedMinutes(state.reps), [state.reps])
  const drift = useMemo(() => driftRatePerMin(state.reps), [state.reps])
  const fresh = state.reps.length === 0
  const [genreRev, setGenreRev] = useState(0)
  const genres = useMemo(() => load().genres, [genreRev])
  const needsGenres = genres.length === 0

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 lg:px-10 lg:py-16">
      <div className="rise">
        <div className="label">today&rsquo;s rung</div>
        {/* The one amber number on this screen. Everything else is ink. */}
        <div className="display mt-3 text-[5.5rem] sm:text-[7rem]">
          {fmtDuration(ladder.rungSec)}
        </div>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
          {fresh
            ? 'Five videos, forty-five seconds each. Watch one through, then say what it was about — from memory. That second part is the training.'
            : ladder.atCeiling
              ? 'Top of the ladder. Three minutes, held on purpose, as often as you like.'
              : `Five videos at this length. ${PROMOTE_AFTER - ladder.towardPromotion} more clean and the rung goes up.`}
        </p>
      </div>

      <div className="rise mt-10" style={{ animationDelay: '60ms' }}>
        <Ladder index={ladder.rungIndex} banked={ladder.towardPromotion} />
      </div>

      {/* Asked once, up front, before the first session — so the very first
          reel is already something you said you wanted. */}
      {needsGenres && (
        <div className="rise mt-10 max-w-xl" style={{ animationDelay: '100ms' }}>
          <GenrePicker onSaved={() => setGenreRev((r) => r + 1)} />
        </div>
      )}

      <div className="rise mt-10 max-w-md" style={{ animationDelay: '120ms' }}>
        <Button variant="primary" full onClick={onStart}>
          {fresh ? 'Start your first session' : 'Start session'}
        </Button>
        {!needsGenres && (
          <div className="mt-4">
            <GenrePicker compact onSaved={() => setGenreRev((r) => r + 1)} />
          </div>
        )}
        <Suspense fallback={null}>
          <div className="mt-3">
            <SyncNudge repCount={state.reps.length} streakDays={streak} />
          </div>
        </Suspense>
      </div>

      {!fresh && (
        <div
          className="rise mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4"
          style={{ animationDelay: '180ms' }}
        >
          <Mini label="ceiling" value={ladder.ceilingSec ? fmtDuration(ladder.ceilingSec) : '—'} />
          <Mini label="streak" value={streak ? String(streak) : '—'} unit={streak ? 'days' : ''} />
          <Mini label="held" value={String(minutes)} unit="min" />
          <Mini label="drift" value={drift.toFixed(2)} unit="/min" />
        </div>
      )}
    </div>
  )
}

/** The ladder as an object: where you are, and what is still above you. */
function Ladder({ index, banked }: { index: number; banked: number }) {
  return (
    <div>
      <div className="flex items-end gap-2">
        {RUNGS.map((sec, i) => {
          const done = i < index
          const here = i === index
          return (
            <div key={sec} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-full transition-all duration-500"
                title={`${sec}s`}
                style={{
                  height: `${10 + i * 6}px`,
                  background: done
                    ? 'var(--color-amber-dim)'
                    : here
                      ? 'var(--color-amber)'
                      : 'var(--color-line)',
                }}
              />
              {here && (
                <div className="flex gap-1">
                  {Array.from({ length: PROMOTE_AFTER }, (_, k) => (
                    <span
                      key={k}
                      className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
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
      <div className="label mt-4">
        {RUNGS[0]}s &rarr; {RUNGS[RUNGS.length - 1]}s
      </div>
    </div>
  )
}

function Mini({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="card card-hover px-4 py-4">
      <div className="label">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-2xl">{value}</span>
        {unit && <span className="text-[11px] text-[var(--color-ink-faint)]">{unit}</span>}
      </div>
    </div>
  )
}
