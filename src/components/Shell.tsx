import type { ReactNode } from 'react'

export type NavKey = 'today' | 'stats' | 'board'

/**
 * Persistent navigation. Bottom bar on a phone, side rail on a laptop.
 *
 * Three destinations, well inside the limit where a bottom bar stops being
 * scannable. The session screen deliberately renders outside this shell:
 * during a rep there is nowhere else to go, and offering somewhere would
 * undercut the only thing the app is asking of you.
 */
export function Shell({
  active,
  onNavigate,
  children,
}: {
  active: NavKey
  onNavigate: (key: NavKey) => void
  children: ReactNode
}) {
  return (
    <div className="flex h-full w-full flex-col lg:flex-row">
      {/* Laptop rail */}
      <nav
        aria-label="Main"
        className="hidden w-60 shrink-0 flex-col gap-1 border-r border-[var(--color-line)] p-5 lg:flex"
      >
        <div className="mb-8 px-3 pt-2">
          <span className="text-lg font-semibold tracking-tight">Hold</span>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
            Attention, trained like a muscle.
          </p>
        </div>
        {ITEMS.map((item) => (
          <RailItem
            key={item.key}
            item={item}
            active={active === item.key}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">{children}</main>

      {/* Phone bar. Sits above the home indicator via safe-area padding. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--color-line)] bg-[var(--color-void)]/95 backdrop-blur-lg lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {ITEMS.map((item) => (
          <BarItem
            key={item.key}
            item={item}
            active={active === item.key}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </nav>
    </div>
  )
}

interface Item {
  key: NavKey
  label: string
  icon: ReactNode
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const ITEMS: Item[] = [
  {
    key: 'today',
    label: 'Today',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path {...stroke} d="M4 18V9M9.3 18V5M14.7 18v-6M20 18v-3" />
      </svg>
    ),
  },
  {
    key: 'stats',
    label: 'Stats',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path {...stroke} d="M3 16.5 8 11l4 3.5L21 6" />
        <path {...stroke} d="M15 6h6v6" />
      </svg>
    ),
  },
  {
    key: 'board',
    label: 'Board',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path {...stroke} d="M6 20V12M12 20V5M18 20v-5" />
        <path {...stroke} d="M4 20h16" />
      </svg>
    ),
  },
]

function RailItem({ item, active, onClick }: { item: Item; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${
        active
          ? 'bg-[var(--color-raised)] text-[var(--color-ink)]'
          : 'text-[var(--color-ink-faint)] hover:bg-[var(--color-raised)]/60 hover:text-[var(--color-ink-dim)]'
      }`}
    >
      <span style={{ color: active ? 'var(--color-amber)' : undefined }}>{item.icon}</span>
      {item.label}
    </button>
  )
}

function BarItem({ item, active, onClick }: { item: Item; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      // 44px minimum touch target, which py-3 plus icon and label clears.
      className="flex flex-1 cursor-pointer flex-col items-center gap-1 py-3 transition-colors duration-200"
      style={{ color: active ? 'var(--color-amber)' : 'var(--color-ink-faint)' }}
    >
      {item.icon}
      <span className="label" style={{ color: 'inherit', fontSize: '0.625rem' }}>
        {item.label}
      </span>
    </button>
  )
}
