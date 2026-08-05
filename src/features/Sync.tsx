import { useCallback, useEffect, useState } from 'react'
import { describeError, syncAvailable } from '../lib/supabase'
import { syncAll } from '../lib/sync'
import { load, replaceAll } from '../lib/store'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui'

type State = 'idle' | 'working' | 'done' | 'error'

/**
 * Account and sync controls. Lives on the stats page rather than the home
 * screen, because signing in is housekeeping and starting a session is not.
 */
export function SyncPanel({ onChanged }: { onChanged?: () => void }) {
  const { user, loading, signInWithGoogle, signOut } = useAuth()
  const [state, setState] = useState<State>('idle')
  const [note, setNote] = useState('')

  const run = useCallback(async () => {
    if (!user) return
    setState('working')
    try {
      const { merged, uploaded, downloaded } = await syncAll(load().reps, user.id)
      replaceAll(merged)
      setState('done')
      setNote(uploaded || downloaded ? `${uploaded} up, ${downloaded} down` : 'already up to date')
      onChanged?.()
    } catch (err) {
      setState('error')
      setNote(describeError(err))
    }
  }, [user, onChanged])

  // Reconcile once on sign-in. That is the moment a second device actually
  // gains the history it was missing.
  useEffect(() => {
    if (user && state === 'idle') void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (!syncAvailable || loading) return null

  return (
    <section className="rise panel hairline rounded-lg p-4">
      <div className="label">sync</div>

      {!user ? (
        <>
          <p className="mt-1 mb-3 text-[11px] leading-tight text-[var(--color-ink-faint)]">
            Your history lives in this browser only. Sign in to carry it between devices and
            survive a cleared cache. The app works the same either way.
          </p>
          <Button full onClick={signInWithGoogle}>
            Continue with Google
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 mb-3 text-[11px] leading-tight text-[var(--color-ink-faint)]">
            Signed in as {user.email}. {state === 'working' && 'Syncing…'}
            {state === 'done' && note}
            {state === 'error' && `Failed: ${note}`}
          </p>
          <div className="flex gap-2">
            <Button full onClick={run} disabled={state === 'working'}>
              {state === 'working' ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button full variant="quiet" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * One quiet line on the home screen, shown only once there is a history
 * genuinely worth protecting. Asking before then is asking for nothing.
 */
export function SyncNudge({ repCount, streakDays }: { repCount: number; streakDays: number }) {
  const { user, loading, signInWithGoogle } = useAuth()
  if (!syncAvailable || loading || user) return null
  if (repCount < 10 && streakDays < 3) return null

  return (
    <button
      onClick={signInWithGoogle}
      className="w-full text-left text-[11px] leading-tight text-[var(--color-ink-faint)] transition hover:text-[var(--color-ink-dim)]"
    >
      {streakDays >= 3
        ? `${streakDays}-day streak, saved only in this browser. Sign in to keep it →`
        : `${repCount} reps, saved only in this browser. Sign in to keep them →`}
    </button>
  )
}
