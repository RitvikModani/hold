import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { isSuccess, ladderState } from '../lib/ladder'
import { dailyFocusMinutes, driftSeries, ladderSeries, summarise } from '../lib/stats'
import { exportJson, load } from '../lib/store'
import { DayBars, DriftChart, Heatmap, LadderChart } from '../components/charts'
import { Button, fmtDuration } from '../components/ui'
import { SyncPanel } from './Sync'

/**
 * Read top to bottom this answers four questions in order: how far have I got,
 * is it working, is my mind still wandering, and what did I actually keep. A
 * grid of tiles shows the same numbers but makes you assemble the story
 * yourself, and most people never bother.
 */
export function Cockpit() {
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
      <div className="mx-auto w-full max-w-2xl px-6 py-16 lg:px-10">
        <div className="label">stats</div>
        <h1 className="mt-3 text-3xl tracking-tight">Nothing to show yet.</h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
          Run one session and this page starts telling you things you did not know about your own
          attention — where you bail, how often it wanders, how far it has stretched.
        </p>
        <div className="mt-8 max-w-md">
          <SyncPanel onChanged={() => setRev((r) => r + 1)} />
        </div>
      </div>
    )
  }

  const driftTrend = trend(drift.map((d) => d.rate).filter((r): r is number => r !== null))

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 lg:px-10 lg:py-14">
      {/* 1. How far have I got. */}
      <section className="rise">
        <div className="label">focus ceiling</div>
        <div className="display mt-3 text-[5.5rem] sm:text-[7rem]">{fmtDuration(s.ceilingSec)}</div>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
          The longest video you have ever held all the way through — watched to the end, without
          drifting off, and able to say afterwards what it was about.
        </p>
      </section>

      <Row>
        <Fact
          label="current rung"
          value={fmtDuration(ladder.rungSec)}
          sub={`${ladder.towardPromotion}/3 banked`}
        />
        <Fact
          label="streak"
          value={String(s.streakDays)}
          sub={s.streakDays === 1 ? 'day' : 'days'}
        />
        <Fact label="total held" value={String(s.focusedMinutes)} sub="minutes" />
        <Fact
          label="clean, 7d"
          value={`${Math.round(s.completion7d * 100)}%`}
          sub={`${s.totalReps} reps all time`}
        />
      </Row>

      {/* 2. Is it working. */}
      <Section
        n="01"
        title="Is it working?"
        blurb="Every rep at its true length, oldest first. The line behind is your ceiling — it only ever goes up. If the dots are climbing, the training is doing something."
      >
        <LadderChart points={series} />
      </Section>

      {/* 3. Is my mind still wandering. */}
      <Section
        n="02"
        title="Does your attention still wander?"
        blurb={
          driftTrend === null
            ? 'Times your attention left the player, per minute watched. Needs a few more days before a direction shows.'
            : driftTrend < -0.05
              ? 'Times your attention left the player, per minute watched. Yours is falling — that is the number that matters most on this page.'
              : driftTrend > 0.05
                ? 'Times your attention left the player, per minute watched. Yours is rising. Worth asking what changed.'
                : 'Times your attention left the player, per minute watched. Yours is holding steady.'
        }
      >
        <DriftChart points={drift} />
        <Row tight>
          <Fact label="drift now" value={s.driftRate.toFixed(2)} sub="per minute" />
          <Fact
            label="median first skip"
            value={s.medianSkipSec === null ? '—' : fmtDuration(s.medianSkipSec)}
            sub="should rise"
          />
        </Row>
      </Section>

      {/* 4. How much have I actually trained. */}
      <Section
        n="03"
        title="How much have you trained?"
        blurb="Minutes held per day over the last fortnight, and seven weeks of practice density. Gaps are not failures — they are just gaps."
      >
        <DayBars points={days14} />
        <div className="mt-6 flex justify-center">
          <Heatmap points={days49} />
        </div>
      </Section>

      {/* 5. What do I remember. */}
      <Section
        n="04"
        title="What did you actually keep?"
        blurb={
          s.recallGrade === null
            ? 'What you wrote from memory, in your own words, before being shown the answer.'
            : `What you wrote from memory, before being shown the answer. You graded yourself ${s.recallGrade.toFixed(1)} out of 3 on average.`
        }
      >
        <ul className="space-y-2.5">
          {recalls.map((r) => (
            <li key={r.id} className="card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="label">{r.at.slice(0, 10)}</span>
                <span
                  className="tnum text-[11px]"
                  style={{ color: isSuccess(r) ? 'var(--color-amber)' : 'var(--color-ink-faint)' }}
                >
                  {fmtDuration(r.durationSec)} ·{' '}
                  {['missed', 'gist', 'nailed'][(r.recallGrade ?? 1) - 1]}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
                {r.recallText}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-14 grid gap-3 sm:grid-cols-2 sm:items-start">
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
          Export your data
        </Button>
      </div>

      <p className="mt-8 pb-4 text-center text-[11px] text-[var(--color-ink-faint)]">
        {s.totalReps} reps on record. All of it stays on this device unless you sign in.
      </p>
    </div>
  )
}

/** First-half to second-half comparison. Null when there is too little data. */
function trend(values: number[]): number | null {
  if (values.length < 4) return null
  const mid = Math.floor(values.length / 2)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return mean(values.slice(mid)) - mean(values.slice(0, mid))
}

function Section({
  n,
  title,
  blurb,
  children,
}: {
  n: string
  title: string
  blurb: string
  children: ReactNode
}) {
  return (
    <section className="rise mt-14">
      <div className="flex items-baseline gap-3">
        <span className="label">{n}</span>
        <h2 className="text-xl tracking-tight">{title}</h2>
      </div>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
        {blurb}
      </p>
      <div className="card mt-5 p-4 sm:p-5">{children}</div>
    </section>
  )
}

function Row({ children, tight }: { children: ReactNode; tight?: boolean }) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${tight ? 'mt-5 sm:grid-cols-2' : 'mt-10'}`}
    >
      {children}
    </div>
  )
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card card-hover px-4 py-4">
      <div className="label">{label}</div>
      <div className="tnum mt-2 text-2xl">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-[var(--color-ink-faint)]">{sub}</div>}
    </div>
  )
}
