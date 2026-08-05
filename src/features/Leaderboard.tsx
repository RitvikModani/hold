import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeError, syncAvailable } from '../lib/supabase'
import {
  MAX_NAME_LENGTH,
  type BoardRow,
  deriveStanding,
  fetchBoard,
  fetchOwnProfile,
  leaveBoard,
  publishStanding,
} from '../lib/leaderboard'
import { load } from '../lib/store'
import { useAuth } from '../hooks/useAuth'
import { Button, ErrorState, Skeleton, fmtDuration } from '../components/ui'

export function Leaderboard() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [published, setPublished] = useState<BoardRow | null>(null)
  const [busy, setBusy] = useState(false)

  const reps = useMemo(() => load().reps, [])
  const standing = useMemo(() => deriveStanding(reps, new Date()), [reps])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const board = await fetchBoard()
      setRows(board)
      if (user) {
        const own = await fetchOwnProfile(user.id)
        setPublished(own)
        if (own) setName(own.display_name)
      }
    } catch (err) {
      setRows([])
      setError(describeError(err))
    }
  }, [user])

  useEffect(() => {
    if (syncAvailable) void refresh()
    else setRows([])
  }, [refresh])

  const publish = async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await publishStanding(user.id, name, reps, new Date())
      await refresh()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    if (!user) return
    setBusy(true)
    try {
      await leaveBoard(user.id)
      setPublished(null)
      await refresh()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!syncAvailable) {
    return (
      <ErrorState
        title="The board needs sync switched on."
        detail="Ranking means comparing against other people, which needs a server. This build has no Supabase credentials, so everything stays on your device."
        fix={
          <>
            Add <span className="tnum text-[var(--color-ink)]">VITE_SUPABASE_URL</span> and{' '}
            <span className="tnum text-[var(--color-ink)]">VITE_SUPABASE_ANON_KEY</span>, then
            rebuild. Your stats and streak keep working without it.
          </>
        }
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 lg:px-10 lg:py-14">
      <div className="space-y-6">
        <div className="rise">
          <div className="label">leaderboard</div>
          <h1 className="mt-3 text-3xl tracking-tight">Ranked by ceiling.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
            The longest video you have held all the way through — not minutes watched, because that
            would only reward leaving a tab open.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="hairline rounded-xl border-[var(--color-amber-dim)] px-4 py-3 text-sm text-[var(--color-ink-dim)]"
          >
            <span className="text-[var(--color-amber)]">Could not load the board.</span> {error}
            <button
              onClick={() => void refresh()}
              className="mt-2 block cursor-pointer text-xs text-[var(--color-ink-faint)] underline transition hover:text-[var(--color-ink)]"
            >
              Try again
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          {/* Your own entry, and the control to publish or update it. */}
          <section className="panel hairline rounded-xl p-4">
            <div className="label">your standing</div>
            {authLoading ? (
              <Skeleton className="mt-3 h-24 w-full" />
            ) : !user ? (
              <>
                <p className="mt-1.5 mb-3 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
                  Sign in to appear on the board. You pick the name, and only these four numbers are
                  ever published — never what you watched or wrote.
                </p>
                <Button full onClick={signInWithGoogle}>
                  Continue with Google
                </Button>
              </>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Mini label="ceiling" value={fmtDuration(standing.ceiling_sec)} />
                  <Mini label="clean" value={String(standing.clean_reps)} />
                  <Mini label="min" value={String(standing.focused_minutes)} />
                  <Mini label="streak" value={String(standing.streak_days)} />
                </div>
                <label className="label mt-4 block" htmlFor="board-name">
                  display name
                </label>
                <input
                  id="board-name"
                  value={name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="how you want to appear"
                  className="panel hairline mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none transition focus:border-[var(--color-line-bright)]"
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="primary" full disabled={busy} onClick={publish}>
                    {busy ? 'Publishing…' : published ? 'Update my entry' : 'Join the board'}
                  </Button>
                  {published && (
                    <Button full variant="quiet" disabled={busy} onClick={withdraw}>
                      Withdraw
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>

          <section>
            {rows === null ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-ink-faint)]">
                Nobody has joined yet. Publish and you are rank one by default — which is not the
                same as being first.
              </p>
            ) : (
              <ol className="space-y-2">
                {rows.map((row, i) => {
                  const isYou = user?.id === row.id
                  return (
                    <li
                      key={row.id}
                      className={`panel hairline flex items-center gap-4 rounded-xl px-4 py-3 transition-colors ${
                        isYou ? 'border-[var(--color-amber-dim)]' : ''
                      }`}
                    >
                      <span
                        className="tnum w-7 shrink-0 text-sm"
                        style={{ color: i < 3 ? 'var(--color-amber)' : 'var(--color-ink-faint)' }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {row.display_name}
                        {isYou && <span className="label ml-2">you</span>}
                      </span>
                      <span className="hidden text-right sm:block">
                        <span className="label">clean</span>
                        <span className="tnum ml-2 text-sm text-[var(--color-ink-dim)]">
                          {row.clean_reps}
                        </span>
                      </span>
                      <span className="tnum w-14 shrink-0 text-right text-base text-[var(--color-amber)]">
                        {fmtDuration(row.ceiling_sec)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline rounded-lg py-2">
      <div className="label">{label}</div>
      <div className="tnum mt-0.5 text-lg">{value}</div>
    </div>
  )
}
