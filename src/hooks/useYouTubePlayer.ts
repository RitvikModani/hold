import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * One persistent YouTube player for the whole session.
 *
 * The player is created once and later videos are swapped in with
 * loadVideoById rather than by mounting a new iframe. That is not an
 * optimisation — it is the only way autoplay works past the first rep. User
 * activation from a tap does not propagate into a newly created cross-origin
 * iframe, so a fresh player is treated as never having been touched and
 * unmuted playback is blocked every single time. Reusing the same frame keeps
 * the activation the first tap earned.
 *
 * It also means the frame never goes blank between reps, which is what lets
 * the transition animate instead of flashing.
 */

type Status = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'unplayable'

interface Options {
  videoId: string
  /** False for the first rep, which needs a real tap. True after that. */
  autoplay: boolean
  onEnded: () => void
  onUnplayable: (code: number) => void
}

interface YTPlayer {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  stopVideo: () => void
  loadVideoById: (id: string) => void
  cueVideoById: (id: string) => void
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

export function useYouTubePlayer({ videoId, autoplay, onEnded, onUnplayable }: Options) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [currentSec, setCurrentSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)

  // Held in refs so the player is never rebuilt by a parent re-render.
  const endedRef = useRef(onEnded)
  const unplayableRef = useRef(onUnplayable)
  const autoplayRef = useRef(autoplay)
  const currentIdRef = useRef(videoId)
  endedRef.current = onEnded
  unplayableRef.current = onUnplayable
  autoplayRef.current = autoplay

  // Build the player exactly once. videoId is deliberately not a dependency.
  useEffect(() => {
    let cancelled = false
    let poll: number | undefined
    let deadline: number | undefined

    deadline = window.setTimeout(() => {
      if (cancelled) return
      setStatus('unplayable')
      unplayableRef.current(-1)
    }, 8000)

    loadIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: currentIdRef.current,
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
            setStatus('ready')
            poll = window.setInterval(() => {
              const p = playerRef.current
              if (!p) return
              setCurrentSec(p.getCurrentTime())
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
              // Not destroyed — the recall screen covers the frame, and the
              // player has to survive to carry activation into the next rep.
              // Stopping is enough to keep the end screen from painting.
              setStatus('ended')
              try {
                playerRef.current?.stopVideo()
              } catch {
                /* already gone */
              }
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
    })

    return () => {
      cancelled = true
      window.clearTimeout(deadline)
      window.clearInterval(poll)
      try {
        playerRef.current?.destroy()
      } catch {
        /* already gone */
      }
      playerRef.current = null
    }
  }, [])

  // Swap the video inside the existing frame.
  useEffect(() => {
    if (currentIdRef.current === videoId) return
    currentIdRef.current = videoId
    const p = playerRef.current
    if (!p) return

    setCurrentSec(0)
    setDurationSec(0)
    setStatus(autoplayRef.current ? 'loading' : 'ready')
    try {
      // loadVideoById plays immediately; cueVideoById waits for a tap.
      if (autoplayRef.current) p.loadVideoById(videoId)
      else p.cueVideoById(videoId)
    } catch {
      setStatus('unplayable')
      unplayableRef.current(-1)
    }
  }, [videoId])

  const play = useCallback(() => playerRef.current?.playVideo(), [])
  const pause = useCallback(() => playerRef.current?.pauseVideo(), [])

  return { containerRef, status, currentSec, durationSec, play, pause }
}
