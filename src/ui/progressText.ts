// Texts shared by the XP panel, the day timers and the rest toasts. Kept apart from XpPanel.tsx and
// TimersPanel.tsx so those files export only components.
import { t } from '../i18n'
import type { TimerChange } from '../model/timers'
import type { Character } from '../model/types'
import { xpProgress } from '../model/xp'

export const fmtXp = (n: number) => Math.round(n).toLocaleString('en-US')

/** The small "new level" signal: text only when the XP reaches the next level. */
export function levelReadyText(c: Character): string | null {
  const n = xpProgress(c).levelsReady
  return n <= 0 ? null : n === 1 ? t('xp.readyOne') : t('xp.readyMany', { n })
}

/** The same signal for a phone's narrow name row: "Level up", "Level up ×2". */
export function levelReadyShort(c: Character): string | null {
  const n = xpProgress(c).levelsReady
  return n <= 0 ? null : n === 1 ? t('xp.readyShort') : t('xp.readyShortMany', { n })
}

export const daysText = (n: number) => (n === 1 ? t('days.one') : t('days.many', { n }))

/** Toast lines for timers that moved: "Rent: 2 → 1", "Rent: ENDED". */
export function timerLines(changes: TimerChange[]): string[] {
  return changes.map((ch) => (ch.ended ? t('days.lineEnded', { name: ch.name }) : t('days.line', { name: ch.name, a: ch.from, b: ch.to })))
}
