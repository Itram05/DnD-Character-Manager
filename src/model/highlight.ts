// Finds the parts of a rules text worth catching at a glance: dice, typed damage, saves and DCs,
// healing, conditions, advantage. Pure string work, so the UI stays a thin renderer and this is testable.
// Nothing here edits the data: the same description is only split into tokens at display time.

export const DAMAGE_TYPES = ['fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'force', 'bludgeoning', 'piercing', 'slashing'] as const
export type DamageType = (typeof DAMAGE_TYPES)[number]

export const CONDITIONS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'] as const

export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'dice'; text: string }
  | { kind: 'damage'; text: string; damageType: DamageType }
  | { kind: 'save'; text: string }
  | { kind: 'heal'; text: string; parts: Token[] }
  | { kind: 'condition'; text: string }
  | { kind: 'advantage'; text: string }

// "8d6", "1d4 + 1", "d20". Must not run into a word ("d8s" is a plural, not a roll).
const DICE = String.raw`\b\d*d\d+(?:\s*[+\-−]\s*\d+)?(?!\w)`
const TYPES = DAMAGE_TYPES.join('|')
const ABILITY = 'Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Str|Dex|Con|Int|Wis|Cha'

// Order matters: at the same position the first alternative wins, so the longer readings come first.
// A type word is only damage right after dice ("8d6 Fire") or right before "damage" ("Fire damage"),
// so names like "Fireball" or "Fire Bolt" and prose like "choose Acid, Cold, Fire" stay plain.
const MASTER = new RegExp(
  [
    String.raw`(?<dmg>${DICE}\s+(?<dmgType>${TYPES})\b(?:\s+damage\b)?)`,
    String.raw`(?<dmg2>\b(?<dmgType2>${TYPES})\s+damage\b)`,
    String.raw`(?<heal>\b(?:regains?|restores?)\b[^.\n]{0,40}?\bHit Points\b|\bTemporary Hit Points\b|\bheal(?:s|ed|ing)?\b)`,
    String.raw`(?<save>\b(?:${ABILITY})\s+(?:saving throws?|saves?)\b|\b(?:spell\s+save\s+)?DC\b(?:\s*\d+)?)`,
    String.raw`(?<dice>${DICE})`,
    String.raw`(?<cond>\b(?:${CONDITIONS.join('|')})\b)`,
    String.raw`(?<adv>\b(?:dis)?advantage\b)`,
  ].join('|'),
  'gi',
)
const DICE_ONLY = new RegExp(DICE, 'gi')

function diceOnly(s: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of s.matchAll(DICE_ONLY)) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) })
    out.push({ kind: 'dice', text: m[0] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) })
  return out
}

export function tokenize(s: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of s.matchAll(MASTER)) {
    const g = m.groups!
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) })
    const text = m[0]
    if (g.dmg) out.push({ kind: 'damage', text, damageType: g.dmgType.toLowerCase() as DamageType })
    else if (g.dmg2) out.push({ kind: 'damage', text, damageType: g.dmgType2.toLowerCase() as DamageType })
    else if (g.heal) out.push({ kind: 'heal', text, parts: diceOnly(text) })
    else if (g.save) out.push({ kind: 'save', text })
    else if (g.dice) out.push({ kind: 'dice', text })
    else if (g.cond) out.push({ kind: 'condition', text })
    else out.push({ kind: 'advantage', text })
    last = m.index + text.length
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) })
  return out
}

const PHYSICAL = new Set<DamageType>(['bludgeoning', 'piercing', 'slashing'])
/** CSS colour class for a damage type; the three weapon types share one neutral colour. */
export function damageClass(t: DamageType): string {
  return PHYSICAL.has(t) ? 'dmg-physical' : `dmg-${t}`
}
