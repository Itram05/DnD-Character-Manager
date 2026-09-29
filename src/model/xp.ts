// Experience points: the group's session XP split between the players, the total, and how far it is
// to the next level. The table is the same in the 2014 and 2024 rules (SRD 5.2.1 "Character
// Advancement"). The level used is the TOTAL character level (Paladin 5 / Sorcerer 9 = level 14):
// multiclassing does not change the XP needed.
//
// XP never raises the level by itself: it only says a level is ready. The Level Up tab does the rest.
import { newId } from './normalize'
import { totalLevel } from './rules'
import type { Character, XpEntry } from './types'

/** XP needed to reach each level, index 0 = level 1. */
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000] as const

export const DEFAULT_PARTY_SIZE = 5

/** XP needed to reach `level` (1-20). */
export const xpForLevel = (level: number) => XP_TABLE[Math.max(1, Math.min(20, Math.floor(level))) - 1]

/** The highest level this much XP reaches. */
export function levelForXp(xp: number): number {
  let lvl = 1
  for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) lvl = i + 1
  return lvl
}

/**
 * The group's XP divided between the players. Rounded DOWN (each player gets the same whole
 * number; the rest is lost), which is how groups usually split it and what Adventurers League does.
 */
export function splitXp(groupXp: number, players: number): { share: number; rest: number } {
  const g = Math.max(0, Math.floor(groupXp || 0))
  const p = Math.max(1, Math.floor(players || 1))
  return { share: Math.floor(g / p), rest: g % p }
}

export interface XpProgress {
  xp: number
  /** Total character level (all classes). */
  level: number
  /** XP at which the current level starts, and the next one (null at level 20). */
  from: number
  next: number | null
  /** 0-1 of the way from `from` to `next`; 1 when the next level is already reached. */
  fraction: number
  /** XP still missing for the next level (0 when ready). */
  missing: number
  /** How many levels the XP is ahead of the sheet: 0 = none ready, 2 = two level ups waiting. */
  levelsReady: number
  /** The XP is less than the current level needs (a hero whose XP was never written down). */
  belowLevel: boolean
}

export function xpProgress(c: Character): XpProgress {
  const level = Math.min(20, totalLevel(c))
  const xp = Math.max(0, c.xp)
  const from = xpForLevel(level)
  const next = level >= 20 ? null : xpForLevel(level + 1)
  const levelsReady = Math.max(0, levelForXp(xp) - level)
  const fraction = next === null ? 1 : Math.max(0, Math.min(1, (xp - from) / (next - from)))
  return { xp, level, from, next, fraction, missing: next === null ? 0 : Math.max(0, next - xp), levelsReady, belowLevel: xp < from }
}

/** Today as YYYY-MM-DD in local time (not UTC: a session that ends at 23:30 belongs to that day). */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Adds this character's share of the session's XP. Nothing happens for 0. */
export function addSessionXp(c: Character, groupXp: number, players = c.partySize, date = today()): Character {
  const p = Math.max(1, Math.floor(players || 1))
  const { share } = splitXp(groupXp, p)
  if (share <= 0) return c
  const entry: XpEntry = { id: newId(), date, kind: 'session', amount: share, groupXp: Math.floor(groupXp), players: p }
  return { ...c, xp: c.xp + share, xpLog: [...c.xpLog, entry] }
}

/** Sets the total by hand (a hero who arrives with XP nobody wrote down). Logged, so it can be undone. */
export function correctXp(c: Character, value: number, date = today()): Character {
  const to = Math.max(0, Math.floor(value || 0))
  if (to === c.xp) return c
  const entry: XpEntry = { id: newId(), date, kind: 'correction', amount: to - c.xp }
  return { ...c, xp: to, xpLog: [...c.xpLog, entry] }
}

/** Takes back the newest entry of the log: its amount comes off the total again. */
export function undoLastXp(c: Character): Character {
  const last = c.xpLog[c.xpLog.length - 1]
  if (!last) return c
  return { ...c, xp: Math.max(0, c.xp - last.amount), xpLog: c.xpLog.slice(0, -1) }
}

export function setPartySize(c: Character, n: number): Character {
  const partySize = Math.max(1, Math.min(20, Math.floor(n || 1)))
  return partySize === c.partySize ? c : { ...c, partySize }
}
