import { useCallback, useEffect, useRef, useState } from 'react'
import type { Pool, PoolVideo, RecallGrade, Rep } from '../lib/types'
import { MIN_RECALL_CHARS, RUNGS, isSuccess, ladderState } from '../lib/ladder'
import { appendRep, blacklistVideo, load, newRepId, seenVideoIds } from '../lib/store'
import { loadPool, pickForRung } from '../lib/pool'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useDriftDetector } from '../hooks/useDriftDetector'
import { Button, ProgressRing, SessionSkeleton, fmtDuration } from '../components/ui'

const REPS_PER_SESSION = 5
const SKIP_GATE_SEC = 5
const SWIPE_THRESHOLD_PX = 60
const WHEEL_THRESHOLD = 40

type Phase = 'loading' | 'nopool' | 'watching' | 'recall' | 'reveal' | 'ceiling' | 'done'

export function Session({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [pool, setPool] = useState<Pool | null>(null)
  const [queue, setQueue] = useState<PoolVideo[]>([])
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState<Rep[]>([])
  const [pendingRep, setPendingRep] = useState<Rep | null>(null)
  const [recallText, setRecallText] = useState('')
  const [rungSec, setRungSec] = useState(RUNGS[0] as number)
  // Browsers require a real gesture on the player before the first unmuted
  // play. After that the page counts as activated and later videos start on
  // their own — so only rep one ever asks for a tap.
  const [autoStart, setAutoStart] = useState(false)

  const ceilingRef = useRef(0)

  useEffect(() => {
    loadPool()
      .then((p) => {
        const state = load()
        const ladder = ladderState(state.reps)
        ceilingRef.current = ladder.ceilingSec
        setRungSec(ladder.rungSec)
        // Spare picks so an unplayable video can be swapped without a refetch.
        const picked = pickForRung(p, ladder.rungSec, seenVideoIds(state), REPS_PER_SESSION + 3)
        setPool(p)
        setQueue(picked)
        setPhase(picked.length === 0 ? 'nopool' : 'watching')
      })
      .catch(() => setPhase('nopool'))
  }, [])

  const video = queue[index]

  const advance = useCallback(
    (doneCount: number) => {
      if (doneCount >= REPS_PER_SESSION || index + 1 >= queue.length) setPhase('done')
      else {
        setIndex((i) => i + 1)
        setPhase('watching')
      }
    },
    [index, queue.length],
  )

  const finishRep = useCallback(
    (rep: Rep) => {
      appendRep(rep)
      const next = [...completed, rep]
      setCompleted(next)
      setRecallText('')
      setPendingRep(null)

      const beatCeiling = isSuccess(rep) && rep.durationSec > ceilingRef.current
      if (beatCeiling) {
        ceilingRef.current = rep.durationSec
        setPhase('ceiling')
      } else {
        advance(next.length)
      }
    },
    [advance, completed],
  )

  /** A video that will not embed is swapped out silently — never the user's problem. */
  const replaceUnplayable = useCallback(
    (videoId: string) => {
      blacklistVideo(videoId)
      if (!pool) return
      const state = load()
      const exclude = new Set([...seenVideoIds(state), ...queue.map((v) => v.videoId)])
      const [replacement] = pickForRung(pool, ladderState(state.reps).rungSec, exclude, 1)
      setQueue((q) => {
        const next = [...q]
        if (replacement) next[index] = replacement
        else next.splice(index, 1)
        return next
      })
    },
    [index, pool, queue],
  )

  if (phase === 'loading') return <SessionSkeleton />
  if (phase === 'nopool') return <NoPool onExit={onExit} />
  if (phase === 'done') return <Complete reps={completed} onExit={onExit} />
  if (phase === 'ceiling')
    return <NewCeiling sec={ceilingRef.current} onContinue={() => advance(completed.length)} />
  if (!video) return <Complete reps={completed} onExit={onExit} />

  if (phase === 'recall' || phase === 'reveal') {
    return (
      <Recall
        video={video}
        phase={phase}
        text={recallText}
        onText={setRecallText}
        onSubmit={() => setPhase('reveal')}
        onGrade={(grade) => {
          if (pendingRep) finishRep({ ...pendingRep, recallText, recallGrade: grade })
        }}
      />
    )
  }

  return (
    <Watch
      key={video.videoId}
      video={video}
      rungSec={rungSec}
      repNumber={completed.length + 1}
      ceilingSec={ceilingRef.current}
      autoStart={autoStart}
      onStarted={() => setAutoStart(true)}
      onExit={onExit}
      onUnplayable={() => replaceUnplayable(video.videoId)}
      onFinish={(rep) => {
        setPendingRep(rep)
        setPhase('recall')
      }}
      onSkip={finishRep}
    />
  )
}

/* ------------------------------------------------------------------ watching */

function Watch({
  video,
  rungSec,
  repNumber,
  ceilingSec,
  autoStart,
  onStarted,
  onFinish,
  onSkip,
  onUnplayable,
  onExit,
}: {
  video: PoolVideo
  rungSec: number
  repNumber: number
  ceilingSec: number
  autoStart: boolean
  onStarted: () => void
  onFinish: (rep: Rep) => void
  onSkip: (rep: Rep) => void
  onUnplayable: () => void
  onExit: () => void
}) {
  const [skipGate, setSkipGate] = useState<number | null>(null)
  const watchedRef = useRef(0)
  const driftRef = useRef<Rep['driftEvents']>([])
  const touchStartY = useRef<number | null>(null)
  const wheelLock = useRef(false)

  const player = useYouTubePlayer({
    videoId: video.videoId,
    onEnded: () => onFinish(baseRep(video, rungSec, watchedRef.current, null, driftRef.current)),
    onUnplayable,
  })

  const drift = useDriftDetector(() => watchedRef.current, true)
  driftRef.current = drift.driftEvents
  watchedRef.current = Math.max(watchedRef.current, player.currentSec)

  const duration = player.durationSec || video.durationSec
  const progress = duration > 0 ? player.currentSec / duration : 0

  // Once the page has been activated by a real tap, later reps start by
  // themselves. Tapping begin before every single video was the most tedious
  // thing about using this.
  useEffect(() => {
    if (autoStart && player.status === 'ready') player.play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, player.status])

  useEffect(() => {
    if (player.status === 'playing') onStarted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status])

  const requestSkip = useCallback(() => {
    setSkipGate((s) => (s === null ? SKIP_GATE_SEC : s))
  }, [])

  useEffect(() => {
    if (skipGate === null || skipGate <= 0) return
    const t = setTimeout(() => setSkipGate((s) => (s === null ? null : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [skipGate])

  // Advance works by touch, trackpad and keyboard. It was touch-only, which
  // meant it silently did nothing on a laptop.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const travelled = touchStartY.current - e.changedTouches[0].clientY
    touchStartY.current = null
    if (travelled > SWIPE_THRESHOLD_PX) requestSkip()
  }
  const onWheel = (e: React.WheelEvent) => {
    if (wheelLock.current || Math.abs(e.deltaY) < WHEEL_THRESHOLD) return
    if (e.deltaY > 0) {
      wheelLock.current = true
      requestSkip()
      setTimeout(() => (wheelLock.current = false), 600)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') requestSkip()
      if (e.key === 'Escape') setSkipGate(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestSkip])

  const skipRep = () =>
    onSkip(
      baseRep(
        video,
        rungSec,
        watchedRef.current,
        Math.round(watchedRef.current * 10) / 10,
        driftRef.current,
      ),
    )

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      {/* Laptop-only rail. On a phone this is hidden and the video owns the
          screen; on a wide display the empty flanks become the instrument
          panel instead of dead margin. */}
      <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-[var(--color-line)] p-7 lg:flex">
        <div>
          <button
            onClick={onExit}
            className="label cursor-pointer transition hover:text-[var(--color-ink)]"
          >
            ← leave
          </button>

          <div className="mt-10">
            <div className="label">rung</div>
            <div className="tnum mt-1 text-5xl leading-none text-[var(--color-amber)]">
              {fmtDuration(rungSec)}
            </div>
          </div>

          <div className="mt-8 flex gap-1.5">
            {Array.from({ length: REPS_PER_SESSION }, (_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full transition-colors duration-300"
                style={{
                  background:
                    i < repNumber - 1
                      ? 'var(--color-amber)'
                      : i === repNumber - 1
                        ? 'var(--color-amber-dim)'
                        : 'var(--color-line)',
                }}
              />
            ))}
          </div>
          <div className="label mt-2.5">
            rep {repNumber} of {REPS_PER_SESSION}
          </div>
        </div>

        <div className="space-y-5">
          <RailStat label="ceiling" value={ceilingSec ? fmtDuration(ceilingSec) : '—'} />
          <RailStat label="drifts" value={String(drift.driftEvents.length)} />
          <p className="text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
            Scroll, swipe or press ↓ to move on. It costs the rep.
          </p>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col">
        {/* Blurred still of the video itself, filling what would otherwise be
            dead black bars around a 16:9 frame in a tall viewport. */}
        <div
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-35 blur-3xl saturate-150"
          style={{ backgroundImage: `url(https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg)` }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-[var(--color-void)]/55" aria-hidden />

        <header className="relative flex items-center justify-between px-5 py-4 lg:px-8">
          <button
            onClick={onExit}
            className="label cursor-pointer transition hover:text-[var(--color-ink)] lg:hidden"
          >
            ← leave
          </button>
          <div className="label hidden lg:block">now holding</div>
          <div className="flex items-center gap-3">
            <span className="tnum text-xs text-[var(--color-ink-dim)]">
              {fmtDuration(player.currentSec)} / {fmtDuration(duration)}
            </span>
            <ProgressRing progress={progress} />
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center lg:px-8 lg:pb-6">
          <div className="relative aspect-video w-full overflow-hidden bg-black shadow-2xl shadow-black/60 lg:max-h-full lg:w-auto lg:max-w-5xl lg:rounded-2xl lg:ring-1 lg:ring-white/10">
            <div ref={player.containerRef} className="h-full w-full" />

            {/* Sits over the iframe while it plays. Touches on an iframe never
                reach the parent, so without this the gesture would only work
                on the surrounding chrome. It also stops a stray tap surfacing
                YouTube's own title, share and watch-on-YouTube controls. */}
            {player.status === 'playing' && (
              <div className="absolute inset-0" onWheel={onWheel} aria-hidden />
            )}

            {player.status !== 'playing' && player.status !== 'paused' && (
              <button
                onClick={player.play}
                disabled={player.status !== 'ready'}
                className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black disabled:cursor-default"
              >
                {player.status === 'ready' ? (
                  <>
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-amber)] transition-transform duration-200 hover:scale-105">
                      <span className="ml-1 border-y-[10px] border-l-[17px] border-y-transparent border-l-[var(--color-amber)]" />
                    </span>
                    <span className="label">begin</span>
                  </>
                ) : (
                  <span className="label">
                    {player.status === 'unplayable' ? 'swapping in another' : 'loading'}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        <footer className="relative px-5 pt-2 pb-8 lg:px-8">
          <div className="label mb-3 text-center lg:hidden">
            rep {repNumber} of {REPS_PER_SESSION}
          </div>
          {skipGate === null ? (
            <button
              onClick={requestSkip}
              className="mx-auto block cursor-pointer py-2 text-center text-xs text-[var(--color-ink-faint)] transition hover:text-[var(--color-ink-dim)]"
            >
              skip
            </button>
          ) : (
            <div className="rise mx-auto max-w-sm space-y-3 text-center">
              <p className="text-sm text-[var(--color-ink-dim)]">
                {skipGate > 0
                  ? 'Sit with it for a moment.'
                  : 'Still want out? This goes down as a miss.'}
              </p>
              <div className="flex gap-2">
                <Button full onClick={() => setSkipGate(null)}>
                  Stay
                </Button>
                <Button full variant="quiet" disabled={skipGate > 0} onClick={skipRep}>
                  {skipGate > 0 ? `skip in ${skipGate}` : 'Skip anyway'}
                </Button>
              </div>
            </div>
          )}
        </footer>
      </main>
    </div>
  )
}

function RailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="label">{label}</span>
      <span className="tnum text-lg">{value}</span>
    </div>
  )
}

function baseRep(
  video: PoolVideo,
  rungSec: number,
  watchedSec: number,
  skippedAtSec: number | null,
  driftEvents: Rep['driftEvents'],
): Rep {
  return {
    id: newRepId(),
    videoId: video.videoId,
    // The rung this rep was served for, not the video's length — the two differ
    // by up to 15% and only the first says what was being attempted.
    rungSec,
    durationSec: video.durationSec,
    watchedSec: Math.round(watchedSec * 10) / 10,
    skippedAtSec,
    driftEvents,
    recallText: '',
    recallGrade: null,
    at: new Date().toISOString(),
  }
}

/* -------------------------------------------------------------------- recall */

function Recall({
  video,
  phase,
  text,
  onText,
  onSubmit,
  onGrade,
}: {
  video: PoolVideo
  phase: 'recall' | 'reveal'
  text: string
  onText: (s: string) => void
  onSubmit: () => void
  onGrade: (g: RecallGrade) => void
}) {
  const enough = text.trim().length >= MIN_RECALL_CHARS

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center px-6">
      {phase === 'recall' ? (
        <div className="rise space-y-6">
          <div>
            <div className="label">recall</div>
            <h2 className="mt-2 text-2xl tracking-tight">What was that actually about?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-faint)]">
              One sentence, from memory. No peeking — the retrieval is the training, not the answer.
            </p>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => onText(e.target.value)}
            rows={4}
            className="panel hairline w-full resize-none rounded-xl p-4 text-sm outline-none transition focus:border-[var(--color-line-bright)]"
            placeholder="the main claim was…"
          />
          <div className="flex items-center justify-between">
            <span className="tnum text-xs text-[var(--color-ink-faint)]">
              {text.trim().length} / {MIN_RECALL_CHARS}
            </span>
            <Button variant="primary" disabled={!enough} onClick={onSubmit}>
              Check
            </Button>
          </div>
        </div>
      ) : (
        <div className="rise space-y-6">
          <div>
            <div className="label">it was</div>
            <h2 className="mt-2 text-xl leading-snug tracking-tight">{video.title}</h2>
            <p className="mt-1.5 text-sm text-[var(--color-ink-faint)]">{video.channelTitle}</p>
          </div>
          <div className="panel hairline rounded-xl p-4">
            <div className="label">you said</div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-dim)]">{text}</p>
          </div>
          <div>
            <div className="label mb-2.5">how close were you</div>
            <div className="flex gap-2">
              {([1, 2, 3] as RecallGrade[]).map((g) => (
                <Button key={g} full onClick={() => onGrade(g)}>
                  {['Missed it', 'The gist', 'Nailed it'][g - 1]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- endings */

function NewCeiling({ sec, onContinue }: { sec: number; onContinue: () => void }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 3200)
    return () => clearTimeout(t)
  }, [onContinue])

  return (
    <button
      onClick={onContinue}
      className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <div className="label rise">new ceiling</div>
      <div
        className="tnum rise text-8xl text-[var(--color-amber)]"
        style={{ animationDelay: '80ms', textShadow: '0 0 40px rgb(255 183 3 / 0.35)' }}
      >
        {fmtDuration(sec)}
      </div>
      <p
        className="rise max-w-xs text-sm leading-relaxed text-[var(--color-ink-dim)]"
        style={{ animationDelay: '200ms' }}
      >
        Longest you have ever held it. Every number on your stats page just moved.
      </p>
    </button>
  )
}

function Complete({ reps, onExit }: { reps: Rep[]; onExit: () => void }) {
  const clean = reps.filter(isSuccess).length
  const held = Math.round(reps.reduce((s, r) => s + r.watchedSec, 0))

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-7 px-6">
      <div className="rise">
        <div className="label">session over</div>
        <h2 className="mt-2 text-3xl tracking-tight">That is the set.</h2>
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          {reps.length > 0 && clean === reps.length
            ? 'Clean sweep. The feed does not go on, and that is the point.'
            : `${clean} of ${reps.length} held. The misses are data, not a verdict.`}
        </p>
      </div>
      <div className="rise grid grid-cols-2 gap-3" style={{ animationDelay: '80ms' }}>
        <div className="panel hairline rounded-xl px-4 py-3.5">
          <div className="label">held</div>
          <div className="tnum mt-1 text-3xl">{fmtDuration(held)}</div>
        </div>
        <div className="panel hairline rounded-xl px-4 py-3.5">
          <div className="label">clean reps</div>
          <div className="tnum mt-1 text-3xl">
            {clean}
            <span className="text-base text-[var(--color-ink-faint)]">/{reps.length}</span>
          </div>
        </div>
      </div>
      <Button variant="primary" full onClick={onExit}>
        Done
      </Button>
    </div>
  )
}

function NoPool({ onExit }: { onExit: () => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-4 px-6">
      <div className="label">no content</div>
      <h2 className="text-2xl tracking-tight">The pool is empty.</h2>
      <p className="text-sm leading-relaxed text-[var(--color-ink-dim)]">
        Put a YouTube API key in <code className="tnum text-[var(--color-ink)]">.env</code> and run{' '}
        <code className="tnum text-[var(--color-ink)]">npm run harvest</code>. Costs about 100 of your
        10,000 daily quota units.
      </p>
      <Button full onClick={onExit}>
        Back
      </Button>
    </div>
  )
}
