// Character-creation data: species sub-choices, background details, ability score methods.
// Everything here is either parsed from the generated SRD data (origins.json) or copied from
// SRD 5.2.1 "Character Creation" (Step 3: Ability Scores). Tests: src/data/srdOrigins.test.ts.
import type { Ability, Activation, Uses } from '../model/types'
import { SRD_BACKGROUNDS, SRD_FEATS, SRD_SPECIES, type SrdEntry } from './srd'

// ---------------- ability scores (SRD 5.2.1, Step 3) ----------------

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const

/** "Ability Score Point Costs" table. 27 points to spend, scores 8-15. */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
export const POINT_BUY_TOTAL = 27

/** "Standard Array by Class" table (suggestion only), order str dex con int wis cha. */
const ARRAY_BY_CLASS: Record<string, [number, number, number, number, number, number]> = {
  barbarian: [15, 13, 14, 10, 12, 8],
  bard: [8, 14, 12, 13, 10, 15],
  cleric: [14, 8, 13, 10, 15, 12],
  druid: [8, 12, 14, 13, 15, 10],
  fighter: [15, 14, 13, 8, 10, 12],
  monk: [12, 15, 13, 10, 14, 8],
  paladin: [15, 10, 13, 8, 12, 14],
  ranger: [12, 15, 13, 8, 14, 10],
  rogue: [12, 15, 13, 14, 10, 8],
  sorcerer: [10, 13, 14, 8, 12, 15],
  warlock: [8, 14, 13, 12, 10, 15],
  wizard: [8, 12, 13, 15, 14, 10],
}

const ORDER: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export function suggestedArray(classId: string | undefined): Record<Ability, number> | undefined {
  const row = classId ? ARRAY_BY_CLASS[classId] : undefined
  if (!row) return undefined
  return Object.fromEntries(ORDER.map((a, i) => [a, row[i]])) as Record<Ability, number>
}

// ---------------- backgrounds ----------------

const ABILITY_NAMES: Record<string, Ability> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

export interface BackgroundInfo {
  name: string
  abilities: Ability[]
  /** e.g. "Magic Initiate (Cleric)" */
  feat: string
  /** Name of the feat in feats.json, e.g. "Magic Initiate" */
  featBase: string
  featText: string
  /** Skill names as written, e.g. ["Insight", "Religion"] */
  skills: string[]
  tool: string
  equipment: string
  text: string
}

