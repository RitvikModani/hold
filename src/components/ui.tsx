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
    <div className="panel hairline rounded-xl px-4 py-3.5 transition-colors duration-200 hover:border-[var(--color-line-bright)]">
      <div className="label">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`tnum leading-none ${big ? 'text-5xl text-[var(--color-amber)]' : 'text-2xl'}`}>
          {value}
        </span>
        {unit && <span className="tnum text-xs text-[var(--color-ink-faint)]">{unit}</span>}
      </div>
      {hint && (
        <div className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">{hint}</div>
      )}
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
      'bg-[var(--color-amber)] text-black hover:brightness-110 active:brightness-95 disabled:bg-[var(--color-line)] disabled:text-[var(--color-ink-faint)] disabled:hover:brightness-100',
    ghost:
      'hairline text-[var(--color-ink)] hover:border-[var(--color-line-bright)] hover:bg-[var(--color-raised)] active:bg-[var(--color-surface)]',
    quiet:
      'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-dim)] hover:bg-[var(--color-raised)]',
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer rounded-xl px-5 py-3 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]/60 focus-visible:outline-none disabled:cursor-not-allowed ${styles} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto lg:max-w-5xl ${className}`}
    >
      {children}
    </div>
  )
}

export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="flex items-center gap-3 px-5 pt-6 pb-4 lg:px-8">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          className="cursor-pointer rounded-lg px-2 py-1 text-[var(--color-ink-faint)] transition hover:bg-[var(--color-raised)] hover:text-[var(--color-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]/60 focus-visible:outline-none"
        >
          ←
        </button>
      )}
      <h1 className="label">{title}</h1>
    </header>
  )
}

/* ---------------------------------------------------------------- skeletons */

/**
 * Shimmer placeholder. Reserves the real element's box so nothing jumps when
 * content lands — the shimmer says "this is coming", it is not decoration for
 * an otherwise blank screen.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} aria-hidden />
}

export function SessionSkeleton() {
  return (
    <div className="flex h-full w-full" role="status" aria-label="Loading your session">
      <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-[var(--color-line)] p-7 lg:flex">
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-10 h-12 w-32" />
          <div className="mt-8 flex gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-1 flex-1" />
            ))}
          </div>
          <Skeleton className="mt-3 h-3 w-24" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-5 py-4 lg:px-8">
          <Skeleton className="h-3 w-20" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-[34px] w-[34px] rounded-full" />
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center lg:px-8 lg:pb-6">
          <Skeleton className="aspect-video w-full lg:max-h-full lg:w-auto lg:max-w-5xl lg:rounded-2xl" />
        </div>
        <footer className="px-5 pt-2 pb-8 lg:px-8">
          <Skeleton className="mx-auto h-3 w-24" />
        </footer>
      </main>
    </div>
  )
}

export function StatsSkeleton() {
  return (
    <div className="space-y-6 px-5 lg:px-8" role="status" aria-label="Loading your stats">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  )
}

/* -------------------------------------------------------------------- errors */

/**
 * Every error says what happened, why, and the one thing to do next.
 * "Something went wrong" is not an error message — it is an apology with no
 * information in it.
 */
export function ErrorState({
  title,
  detail,
  fix,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  title: string
  detail: string
  fix?: ReactNode
  actionLabel?: string
  onAction?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-4 px-6"
    >
      <div className="label">problem</div>
      <h2 className="text-2xl tracking-tight">{title}</h2>
      <p className="text-sm leading-relaxed text-[var(--color-ink-dim)]">{detail}</p>
      {fix && (
        <div className="panel hairline rounded-xl p-4 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          {fix}
        </div>
      )}
      <div className="mt-1 flex gap-2">
        {onAction && actionLabel && (
          <Button variant="primary" full onClick={onAction}>
            {actionLabel}
          </Button>
        )}
        {onSecondary && secondaryLabel && (
          <Button full onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="tnum rounded-md bg-[var(--color-raised)] px-1.5 py-0.5 text-[var(--color-ink)]">
      {children}
    </code>
  )
}
