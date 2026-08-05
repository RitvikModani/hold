import { Suspense, lazy, useState } from 'react'
import { Home } from './features/Home'
import { Session } from './features/Session'
import { seedFromQueryString } from './lib/seed'
import { StatsSkeleton } from './components/ui'

/**
 * Stats and the leaderboard are split out of the initial bundle.
 *
 * Between them they pull in the chart set and the whole Supabase client, none
 * of which is needed to open the app and start a session — the one path that
 * has to feel instant. An attention trainer that makes you wait is arguing
 * against itself.
 */
const Cockpit = lazy(() => import('./features/Cockpit').then((m) => ({ default: m.Cockpit })))
const Leaderboard = lazy(() =>
  import('./features/Leaderboard').then((m) => ({ default: m.Leaderboard })),
)

type Route = 'home' | 'session' | 'stats' | 'board'

// Runs before first paint so a seeded log is already in place when Home reads it.
seedFromQueryString()

export default function App() {
  const [route, setRoute] = useState<Route>('home')
  // Bumped after a session so Home and Cockpit remount and re-read the log.
  const [rev, setRev] = useState(0)

  const home = () => setRoute('home')

  if (route === 'session')
    return (
      <Session
        onExit={() => {
          setRev((r) => r + 1)
          home()
        }}
      />
    )

  if (route === 'stats')
    return (
      <Suspense fallback={<StatsSkeleton />}>
        <Cockpit key={rev} onBack={home} />
      </Suspense>
    )

  if (route === 'board')
    return (
      <Suspense fallback={<StatsSkeleton />}>
        <Leaderboard key={rev} onBack={home} />
      </Suspense>
    )

  return (
    <Home
      key={rev}
      onStart={() => setRoute('session')}
      onStats={() => setRoute('stats')}
      onBoard={() => setRoute('board')}
    />
  )
}
