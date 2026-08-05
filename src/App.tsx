import { Suspense, lazy, useState } from 'react'
import { Home } from './features/Home'
import { Session } from './features/Session'
import { seedFromQueryString } from './lib/seed'
import { Shell, type NavKey } from './components/Shell'
import { StatsSkeleton } from './components/ui'

/**
 * Stats and the leaderboard are split out of the initial bundle. Between them
 * they pull in the chart set and the whole Supabase client, none of which is
 * needed to open the app and start a session — the one path that has to feel
 * instant.
 */
const Cockpit = lazy(() => import('./features/Cockpit').then((m) => ({ default: m.Cockpit })))
const Leaderboard = lazy(() =>
  import('./features/Leaderboard').then((m) => ({ default: m.Leaderboard })),
)

// Runs before first paint so a seeded log is already in place when Home reads it.
seedFromQueryString()

export default function App() {
  const [tab, setTab] = useState<NavKey>('today')
  const [inSession, setInSession] = useState(false)
  // Bumped after a session so every screen remounts and re-reads the log.
  const [rev, setRev] = useState(0)

  // The session owns the whole screen. No nav, nowhere to go, nothing to
  // weigh up — which is the entire point of the exercise.
  if (inSession)
    return (
      <Session
        onExit={() => {
          setRev((r) => r + 1)
          setInSession(false)
        }}
      />
    )

  return (
    <Shell active={tab} onNavigate={setTab}>
      {tab === 'today' && <Home key={rev} onStart={() => setInSession(true)} />}
      {tab === 'stats' && (
        <Suspense fallback={<StatsSkeleton />}>
          <Cockpit key={rev} />
        </Suspense>
      )}
      {tab === 'board' && (
        <Suspense fallback={<StatsSkeleton />}>
          <Leaderboard key={rev} />
        </Suspense>
      )}
    </Shell>
  )
}
