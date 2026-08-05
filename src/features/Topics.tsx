import { useCallback, useEffect, useState } from 'react'
import { loadPool } from '../lib/pool'
import { load, setGenres } from '../lib/store'
import { MAX_GENRES, MIN_GENRES } from '../lib/taste'
import { Button, Skeleton } from '../components/ui'

/**
 * Genre picker.
 *
 * Deliberately a small, explicit choice rather than a silent profile built
 * from behaviour. You say what you came for; the feed follows. The only thing
 * learned implicitly is which channels you actually finish, and that only
 * reorders what you already asked for.
 */
export function GenrePicker({ onSaved, compact }: { onSaved?: () => void; compact?: boolean }) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [chosen, setChosen] = useState<string[]>(() => load().genres)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    loadPool()
      .then((p) => setAvailable(p.topics ?? []))
      .catch(() => setAvailable([]))
  }, [])

  const toggle = useCallback((genre: string) => {
    setChosen((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : prev.length >= MAX_GENRES
          ? prev
          : [...prev, genre],
    )
  }, [])

  const save = () => {
    setGenres(chosen)
    setEditing(false)
    onSaved?.()
  }

  if (available === null) return <Skeleton className="h-32 w-full rounded-xl" />

  // A pool harvested before genres existed carries none. Say so plainly rather
  // than showing an empty picker and letting the user wonder what broke.
  if (available.length === 0) {
    return (
      <div className="card p-4">
        <div className="label">genres</div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
          Your content pool was harvested before genres existed, so there is nothing to choose from
          yet. Run <span className="tnum text-[var(--color-ink)]">npm run harvest</span> and they
          will appear. The feed works fine without them.
        </p>
      </div>
    )
  }

  const saved = load().genres
  const settled = saved.length > 0 && !editing

  if (settled && compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {saved.map((g) => (
          <span
            key={g}
            className="hairline rounded-full px-3 py-1 text-[11px] text-[var(--color-ink-dim)]"
          >
            {g}
          </span>
        ))}
        <button
          onClick={() => {
            setChosen(saved)
            setEditing(true)
          }}
          className="cursor-pointer text-[11px] text-[var(--color-ink-faint)] underline transition hover:text-[var(--color-ink)]"
        >
          change
        </button>
      </div>
    )
  }

  const enough = chosen.length >= MIN_GENRES

  return (
    <div className="card p-5">
      <div className="label">what are you here for</div>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
        Pick {MIN_GENRES} or {MAX_GENRES}. Your sessions lean towards these, and over time towards
        the channels you actually finish — not the ones you merely tap.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {available.map((genre) => {
          const on = chosen.includes(genre)
          const full = chosen.length >= MAX_GENRES && !on
          return (
            <button
              key={genre}
              onClick={() => toggle(genre)}
              disabled={full}
              aria-pressed={on}
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35 ${
                on
                  ? 'border-[var(--color-amber)] bg-[var(--color-amber)]/10 text-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-dim)] hover:border-[var(--color-line-bright)]'
              }`}
            >
              {genre}
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button variant="primary" disabled={!enough} onClick={save}>
          {enough ? 'Save' : `Pick ${MIN_GENRES - chosen.length} more`}
        </Button>
        <span className="tnum text-[11px] text-[var(--color-ink-faint)]">
          {chosen.length}/{MAX_GENRES}
        </span>
        {editing && (
          <button
            onClick={() => {
              setChosen(saved)
              setEditing(false)
            }}
            className="cursor-pointer text-[11px] text-[var(--color-ink-faint)] transition hover:text-[var(--color-ink)]"
          >
            cancel
          </button>
        )}
      </div>
    </div>
  )
}
