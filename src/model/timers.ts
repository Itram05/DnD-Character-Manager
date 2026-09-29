// Countdowns in days: the king's wedding, a war, rent, a book being read, Exhaustion wearing off.
// A Long Rest is a day passing, so it takes 1 off every running timer (rest.ts). "Days pass" takes
// off several at once (ten days of travel). A timer at 0 has ended: it stays, marked, until you
// delete or restart it. Nothing here goes below 0.
import { newId } from './normalize'
import type { Character, DayTimer } from './types'

/** What one timer did when days passed. `ended` = it reached 0 just now. */
export interface TimerChange {
  id: string
  name: string
  from: number
  to: number
  ended: boolean
}

const clampDays = (n: number) => Math.max(0, Math.min(99999, Math.floor(n || 0)))

/** Ended timers first (they want attention), then fewest days left, then by name. */
export function sortedTimers(timers: readonly DayTimer[]): DayTimer[] {
  return [...timers].sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
}

/**
 * `days` days pass: every running timer loses that many (not below 0). Ended timers are untouched.
 * Returns the character unchanged (same object) when no timer is running.
 */
export function passDays(c: Character, days: number): { character: Character; changes: TimerChange[] } {
  const n = clampDays(days)
  const changes: TimerChange[] = []
  if (n === 0) return { character: c, changes }
  const timers = c.timers.map((tm) => {
    if (tm.days <= 0) return tm
    const to = Math.max(0, tm.days - n)
    changes.push({ id: tm.id, name: tm.name, from: tm.days, to, ended: to === 0 })
    return { ...tm, days: to }
  })
  if (!changes.length) return { character: c, changes }
  return { character: { ...c, timers }, changes }
}

/** One timer up or down by `delta` days (the manual + and −). */
export function nudgeTimer(c: Character, id: string, delta: number): Character {
  let changed = false
  const timers = c.timers.map((tm) => {
    if (tm.id !== id) return tm
    const days = clampDays(tm.days + delta)
    if (days === tm.days) return tm
    changed = true
    return { ...tm, days }
  })
  return changed ? { ...c, timers } : c
}

export function addTimer(c: Character, t: { name: string; days: number; note?: string }): Character {
  const days = clampDays(t.days)
  const tm: DayTimer = { id: newId(), name: t.name.trim() || 'Timer', days, start: days }
  if (t.note?.trim()) tm.note = t.note.trim()
  return { ...c, timers: [...c.timers, tm] }
}

/** Edit name, days left and note. Setting the days also makes that the new Restart value. */
export function editTimer(c: Character, id: string, t: { name: string; days: number; note?: string }): Character {
  return {
    ...c,
    timers: c.timers.map((tm) => {
      if (tm.id !== id) return tm
      const days = clampDays(t.days)
      const next: DayTimer = { id: tm.id, name: t.name.trim() || tm.name, days, start: days === tm.days ? tm.start : days }
      if (t.note?.trim()) next.note = t.note.trim()
      return next
    }),
  }
}

export function removeTimer(c: Character, id: string): Character {
  return { ...c, timers: c.timers.filter((tm) => tm.id !== id) }
}

/** An ended (or any) timer back to the days it was set to. */
export function restartTimer(c: Character, id: string): Character {
  return nudgeTimer(c, id, (c.timers.find((tm) => tm.id === id)?.start ?? 0) - (c.timers.find((tm) => tm.id === id)?.days ?? 0))
}
