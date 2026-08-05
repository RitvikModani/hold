import { useCallback, useEffect, useRef, useState } from 'react'
import type { Pool, PoolVideo, RecallGrade, Rep } from '../lib/types'
import { MIN_RECALL_CHARS, RUNGS, isSuccess, ladderState } from '../lib/ladder'
import { appendRep, blacklistVideo, load, newRepId, seenVideoIds } from '../lib/store'
import { loadPool, pickForRung } from '../lib/pool'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useDriftDetector } from '../hooks/useDriftDetector'
import { Button, ProgressRing, fmtDuration } from '../components/ui'

const REPS_PER_SESSION = 5
const SKIP_GATE_SEC = 5
const SWIPE_THRESHOLD_PX = 60

type Phase = 'loading' | 'nopool' | 'watching' | 'recall' | 'reveal' | 'ceiling' | 'done'

export function Session({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [pool, setPool] = useState<Pool | null>(null)
  const [queue, setQueue] = useState<PoolVideo[]>([])
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState<Rep[]>([])
  const [pendingRep, setPendingRep] = useState<Rep | null>(null)
  const [recallText, setRecallText] = useState('')
  // Fixed for the whole session. Promoting mid-set would move the target while
  // you are still working against it.
  const [rungSec, setRungSec] = useState(RUNGS[0] as number)

  const ceilingRef = useRef(0)

  useEffect(() => {
    loadPool()
      .then((p) => {
        const state = load()
        const ladder = ladderState(state.reps)
        ceilingRef.current = ladder.ceilingSec
        setRungSec(ladder.rungSec)
        // A few spare picks so an unplayable video can be swapped without a refetch.
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

  if (phase === 'loading') return <Centered>loading pool…</Centered>
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
  onFinish,
  onSkip,
  onUnplayable,
}: {
  video: PoolVideo
  rungSec: number
  repNumber: number
  onFinish: (rep: Rep) => void
  onSkip: (rep: Rep) => void
  onUnplayable: () => void
}) {
  const [skipGate, setSkipGate] = useState<number | null>(null)
  const watchedRef = useRef(0)
  const driftRef = useRef<Rep['driftEvents']>([])
  const touchStartY = useRef<number | null>(null)

  // Swipe up to move on, as the gesture expects. It opens the skip gate rather
  // than jumping straight to the next video: the whole point of the app is that
  // leaving early is a decision you notice making, not a reflex.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const travelled = touchStartY.current - e.changedTouches[0].clientY
    touchStartY.current = null
    if (travelled > SWIPE_THRESHOLD_PX && skipGate === null) setSkipGate(SKIP_GATE_SEC)
  }

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

  // Skipping costs five seconds of sitting with the decision. Friction, not a
  // wall — the app records the choice rather than preventing it.
  useEffect(() => {
    if (skipGate === null || skipGate <= 0) return
    const t = setTimeout(() => setSkipGate((s) => (s === null ? null : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [skipGate])

  return (
    <div
      className="flex h-full touch-none flex-col bg-[var(--color-void)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <div className="label">
          rep {repNumber} / {REPS_PER_SESSION}
        </div>
        <div className="flex items-center gap-3">
          <span className="tnum text-xs text-[var(--color-ink-faint)]">
            {fmtDuration(player.currentSec)} / {fmtDuration(duration)}
          </span>
          <ProgressRing progress={progress} />
        </div>
      </div>

      {/* The video sits in a frame rather than filling the screen. YouTube is
          16:9 and the phone is not — making the bands deliberate turns a
          letterbox into the instrument surround. */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative aspect-video w-full bg-black">
          <div ref={player.containerRef} className="h-full w-full" />

          {/* Sits over the iframe while it plays. Touches on an iframe never
              reach the parent, so without this the swipe would only work on the
              black bands. It also means a stray tap can never surface YouTube's
              own chrome — title, share, "Watch on YouTube" — mid-rep. */}
          {player.status === 'playing' && <div className="absolute inset-0" aria-hidden />}

          {player.status !== 'playing' && player.status !== 'paused' && (
            <button
              onClick={player.play}
              disabled={player.status !== 'ready'}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black disabled:cursor-default"
            >
              {player.status === 'ready' ? (
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-amber)]">
                    <span className="ml-1 border-y-[9px] border-l-[15px] border-y-transparent border-l-[var(--color-amber)]" />
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

      <div className="px-5 pt-4 pb-8">
        {skipGate === null ? (
          <button
            onClick={() => setSkipGate(SKIP_GATE_SEC)}
            className="w-full py-3 text-center text-xs text-[var(--color-ink-faint)] transition hover:text-[var(--color-ink-dim)]"
          >
            skip
          </button>
        ) : (
          <div className="rise space-y-3 text-center">
            <p className="text-sm text-[var(--color-ink-dim)]">
              {skipGate > 0 ? 'Sit with it for a moment.' : 'Still want out? This goes down as a miss.'}
            </p>
            <div className="flex gap-2">
              <Button full onClick={() => setSkipGate(null)}>
                Stay
              </Button>
              <Button
                full
                variant="quiet"
                disabled={skipGate > 0}
                onClick={() =>
                  onSkip(
                    baseRep(
                      video,
                      rungSec,
                      watchedRef.current,
                      Math.round(watchedRef.current * 10) / 10,
                      driftRef.current,
                    ),
                  )
                }
              >
                {skipGate > 0 ? `skip in ${skipGate}` : 'Skip anyway'}
              </Button>
            </div>
          </div>
        )}
      </div>
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
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-6">
      {phase === 'recall' ? (
        <div className="rise space-y-5">
          <div>
            <div className="label">recall</div>
            <h2 className="mt-2 text-xl">What was that actually about?</h2>
            <p className="mt-1.5 text-sm text-[var(--color-ink-faint)]">
              One sentence, from memory. No peeking — the retrieval is the training, not the answer.
            </p>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => onText(e.target.value)}
            rows={4}
            className="panel hairline w-full resize-none rounded-lg p-3 text-sm outline-none focus:border-[var(--color-line-bright)]"
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
        <div className="rise space-y-5">
          <div>
            <div className="label">it was</div>
            <h2 className="mt-2 text-lg leading-snug">{video.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">{video.channelTitle}</p>
          </div>
          <div className="panel hairline rounded-lg p-3">
            <div className="label">you said</div>
            <p className="mt-1.5 text-sm text-[var(--color-ink-dim)]">{text}</p>
          </div>
          <div>
            <div className="label mb-2">how close were you</div>
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
      className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center"
    >
      <div className="label rise">new ceiling</div>
      <div className="tnum rise text-7xl text-[var(--color-amber)]" style={{ animationDelay: '80ms' }}>
        {fmtDuration(sec)}
      </div>
      <p className="rise max-w-xs text-sm text-[var(--color-ink-dim)]" style={{ animationDelay: '200ms' }}>
        Longest you have ever held it. Every number on your stats page just moved.
      </p>
    </button>
  )
}

function Complete({ reps, onExit }: { reps: Rep[]; onExit: () => void }) {
  const clean = reps.filter(isSuccess).length
  const held = Math.round(reps.reduce((s, r) => s + r.watchedSec, 0))

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="rise">
        <div className="label">session over</div>
        <h2 className="mt-2 text-2xl">That is the set.</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-dim)]">
          {reps.length > 0 && clean === reps.length
            ? 'Clean sweep. The feed does not go on, and that is the point.'
            : `${clean} of ${reps.length} held. The misses are data, not a verdict.`}
        </p>
      </div>
      <div className="rise grid grid-cols-2 gap-3" style={{ animationDelay: '80ms' }}>
        <div className="panel hairline rounded-lg px-4 py-3">
          <div className="label">held</div>
          <div className="tnum mt-1 text-2xl">{fmtDuration(held)}</div>
        </div>
        <div className="panel hairline rounded-lg px-4 py-3">
          <div className="label">clean reps</div>
          <div className="tnum mt-1 text-2xl">
            {clean}
            <span className="text-sm text-[var(--color-ink-faint)]">/{reps.length}</span>
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
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-4 px-6">
      <div className="label">no content</div>
      <h2 className="text-xl">The pool is empty.</h2>
      <p className="text-sm text-[var(--color-ink-dim)]">
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
      {children}
    </div>
  )
}
