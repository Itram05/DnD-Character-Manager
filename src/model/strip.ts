// The icon strip on the cards of spells, scrolls and item powers: how it is cast, how far, what area,
// what damage and which saving throw, readable at a glance without opening the card.
//
// Everything is read from the data every time it is shown (nothing is stored): first the structured
// fields (castingTime, range, ritual, a power's activation), and only where those are missing, the
// description. What cannot be found is left out; the strip never guesses and never shows an empty slot.
// Like the automatic tags (tags.ts), this is a reading aid, not a rules engine.
import type { Ability, Activation } from './types'
import { DAMAGE_TYPES, type DamageType } from './highlight'

export type StripAction = 'action' | 'bonus' | 'reaction' | 'free' | 'special' | 'time'
export type AreaShape = 'sphere' | 'cone' | 'cube' | 'line' | 'cylinder' | 'emanation' | 'radius' | 'square'

export interface CardStrip {
  /** How it is cast / used. `time` = a longer casting time, `label` then says how long ("10 min"). */
  action?: { kind: StripAction; label?: string }
  ritual?: boolean
  /** "60 ft", "Self", "Touch", "5 mi", "Sight"... */
  range?: string
  /** Size with unit ("20 ft", "5 mi"). */
  area?: { shape: AreaShape; size: string }
  /** The first damage in the main text: dice ("8d6", "1d8+Cha", "20") and/or type. */
  damage?: { dice?: string; type?: DamageType }
  /** The ability of the first saving throw the target makes. */
  save?: Ability
}

/** What a strip is built from. Every field is optional. */
export interface StripSource {
  castingTime?: string
  activation?: Activation
  range?: string
  ritual?: boolean
  text?: string
  /** For cantrips: the character level, so "1d8" becomes "3d8" at level 11+ (see cantripDice). */
  cantripLevel?: number
}

// ---------------- action ----------------

const UNIT: Record<string, string> = { minute: 'min', minutes: 'min', min: 'min', hour: 'h', hours: 'h', round: 'rd', rounds: 'rd' }

/** "Bonus Action" -> bonus, "Reaction, when hit" -> reaction, "10 minutes" -> time "10 min". Unknown -> nothing. */
export function castingAction(castingTime: string | undefined): CardStrip['action'] {
  // "1 bonus action" (2014 books) = "Bonus Action"; "1 minute" keeps its number
  const s = (castingTime ?? '').trim().toLowerCase().replace(/^1\s+(?=(?:bonus\s+)?action|reaction)/, '')
  if (!s) return undefined
  if (s.startsWith('bonus action') || s.startsWith('bonus')) return { kind: 'bonus' }
  if (s.startsWith('reaction')) return { kind: 'reaction' }
  if (s.startsWith('action') || s.startsWith('magic action')) return { kind: 'action' }
  const m = s.match(/^(\d+)\s*(minutes?|min|hours?|rounds?)\b/)
  if (m) return { kind: 'time', label: `${m[1]} ${UNIT[m[2]]}` }
  return undefined
}

const ACTIVATION_KIND: Partial<Record<Activation, StripAction>> = { action: 'action', bonus: 'bonus', reaction: 'reaction', free: 'free', special: 'special' }

// ---------------- range and area ----------------

const feet = (n: string) => `${n} ft`

/** The part of a range before the brackets: "60 feet" -> "60 ft", "Self", "Touch", "1 mile" -> "1 mi". */
export function shortRange(base: string): string | undefined {
  const s = base.trim()
  if (!s) return undefined
  let m = s.match(/^(\d[\d,]*)\s*(?:feet|foot|ft\.?)$/i)
  if (m) return feet(m[1].replace(/,/g, ''))
  m = s.match(/^(\d+)\s*(?:miles?|mi\.?)$/i)
  if (m) return `${m[1]} mi`
  const word = s.match(/^(self|touch|sight|unlimited|special)$/i)
  if (word) return word[1].charAt(0).toUpperCase() + word[1].slice(1).toLowerCase()
  // anything else is shown only when it is short enough not to need reading ("Self/Touch" would be odd)
  return undefined
}

