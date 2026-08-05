import { useState } from 'react'
import { Home } from './features/Home'
import { Session } from './features/Session'
import { Cockpit } from './features/Cockpit'
import { Leaderboard } from './features/Leaderboard'
import { seedFromQueryString } from './lib/seed'

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

  if (route === 'stats') return <Cockpit key={rev} onBack={home} />
  if (route === 'board') return <Leaderboard key={rev} onBack={home} />

  return (
    <Home
      key={rev}
      onStart={() => setRoute('session')}
      onStats={() => setRoute('stats')}
      onBoard={() => setRoute('board')}
    />
  )
}
