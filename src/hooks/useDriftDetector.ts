import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriftEvent } from '../lib/types'

/**
 * Records every time attention leaves the player: tab hidden, window
 * backgrounded, app switched away from.
 *
 * This is the only honest signal the app has. Watch time alone cannot tell the
 * difference between watching a video and leaving it running in a dead tab, and
 * a training log that cannot tell those apart is worth nothing.
 *
 * `getPositionSec` is passed as a getter rather than a value so a drift event
 * can be stamped with playback position at the moment it happens, without this
 * hook re-subscribing on every tick of the clock.
 */
export function useDriftDetector(getPositionSec: () => number, active: boolean) {
  const [driftEvents, setDriftEvents] = useState<DriftEvent[]>([])
  const leftAtMs = useRef<number | null>(null)
  const leftAtSec = useRef(0)
  const positionRef = useRef(getPositionSec)
  positionRef.current = getPositionSec

  useEffect(() => {
    if (!active) return

    const away = () => {
      if (leftAtMs.current !== null) return
      leftAtMs.current = Date.now()
      leftAtSec.current = positionRef.current()
    }

    const back = () => {
      if (leftAtMs.current === null) return
      const durationSec = (Date.now() - leftAtMs.current) / 1000
      leftAtMs.current = null
      // Sub-second flickers are alt-tab noise, not a lapse in attention.
      if (durationSec >= 1) {
        setDriftEvents((prev) => [
          ...prev,
          {
            atSec: Math.round(leftAtSec.current * 10) / 10,
            durationSec: Math.round(durationSec * 10) / 10,
          },
        ])
      }
    }

    const onVisibility = () => (document.hidden ? away() : back())

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', away)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', away)
      window.removeEventListener('focus', back)
      // A rep that ends while you are away still counts the time away.
      back()
    }
  }, [active])

  const reset = useCallback(() => {
    leftAtMs.current = null
    setDriftEvents([])
  }, [])

  return { driftEvents, reset }
}
