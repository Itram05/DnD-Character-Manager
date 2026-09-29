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
  /**
   * The first damage in the main text: dice ("8d6", "1d8+Cha", "20") and/or type. `times`: how many rays,
   * beams or darts roll it (Scorching Ray 3, Eldritch Blast 3 at level 11), only when the text says so.
   */
  damage?: { dice?: string; type?: DamageType; times?: number }
  /** The first healing in the main text: dice or a number ("2d8+mod", "70", "all"); `temp` = Temporary Hit Points. */
  heal?: { dice?: string; temp?: boolean }
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
    .replace(/\s+plus\s+/gi, '+')
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
  // Eldritch Blast grows by beams, not by dice: each beam stays 1d10 (the count is `times`, see findTimes)
  if (UPGRADE_TIMES.test(upgrade)) return dice
  const n = 1 + (level >= 5 ? 1 : 0) + (level >= 11 ? 1 : 0) + (level >= 17 ? 1 : 0)
  return n === 1 ? dice : `${n}${m[1]}`
}

// ---------------- rays, beams, darts ----------------

const COUNT: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const NUMBER = String.raw`(?:two|three|four|five|six|seven|eight|nine|ten|\d+)`
const SHOTS = String.raw`(?:rays|beams|darts|bolts|missiles)`
// "You hurl three fiery rays", "You create three glowing darts of magical force": up to three words between
const TIMES = new RegExp(String.raw`\b(${NUMBER})\s+(?:[a-z-]+\s+){0,3}?${SHOTS}\b`, 'i')
// "two beams at level 5, three beams at level 11" (2024), "two beams at 5th level" (2014)
const UPGRADE_TIMES_G = new RegExp(String.raw`\b(${NUMBER})\s+${SHOTS}\s+(?:at|when\s+you\s+reach)\s+(?:(?:character\s+)?level\s+(\d+)|(\d+)(?:st|nd|rd|th)\s+level)`, 'gi')
const UPGRADE_TIMES = new RegExp(UPGRADE_TIMES_G.source, 'i')

const toCount = (w: string) => COUNT[w.toLowerCase()] ?? parseInt(w, 10)

/**
 * How many rays, beams or darts the spell makes, when the text says a number of them: the main text
 * ("three fiery rays"), or for a cantrip the upgrade line at the character's level ("three beams at
 * level 11"). One, or nothing said: undefined. The count at the spell's own level, like the damage.
 */
export function findTimes(fullText: string | undefined, level?: number): number | undefined {
  const main = mainText(fullText)
  let n: number | undefined
  const m = main.match(TIMES)
  if (m) n = toCount(m[1])
  if (level !== undefined) {
    const upgrade = (fullText ?? '').slice(main.length)
    for (const u of upgrade.matchAll(UPGRADE_TIMES_G)) {
      const at = parseInt(u[2] ?? u[3], 10)
      if (level >= at) n = Math.max(n ?? 1, toCount(u[1]))
    }
  }
  return n !== undefined && n >= 2 && n <= 20 ? n : undefined
}

// ---------------- healing ----------------

// the same dice as damage, plus the written-out "plus": "2d8 plus your spellcasting ability modifier"
const HMOD = String.raw`\s*(?:[+\-−]|plus)\s*(?:\d+(?!\s*d\d)|(?:your\s+)?(?:spellcasting\s+ability\s+)?modifier|(?:${ABIL_SHORT}|${ABIL_LONG})\b(?:\s+modifier)?)`
const HDICE = String.raw`(?:\d*d\d+(?:${HMOD})?|\d+(?:${HMOD})?)`
const HEAL = new RegExp(
  [
    // "regains 4d8 + 15 Hit Points", "restoring 70 Hit Points", "restore up to 700 Hit Points", "gain 2d4 + 4 Temporary Hit Points"
    String.raw`\b(?:regains?|restores?|restoring|gains?)\s+(?:up\s+to\s+)?(?<n1>${HDICE})\s+(?<t1>Temporary\s+)?Hit\s+Points?\b`,
    // "regains a number of Hit Points equal to 2d8 plus ...", "regain Hit Points equal to half the damage"
    String.raw`\b(?:regains?|restores?|gains?)\s+(?:a\s+number\s+of\s+)?(?<t2>Temporary\s+)?Hit\s+Points\s+equal\s+to\s+(?:(?<n2>${HDICE})(?!\w))?`,
    // "regains all its Hit Points"
    String.raw`\b(?<all>regains?\s+all\s+(?:of\s+)?(?:its|their|your)\s+Hit\s+Points)\b`,
    // short notes as people write them: "Heal 1d8 + Cha modifier"
    String.raw`\bheals?\s+(?<n3>\d*d\d+(?:${HMOD})?)`,
    // anything else that gives Hit Points back: the icon without a number
    String.raw`\b(?:regains?|restores?)\s+(?<t4>Temporary\s+)?Hit\s+Points?\b`,
  ].join('|'),
  'gi',
)
// "can't regain Hit Points" (Chill Touch) is the opposite of healing
const NO_HEAL = /(?:can't|cannot|can\s+not|doesn't|don't|no\s+longer)\s+$/i

/** The first healing in the text a target gets: "2d8+mod", "70", "all", or only that there is some. */
export function findHeal(text: string | undefined): CardStrip['heal'] {
  const s = text ?? ''
  for (const m of s.matchAll(HEAL)) {
    if (NO_HEAL.test(s.slice(Math.max(0, m.index! - 20), m.index))) continue
    const g = m.groups!
    const n = g.n1 ?? g.n2 ?? g.n3
    const temp = !!(g.t1 ?? g.t2 ?? g.t4)
    return { ...(n ? { dice: shortDice(n) } : g.all ? { dice: 'all' } : {}), ...(temp ? { temp } : {}) }
  }
  return undefined
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
    const times = findTimes(src.text, src.cantripLevel)
    if (times) damage.times = times
    out.damage = damage
  }
  const heal = findHeal(main)
  if (heal) {
    if (heal.dice && heal.dice !== 'all' && src.cantripLevel) heal.dice = cantripDice(heal.dice, src.text, src.cantripLevel)
    out.heal = heal
  }
  const save = findSave(main)
  if (save) out.save = save
  return out
}

/** Nothing to show? */
export const stripEmpty = (s: CardStrip | undefined) => !s || Object.keys(s).length === 0