const field = (text: string, label: string) => text.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`))?.[1]?.trim() ?? ''
/** Removes the tiny markdown used by the SRD data (_italic_, **bold**) and "(see ...)" cross references. */
export const plain = (s: string) =>
  s
    .replace(/\*\*|_/g, '')
    .replace(/\s*\(see [^)]*\)/g, '')
    .trim()

export function backgroundInfo(name: string): BackgroundInfo | undefined {
  const b: SrdEntry | undefined = SRD_BACKGROUNDS.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (!b) return undefined
  const abilities = field(b.text, 'Ability Scores')
    .split(/,\s*/)
    .map((s) => ABILITY_NAMES[s.trim().toLowerCase()])
    .filter((a): a is Ability => !!a)
  const feat = plain(field(b.text, 'Feat'))
  const featBase = feat.replace(/\s*\(.*\)$/, '')
  return {
    name: b.name,
    abilities,
    feat,
    featBase,
    featText: SRD_FEATS.find((f) => f.name === featBase)?.text ?? '',
    skills: field(b.text, 'Skill Proficiencies')
      .split(/\s+and\s+|,\s*/)
      .map((s) => s.trim())
      .filter(Boolean),
    tool: plain(field(b.text, 'Tool Proficiency')),
    equipment: plain(field(b.text, 'Equipment')),
    text: b.text,
  }
}

// ---------------- species ----------------

export interface SpeciesOption {
  name: string
  text: string
  /** Wood Elf: speed 35. */
  speed?: number
}
export interface SpeciesChoice {
  /** The trait the choice belongs to, e.g. "Draconic Ancestry". */
  trait: string
  /** Word used in the UI: ancestry, lineage, legacy. */
  kind: 'ancestry' | 'lineage' | 'legacy'
  options: SpeciesOption[]
}

function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    )
}

/** "**Forest Gnome.** You know ..." paragraphs in the species text. */
function boldOptions(text: string): SpeciesOption[] {
  return [...text.matchAll(/^\*\*(.+?)\.\*\*\s*(.+)$/gm)].map((m) => ({ name: m[1], text: m[2].trim() }))
}

export function speciesChoice(speciesName: string): SpeciesChoice | undefined {
  const sp = SRD_SPECIES.find((s) => s.name === speciesName)
  if (!sp) return undefined
  const trait = (n: string) => sp.traits.find((t) => t.name === n)?.text ?? ''
  switch (sp.name) {
    case 'Dragonborn': {
      // | Dragon | Damage Type | Dragon | Damage Type |  (two dragons per row)
      const rows = tableRows(trait('Draconic Ancestry')).slice(1)
      const options = rows.flatMap((r) => [
        { name: r[0], text: `Damage type: ${r[1]}.` },
        { name: r[2], text: `Damage type: ${r[3]}.` },
      ])
      return { trait: 'Draconic Ancestry', kind: 'ancestry', options: options.filter((o) => o.name) }
    }
    case 'Elf':
    case 'Tiefling': {
      const traitName = sp.name === 'Elf' ? 'Elven Lineage' : 'Fiendish Legacy'
      const rows = tableRows(trait(traitName))
      const options = rows.slice(1).map((r) => ({
        name: r[0],
        text: `Level 1: ${r[1]} Level 3: ${r[2]}. Level 5: ${r[3]}.`,
        ...(/Speed increases to (\d+) feet/.test(r[1]) ? { speed: Number(r[1].match(/Speed increases to (\d+) feet/)![1]) } : {}),
      }))
      return { trait: traitName, kind: sp.name === 'Elf' ? 'lineage' : 'legacy', options }
    }
    case 'Gnome':
      return { trait: 'Gnomish Lineage', kind: 'lineage', options: boldOptions(sp.text) }
    case 'Goliath':
      return { trait: 'Giant Ancestry', kind: 'ancestry', options: boldOptions(sp.text) }
  }
  return undefined
}

/** Sizes the species may pick from, e.g. ["Medium", "Small"] for Human. */
export function speciesSizes(speciesName: string): string[] {
  const sp = SRD_SPECIES.find((s) => s.name === speciesName)
  if (!sp) return ['Medium', 'Small']
  const line = sp.text.match(/\*\*Size:\*\*\s*(.+)/)?.[1] ?? 'Medium'
  const sizes = [...line.matchAll(/\b(Tiny|Small|Medium|Large)\b/g)].map((m) => m[1])
  return sizes.length ? [...new Set(sizes)] : ['Medium']
}

/**
 * How species traits behave at the table (checked against the trait text in origins.json).
 * Not listed = passive. `fromLevel` = the trait only works from that character level.
 */
export const SPECIES_TRAIT_PRESETS: Record<string, { activation: Activation; uses?: Omit<Uses, 'used'>; fromLevel?: number }> = {
  'Dragonborn:Breath Weapon': { activation: 'action', uses: { max: 'pb', recharge: 'long' } },
  'Dragonborn:Draconic Flight': { activation: 'bonus', uses: { max: 1, recharge: 'long' }, fromLevel: 5 },
  'Dwarf:Stonecunning': { activation: 'bonus', uses: { max: 'pb', recharge: 'long' } },
  'Goliath:Large Form': { activation: 'bonus', uses: { max: 1, recharge: 'long' }, fromLevel: 5 },
  'Orc:Adrenaline Rush': { activation: 'bonus', uses: { max: 'pb', recharge: 'short' } },
  'Orc:Relentless Endurance': { activation: 'free', uses: { max: 1, recharge: 'long' } },
}

/** Goliath Giant Ancestry: how each boon is used. All of them: PB uses per Long Rest. */
export const GIANT_BOON_ACTIVATION: Record<string, Activation> = {
  "Cloud's Jaunt (Cloud Giant)": 'bonus',
  "Fire's Burn (Fire Giant)": 'free',
  "Frost's Chill (Frost Giant)": 'free',
  "Hill's Tumble (Hill Giant)": 'free',
  "Stone's Endurance (Stone Giant)": 'reaction',
  "Storm's Thunder (Storm Giant)": 'reaction',
}
