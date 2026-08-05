import type { DayPoint, DriftPoint, LadderPoint } from '../lib/stats'
import { MAX_RUNG_SEC } from '../lib/ladder'

/*
  Hand-rolled SVG rather than a chart library. These shapes are specific enough
  that a general-purpose library would be fought rather than used, and the whole
  set costs less than the library's own bundle.

  Shared convention: filled amber = a rep that counted, hollow grey = one that
  did not. Failure is never red — it is simply not lit.
*/

const W = 320
const H = 120
const PAD = { t: 8, r: 4, b: 16, l: 26 }

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-[120px] items-center justify-center text-xs text-[var(--color-ink-faint)]">
      {label}
    </div>
  )
}

/**
 * The staircase. Every rep as a dot at its true length, in order, with the
 * running ceiling behind it. The one chart that answers "am I actually getting
 * better", which is the only question the app exists to answer.
 */
export function LadderChart({ points }: { points: LadderPoint[] }) {
  if (points.length === 0) return <Empty label="no reps yet" />

  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) =>
    PAD.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (sec: number) => PAD.t + innerH - (Math.min(sec, MAX_RUNG_SEC) / MAX_RUNG_SEC) * innerH

  let best = 0
  const steps = points.map((p) => {
    if (p.success && p.durationSec > best) best = p.durationSec
    return best
  })
  const path = steps
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Video length per rep over time">
      {[45, 90, 135, 180].map((tick) => (
        <g key={tick}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={0} y={y(tick) + 3} className="tnum" fontSize="8" fill="var(--color-ink-faint)">
            {tick}s
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--color-amber-dim)" strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.durationSec)}
          r={p.success ? 2.6 : 2}
          fill={p.success ? 'var(--color-amber)' : 'none'}
          stroke={p.success ? 'none' : 'var(--color-ink-faint)'}
          strokeWidth="1"
        />
      ))}
    </svg>
  )
}

/** Minutes held per day. Bars, because days are discrete and comparable. */
export function DayBars({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.minutes))
  const innerH = H - PAD.t - PAD.b
  const slot = (W - PAD.l - PAD.r) / points.length
  const barW = Math.max(2, slot * 0.55)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Minutes focused per day">
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + innerH} y2={PAD.t + innerH} stroke="var(--color-line)" />
      <text x={0} y={PAD.t + 6} className="tnum" fontSize="8" fill="var(--color-ink-faint)">
        {max.toFixed(0)}m
      </text>
      {points.map((p, i) => {
        const h = (p.minutes / max) * innerH
        return (
          <rect
            key={p.date}
            x={PAD.l + i * slot + (slot - barW) / 2}
            y={PAD.t + innerH - h}
            width={barW}
            height={Math.max(h, p.minutes > 0 ? 1.5 : 0)}
            rx="1"
            fill={p.minutes > 0 ? 'var(--color-amber)' : 'transparent'}
          />
        )
      })}
    </svg>
  )
}

/** Drift rate per day. This one is meant to fall. */
export function DriftChart({ points }: { points: DriftPoint[] }) {
  const real = points.filter((p) => p.rate !== null)
  if (real.length < 2) return <Empty label="not enough days yet" />

  const max = Math.max(0.5, ...real.map((p) => p.rate as number))
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * innerW
  const y = (r: number) => PAD.t + innerH - (r / max) * innerH

  // Gaps break the line rather than being interpolated — a day you did not
  // train is not a day with a drift rate of zero.
  let penDown = false
  const path = points
    .map((p, i) => {
      if (p.rate === null) {
        penDown = false
        return ''
      }
      const cmd = penDown ? 'L' : 'M'
      penDown = true
      return `${cmd}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`
    })
    .join(' ')
    .trim()

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Attention drift rate per day">
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + innerH} y2={PAD.t + innerH} stroke="var(--color-line)" />
      <text x={0} y={PAD.t + 6} className="tnum" fontSize="8" fill="var(--color-ink-faint)">
        {max.toFixed(1)}
      </text>
      <path d={path} fill="none" stroke="var(--color-amber)" strokeWidth="1.5" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.rate === null ? null : <circle key={p.date} cx={x(i)} cy={y(p.rate)} r="1.8" fill="var(--color-amber)" />,
      )}
    </svg>
  )
}

/** Weeks as columns, days as rows. Density of practice at a glance. */
export function Heatmap({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.minutes))
  const cell = 12
  const gap = 3
  const cols = Math.ceil(points.length / 7)

  return (
    <svg
      viewBox={`0 0 ${cols * (cell + gap)} ${7 * (cell + gap)}`}
      className="w-full max-w-[240px]"
      role="img"
      aria-label="Practice density by day"
    >
      {points.map((p, i) => (
        <rect
          key={p.date}
          x={Math.floor(i / 7) * (cell + gap)}
          y={(i % 7) * (cell + gap)}
          width={cell}
          height={cell}
          rx="2"
          fill={p.minutes === 0 ? 'var(--color-line)' : 'var(--color-amber)'}
          opacity={p.minutes === 0 ? 1 : 0.2 + 0.8 * (p.minutes / max)}
        >
          <title>{`${p.date} — ${p.minutes}m`}</title>
        </rect>
      ))}
    </svg>
  )
}