const SHAPES = 'sphere|cone|cube|cylinder|emanation|radius|square|line|hemisphere'
// "20-foot-radius Sphere", "60-foot Cone", "15-foot radius", "5-mile radius", "10-foot-radius, 40-foot-high Cylinder",
// "20 foot radius" and "20-ft. cube" too
const AREA = new RegExp(String.raw`\b(\d+)[-\s](foot|feet|ft\.?|mile)(?:[-\s]radius)?(?:,?\s*\d+[-\s]foot[-\s](?:high|tall))?[-\s]+(${SHAPES})\b`, 'i')
// "a Line 100 feet long", "a line that is 60 feet long"
const LINE = /\bline\s+(?:that\s+is\s+)?(\d+)\s+(?:feet|foot|ft\.?)\s+long\b/i

/** The first area in a text ("... in a 20-foot-radius Sphere ..."), or nothing. */
export function findArea(text: string | undefined): CardStrip['area'] {
  const s = text ?? ''
  const m = s.match(AREA)
  const l = s.match(LINE)
  if (m && (!l || m.index! <= l.index!)) {
    const shape = m[3].toLowerCase()
    const size = /^mile/i.test(m[2]) ? `${m[1]} mi` : feet(m[1])
    return { shape: (shape === 'hemisphere' ? 'sphere' : shape) as AreaShape, size }
  }
  if (l) return { shape: 'line', size: feet(l[1]) }
  return undefined
}

/** "within 30 ft" in a text without a range field: the reach of an item power. */
const WITHIN = /\bwithin\s+(\d+)\s*(?:ft\b\.?|feet\b|foot\b)/i

// ---------------- the main text ----------------

/**
 * The text before "At Higher Levels" / "Using a Higher-Level Spell Slot": the strip describes the spell as
 * cast at its own level (the 5th-level bonus of a cantrip is not its damage).
 */
export function mainText(text: string | undefined): string {
  const s = text ?? ''
  const cut = s.search(/(?:^|\n)\s*[_*]*\s*(?:At Higher Levels|Using a Higher-Level Spell Slot|Cantrip Upgrade)\b/i)
  return cut >= 0 ? s.slice(0, cut) : s
}

// ---------------- damage ----------------

const TYPES = DAMAGE_TYPES.join('|')
const ABIL_SHORT = 'Str|Dex|Con|Int|Wis|Cha'
const ABIL_LONG = 'Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma'
// "+ 4", "+ Cha", "+ Cha modifier", "+ your spellcasting ability modifier"
const MOD = String.raw`\s*[+\-−]\s*(?:\d+|(?:your\s+)?(?:spellcasting\s+ability\s+)?modifier|(?:${ABIL_SHORT}|${ABIL_LONG})\b(?:\s+modifier)?)`
const DICE = String.raw`\d*d\d+(?:${MOD})?`
// same position: dice + type first, then flat number + type, then dice + "damage", then "type damage"
const DAMAGE = new RegExp(
  [
    String.raw`(?<dt>\b${DICE})\s+(?<dtType>${TYPES})\b`,
    String.raw`(?<flat>\b\d+)\s+(?<flatType>${TYPES})\b`,
    String.raw`(?<dOnly>\b${DICE})\s+(?:extra\s+)?damage\b`,
    String.raw`\b(?<tOnly>${TYPES})\s+damage\b`,
  ].join('|'),
  'i',
)

/** "1d8 + Cha modifier" -> "1d8+Cha", "1d8 + your spellcasting ability modifier" -> "1d8+mod". */
export function shortDice(d: string): string {
  return d
    .replace(/\s+/g, ' ')
    .replace(/\s*([+\-−])\s*/g, '$1')
    .replace(/([+\-−])(Str|Dex|Con|Int|Wis|Cha)[a-z]*(?: modifier)?$/i, (_m, sign: string, a: string) => sign + a.charAt(0).toUpperCase() + a.slice(1, 3).toLowerCase())
    .replace(/(?:your )?(?:spellcasting ability )?modifier$/i, 'mod')
}

