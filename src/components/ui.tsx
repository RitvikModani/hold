import type { ReactNode } from 'react'

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The only progress indicator during a rep. A ring rather than a bar because a
 * bar invites you to read how much is left; a ring just reads as "still going".
 */
export function ProgressRing({
  progress,
  size = 34,
  stroke = 2,
}: {
  progress: number
  size?: number
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(1, Math.max(0, progress))
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-amber)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        style={{ transition: 'stroke-dashoffset 250ms linear' }}
      />
    </svg>
  )
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  big,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  big?: boolean
}) {
  return (
    <div className="panel hairline rounded-lg px-4 py-3">
      <div className="label">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`tnum leading-none ${big ? 'text-4xl text-[var(--color-amber)]' : 'text-2xl'}`}>
          {value}
        </span>
        {unit && <span className="tnum text-xs text-[var(--color-ink-faint)]">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[11px] leading-tight text-[var(--color-ink-faint)]">{hint}</div>}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  full,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'quiet'
  disabled?: boolean
  full?: boolean
}) {
  const styles = {
    primary:
      'bg-[var(--color-amber)] text-black hover:brightness-110 disabled:bg-[var(--color-line)] disabled:text-[var(--color-ink-faint)]',
    ghost:
      'hairline text-[var(--color-ink)] hover:border-[var(--color-line-bright)] hover:bg-[var(--color-raised)]',
    quiet: 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)]',
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed ${styles} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto ${className}`}>
      {children}
    </div>
  )
}

export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="flex items-center gap-3 px-5 pt-6 pb-4">
      {onBack && (
        <button onClick={onBack} className="tnum text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
          ←
        </button>
      )}
      <h1 className="label">{title}</h1>
    </header>
  )
}
