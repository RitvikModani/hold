import { useMemo, useState } from 'react'
import { isSuccess, ladderState } from '../lib/ladder'
import { dailyFocusMinutes, driftSeries, ladderSeries, summarise } from '../lib/stats'
import { exportJson, load } from '../lib/store'
import { DayBars, DriftChart, Heatmap, LadderChart } from '../components/charts'
import { Button, Screen, StatTile, TopBar, fmtDuration } from '../components/ui'
import { SyncPanel } from './Sync'

export function Cockpit({ onBack }: { onBack: () => void }) {
  // Bumped after a sync so every stat below recomputes against the merged log.
  const [rev, setRev] = useState(0)
  const state = useMemo(() => load(), [rev])
  const now = useMemo(() => new Date(), [])

  const s = useMemo(() => summarise(state.reps, now), [state.reps, now])
  const ladder = useMemo(() => ladderState(state.reps), [state.reps])
  const days14 = useMemo(() => dailyFocusMinutes(state.reps, 14, now), [state.reps, now])
  const days49 = useMemo(() => dailyFocusMinutes(state.reps, 49, now), [state.reps, now])
  const drift = useMemo(() => driftSeries(state.reps, 14, now), [state.reps, now])
  const series = useMemo(() => ladderSeries(state.reps), [state.reps])
  const recalls = useMemo(
    () => state.reps.filter((r) => r.recallText).slice(-8).reverse(),
    [state.reps],
  )

  if (state.reps.length === 0) {
    return (
      <Screen>
        <TopBar title="stats" onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-base text-[var(--color-ink-dim)]">Nothing to show yet.</p>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--color-ink-faint)]">
            Run one session and this page starts telling you things you did not know about your own
            attention — where you bail, how often it wanders, how far it has stretched.
          </p>
          <div className="mt-4 w-full max-w-xs space-y-3">
            <Button variant="primary" full onClick={onBack}>
              Back
            </Button>
            <SyncPanel onChanged={() => setRev((r) => r + 1)} />
          </div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen className="pb-10">
      <TopBar title="stats" onBack={onBack} />

      <div className="space-y-6 px-5 lg:px-8">
        {/* Headline row: the ceiling carries its own weight on a laptop rather
            than sitting in the same grid as everything else. */}
        <div className="grid gap-3 lg:grid-cols-[1fr_2fr] lg:items-stretch">
          <div className="rise">
            <StatTile
              big
              label="focus ceiling"
              value={fmtDuration(s.ceilingSec)}
              hint="Longest video you have ever held all the way through."
            />
          </div>

          <div
            className="rise grid grid-cols-2 gap-3 lg:grid-cols-3"
            style={{ animationDelay: '60ms' }}
          >
            <StatTile
              label="rung"
              value={fmtDuration(ladder.rungSec)}
              hint={`${ladder.towardPromotion}/3 banked`}
            />
            <StatTile label="streak" value={String(s.streakDays)} unit="d" />
            <StatTile
              label="drift"
              value={s.driftRate.toFixed(2)}
              unit="/min"
              hint="Times attention left the player, per minute watched. Should fall."
            />
            <StatTile
              label="first skip"
              value={s.medianSkipSec === null ? '—' : fmtDuration(s.medianSkipSec)}
              hint="Median point where you bail. Should rise."
            />
            <StatTile label="held" value={String(s.focusedMinutes)} unit="min" />
            <StatTile label="clean 7d" value={String(Math.round(s.completion7d * 100))} unit="%" />
          </div>
        </div>

        <Panel
          title="the ladder"
          note="Every rep at its true length. The line behind is your ceiling — it only goes up."
        >
          <LadderChart points={series} />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="minutes held" note="Last 14 days.">
            <DayBars points={days14} />
          </Panel>

          <Panel
            title="drift rate"
            note="Lapses per minute watched, by day. This one is meant to fall."
          >
            <DriftChart points={drift} />
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <Panel title="density" note="Last seven weeks.">
            <div className="flex justify-center py-2">
              <Heatmap points={days49} />
            </div>
          </Panel>

          <Panel
            title="recall log"
            note={
              s.recallGrade === null
                ? 'What you wrote from memory, in your own words.'
                : `What you wrote from memory. Mean grade ${s.recallGrade.toFixed(1)} of 3.`
            }
          >
            <ul className="space-y-2.5">
              {recalls.map((r) => (
                <li key={r.id} className="hairline rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="label">{r.at.slice(0, 10)}</span>
                    <span
                      className="tnum text-[11px]"
                      style={{
                        color: isSuccess(r) ? 'var(--color-amber)' : 'var(--color-ink-faint)',
                      }}
                    >
                      {fmtDuration(r.durationSec)} ·{' '}
                      {['missed', 'gist', 'nailed'][(r.recallGrade ?? 1) - 1]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                    {r.recallText}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <SyncPanel onChanged={() => setRev((r) => r + 1)} />
          <Button
            full
            onClick={() => {
              const blob = new Blob([exportJson(state)], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `hold-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            Export data
          </Button>
        </div>

        <p className="pb-4 text-center text-[11px] text-[var(--color-ink-faint)]">
          {s.totalReps} reps on record. All of it stays on this device unless you sign in.
        </p>
      </div>
    </Screen>
  )
}

function Panel({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="rise panel hairline rounded-xl p-4">
      <div className="label">{title}</div>
      {note && (
        <p className="mt-1 mb-3 max-w-prose text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          {note}
        </p>
      )}
      {children}
    </section>
  )
}
