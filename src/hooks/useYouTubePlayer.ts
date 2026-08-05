import { useEffect, useRef, useState } from 'react'

/**
 * Thin wrapper over YouTube's official IFrame Player API.
 *
 * Two behaviours matter more than the rest:
 *
 *  - The player is torn down the instant playback ends. YouTube's end screen
 *    (which `rel=0` has not fully suppressed since 2018) would otherwise offer
 *    a wall of thumbnails at exactly the moment the app is trying to hold
 *    attention. Unmounting first means it never renders.
 *
 *  - Not every video that reports itself as embeddable actually embeds. Error
 *    codes 101 and 150 mean the owner disallowed off-site playback, and they
 *    arrive only at play time. Those are surfaced so the caller can blacklist
 *    the video and move on without the user ever seeing a dead frame.
 */

type Status = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'unplayable'

/**
 * How long to wait for the player to say anything at all.
 *
 * A video can fail without ever firing onError — an invalid or withdrawn id
 * simply produces silence, no onReady and no error event. Without this the
 * session freezes on that rep with no way forward.
 */
const LOAD_TIMEOUT_MS = 8000

/** Synthetic code for "never loaded", distinct from YouTube's own 2/5/100/101/150. */
export const ERR_TIMEOUT = -1

interface Options {
  videoId: string
  onEnded: () => void
  onUnplayable: (code: number) => void
}

interface YTPlayer {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  getCurrentTime: () => number
  getDuration: () => number
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, cfg: unknown) => YTPlayer
      PlayerState: Record<string, number>
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<void> | null = null

function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve()
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}

export function useYouTubePlayer({ videoId, onEnded, onUnplayable }: Options) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [currentSec, setCurrentSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)

  // Held in refs so this effect never re-runs on a parent re-render and
  // restarts the video mid-rep.
  const endedRef = useRef(onEnded)
  const unplayableRef = useRef(onUnplayable)
  endedRef.current = onEnded
  unplayableRef.current = onUnplayable

  useEffect(() => {
    let cancelled = false
    let poll: number | undefined

    const deadline = window.setTimeout(() => {
      if (cancelled) return
      setStatus('unplayable')
      unplayableRef.current(ERR_TIMEOUT)
    }, LOAD_TIMEOUT_MS)

    loadIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return

      const player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          controls: 0, // no scrub bar: you cannot skim your way through a rep
          rel: 0,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            if (cancelled) return
            window.clearTimeout(deadline)
            playerRef.current = e.target
            setDurationSec(e.target.getDuration())
            // Deliberately not auto-played. Browsers block unmuted autoplay
            // without a gesture on the player itself, and muted playback is
            // useless for videos whose whole content is someone talking.
            setStatus('ready')
            poll = window.setInterval(() => {
              const p = playerRef.current
              if (!p) return
              setCurrentSec(p.getCurrentTime())
              // Duration can read 0 until metadata lands, which is after onReady.
              const d = p.getDuration()
              if (d > 0) setDurationSec(d)
            }, 250)
          },
          onStateChange: (e: { data: number }) => {
            if (cancelled || !window.YT) return
            const S = window.YT.PlayerState
            if (e.data === S.PLAYING) setStatus('playing')
            else if (e.data === S.PAUSED) setStatus('paused')
            else if (e.data === S.ENDED) {
              setStatus('ended')
              // Tear down before anything else so the end screen never paints.
              window.clearInterval(poll)
              try {
                playerRef.current?.destroy()
              } catch {
                /* already gone */
              }
              playerRef.current = null
              endedRef.current()
            }
          },
          onError: (e: { data: number }) => {
            if (cancelled) return
            window.clearTimeout(deadline)
            setStatus('unplayable')
            unplayableRef.current(e.data)
          },
        },
      })
      playerRef.current = player
    })

    return () => {
      cancelled = true
      window.clearTimeout(deadline)
      window.clearInterval(poll)
      try {
        playerRef.current?.destroy()
      } catch {
        // Already destroyed by the ENDED path.
      }
      playerRef.current = null
    }
  }, [videoId])

  return {
    containerRef,
    status,
    currentSec,
    durationSec,
    pause: () => playerRef.current?.pauseVideo(),
    play: () => playerRef.current?.playVideo(),
  }
}
