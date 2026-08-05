import type { Rep } from './types'

const KEY = 'hold.v1'

export interface Persisted {
  version: 1
  reps: Rep[]
  /** Videos YouTube refused to embed. Never served again. */
  blacklist: string[]
}

const EMPTY: Persisted = { version: 1, reps: [], blacklist: [] }

/**
 * The log is append-only and every derived number is recomputed from it, so
 * corrupt or partial state can only ever cost you history — never put the app
 * into a state where the numbers on screen disagree with what happened.
 */
export function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    if (parsed.version !== 1 || !Array.isArray(parsed.reps)) return { ...EMPTY }
    return {
      version: 1,
      reps: parsed.reps,
      blacklist: Array.isArray(parsed.blacklist) ? parsed.blacklist : [],
    }
  } catch {
    return { ...EMPTY }
  }
}

function save(state: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Quota exhausted or storage blocked. Losing one write is survivable;
    // throwing mid-session and losing the whole run is not.
  }
}

export function appendRep(rep: Rep): Persisted {
  const state = load()
  const next: Persisted = { ...state, reps: [...state.reps, rep] }
  save(next)
  return next
}

export function blacklistVideo(videoId: string): Persisted {
  const state = load()
  if (state.blacklist.includes(videoId)) return state
  const next: Persisted = { ...state, blacklist: [...state.blacklist, videoId] }
  save(next)
  return next
}

/** Videos already served — the pool must not repeat them. */
export function seenVideoIds(state: Persisted): Set<string> {
  return new Set([...state.reps.map((r) => r.videoId), ...state.blacklist])
}

export function exportJson(state: Persisted): string {
  return JSON.stringify(state, null, 2)
}

export function clearAll(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing useful to do */
  }
}

/** Demo and verification seam — lets the stats screens be checked at 0, 1 and 200 reps. */
export function replaceAll(reps: Rep[]): Persisted {
  const next: Persisted = { version: 1, reps, blacklist: [] }
  save(next)
  return next
}

export function newRepId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