/** The first damage in the text: "8d6 psychic", "20 Radiant", "+1d6 damage", "fire damage". */
export function findDamage(text: string | undefined): CardStrip['damage'] {
  const m = (text ?? '').match(DAMAGE)
  if (!m) return undefined
  const g = m.groups!
  const type = (g.dtType ?? g.flatType ?? g.tOnly)?.toLowerCase() as DamageType | undefined
  const dice = g.dt ?? g.flat ?? g.dOnly
  return { ...(dice ? { dice: shortDice(dice) } : {}), ...(type ? { type } : {}) }
}

/**
 * A damage cantrip gets one more die at character levels 5, 11 and 17. Applied only when the text says so
 * (an "At Higher Levels" / "Cantrip Upgrade" part that mentions level 5) and the main text has a single
 * die ("1d8"): a text you wrote with the dice already worked out ("3d10 Fire") is left as it is.
 */
export function cantripDice(dice: string, fullText: string | undefined, level: number): string {
  const m = dice.match(/^1(d\d+.*)$/) ?? dice.match(/^(d\d+.*)$/)
  if (!m) return dice
  const upgrade = (fullText ?? '').slice(mainText(fullText).length)
  if (!/\b(?:5th level|levels? 5)\b/i.test(upgrade)) return dice
  const n = 1 + (level >= 5 ? 1 : 0) + (level >= 11 ? 1 : 0) + (level >= 17 ? 1 : 0)
  return n === 1 ? dice : `${n}${m[1]}`
}

// ---------------- saving throw ----------------

const ABILITY_OF: Record<string, Ability> = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' }
const SAVE = new RegExp(String.raw`\b(${ABIL_LONG}|${ABIL_SHORT})\.?\s+(?:saving\s+throws?|saves?)\b`, 'gi')
// "advantage on Wisdom saving throws", "+1 to Dexterity saves", "no Constitution save": not a save the target makes
const NOT_A_SAVE = /(?:advantage\s+on|bonus\s+to|[+\-−]\d+\s+to|\bno)\s+(?:all\s+|your\s+)?$/i

/** The ability of the first saving throw in the text that a target has to make. */
export function findSave(text: string | undefined): Ability | undefined {
  const s = text ?? ''
  for (const m of s.matchAll(SAVE)) {
    if (NOT_A_SAVE.test(s.slice(Math.max(0, m.index! - 30), m.index))) continue
    return ABILITY_OF[m[1].slice(0, 3).toLowerCase()]
  }
  return undefined
}

// ---------------- the strip ----------------

/** Builds the strip. Fields first, the text only where a field is missing. */
export function cardStrip(src: StripSource): CardStrip {
  const main = mainText(src.text)
  const out: CardStrip = {}

  const action = src.castingTime !== undefined && src.castingTime.trim() ? castingAction(src.castingTime) : src.activation ? (ACTIVATION_KIND[src.activation] ? { kind: ACTIVATION_KIND[src.activation]! } : undefined) : undefined
  if (action) out.action = action
  if (src.ritual) out.ritual = true

  // range: "Self (15-foot radius)" = range Self + area; "120 feet (20-foot-radius sphere)" = 120 ft + area
  const r = (src.range ?? '').trim()
  const paren = r.match(/^(.*?)\s*\((.*)\)\s*$/)
  const base = paren ? paren[1] : r
  const inParen = paren ? findArea(paren[2]) : undefined
  let range = shortRange(base)
  let area = inParen
  // the 2014 melee cantrips (Booming Blade, Green-Flame Blade) are "Self (5-foot radius)": that is the reach
  // of the one attack, not an area, so it is shown as a 5 ft range
  if (area && range === 'Self' && /\bmelee\s+(?:weapon\s+|spell\s+)?attack\b/i.test(main)) {
    range = area.size
    area = undefined
  }
  if (!r) {
    const w = main.match(WITHIN)
    if (w) range = feet(w[1])
  }
  if (range) out.range = range
  area ??= findArea(main)
  if (area) out.area = area

  const damage = findDamage(main)
  if (damage) {
    if (damage.dice && src.cantripLevel) damage.dice = cantripDice(damage.dice, src.text, src.cantripLevel)
    out.damage = damage
  }
  const save = findSave(main)
  if (save) out.save = save
  return out
}

/** Nothing to show? */
export const stripEmpty = (s: CardStrip | undefined) => !s || Object.keys(s).length === 0
