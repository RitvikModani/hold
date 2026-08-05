import { useState } from 'react'
import { Home } from './features/Home'
import { Session } from './features/Session'
import { Cockpit } from './features/Cockpit'
import { seedFromQueryString } from './lib/seed'

type Route = 'home' | 'session' | 'stats'

// Runs before first paint so a seeded log is already in place when Home reads it.
seedFromQueryString()

export default function App() {
  const [route, setRoute] = useState<Route>('home')
  // Bumped after a session so Home and Cockpit remount and re-read the log.
  const [rev, setRev] = useState(0)

  if (route === 'session')
    return (
      <Session
        onExit={() => {
          setRev((r) => r + 1)
          setRoute('home')
        }}
      />
    )

  if (route === 'stats') return <Cockpit key={rev} onBack={() => setRoute('home')} />

  return <Home key={rev} onStart={() => setRoute('session')} onStats={() => setRoute('stats')} />
}
