import type { Rep } from './types'
import { isSuccess } from './ladder'

/**
 * Every selector takes `now` as an argument rather than reading the clock.
 * These functions decide what the user sees about their own progress, so they
 * have to be testable right up to the day boundary.
 */

/** Local-time YYYY-MM-DD. A user's day is their day, not UTC's. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function shiftDays(from: Date, delta: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + delta)
  return d
}

function withinDays(reps: Rep[], days: number, now: Date): Rep[] {
  const cutoff = shiftDays(now, -days).getTime()
  return reps.filter((r) => new Date(r.at).getTime() >= cutoff)
}

/** Longest video ever finished. Skipped attempts do not count, however close. */
export function focusCeilingSec(reps: Rep[]): number {
  return reps.reduce((max, r) => (isSuccess(r) && r.durationSec > max ? r.durationSec : max), 0)
}

/**
 * Times attention left the player, per minute actually watched.
 * The closest thing this app has to a direct measure of a wandering mind.
 */
export function driftRatePerMin(reps: Rep[]): number {
  const watchedSec = reps.reduce((s, r) => s + r.watchedSec, 0)
  if (watchedSec === 0) return 0
  const events = reps.reduce((s, r) => s + r.driftEvents.length, 0)
  return events / (watchedSec / 60)
}

/** How long you last before bailing. Low early, rising over weeks, is the goal. */
export function medianTimeToFirstSkipSec(reps: Rep[]): number | null {
  const skips = reps
    .filter((r) => r.skippedAtSec !== null)
    .map((r) => r.skippedAtSec as number)
    .sort((a, b) => a - b)
  if (skips.length === 0) return null
  const mid = Math.floor(skips.length / 2)
  return skips.length % 2 === 0 ? (skips[mid - 1] + skips[mid]) / 2 : skips[mid]
}

/**
 * Consecutive days with at least one clean rep. A day of nothing but skips is
 * not a day trained. Today being empty does not break the streak yet — you may
 * still be about to train.
 */
export function currentStreakDays(reps: Rep[], now: Date): number {
  const trained = new Set(reps.filter(isSuccess).map((r) => dayKey(r.at)))
  if (trained.size === 0) return 0

  let cursor = now
  if (!trained.has(dayKey(cursor))) {
    cursor = shiftDays(cursor, -1)
    if (!trained.has(dayKey(cursor))) return 0
  }

  let streak = 0
  while (trained.has(dayKey(cursor))) {
    streak += 1
    cursor = shiftDays(cursor, -1)
  }
  return streak
}

/** Total time spent watching, skipped reps included — it was still spent. */
export function totalFocusedMinutes(reps: Rep[]): number {
  return Math.round(reps.reduce((s, r) => s + r.watchedSec, 0) / 60)
}

export function completionRate(reps: Rep[], days: number, now: Date): number {
  const window = withinDays(reps, days, now)
  if (window.length === 0) return 0
  return window.filter(isSuccess).length / window.length
}

export function meanRecallGrade(reps: Rep[]): number | null {
  const graded = reps.filter((r) => r.recallGrade !== null)
  if (graded.length === 0) return null
  return graded.reduce((s, r) => s + (r.recallGrade as number), 0) / graded.length
}

export interface DayPoint {
  date: string
  minutes: number
}

/** One entry per day in the window, oldest first, zero-filled for gaps. */
export function dailyFocusMinutes(reps: Rep[], days: number, now: Date): DayPoint[] {
  const seconds = new Map<string, number>()
  for (const r of reps) {
    const k = dayKey(r.at)
    seconds.set(k, (seconds.get(k) ?? 0) + r.watchedSec)
  }
  return Array.from({ length: days }, (_, i) => {
    const date = dayKey(shiftDays(now, -(days - 1 - i)))
    return { date, minutes: Math.round(((seconds.get(date) ?? 0) / 60) * 10) / 10 }
  })
}

export interface LadderPoint {
  at: string
  durationSec: number
  success: boolean
}

/** One point per rep, in log order. Drives the staircase chart. */
export function ladderSeries(reps: Rep[]): LadderPoint[] {
  return reps.map((r) => ({ at: r.at, durationSec: r.durationSec, success: isSuccess(r) }))
}

export interface DriftPoint {
  date: string
  rate: number | null
}

/** Daily drift rate, oldest first. Days with no watch time report null, not zero. */
export function driftSeries(reps: Rep[], days: number, now: Date): DriftPoint[] {
  const byDay = new Map<string, Rep[]>()
  for (const r of reps) {
    const k = dayKey(r.at)
    const list = byDay.get(k)
    if (list) list.push(r)
    else byDay.set(k, [r])
  }
  return Array.from({ length: days }, (_, i) => {
    const date = dayKey(shiftDays(now, -(days - 1 - i)))
    const dayReps = byDay.get(date)
    return { date, rate: dayReps ? driftRatePerMin(dayReps) : null }
  })
}

/** Every headline stat the cockpit shows, computed in one pass over the log. */
export function summarise(reps: Rep[], now: Date) {
  return {
    ceilingSec: focusCeilingSec(reps),
    driftRate: driftRatePerMin(reps),
    medianSkipSec: medianTimeToFirstSkipSec(reps),
    streakDays: currentStreakDays(reps, now),
    focusedMinutes: totalFocusedMinutes(reps),
    completion7d: completionRate(reps, 7, now),
    recallGrade: meanRecallGrade(reps),
    totalReps: reps.length,
  }
}
