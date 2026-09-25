// The character data model. This is what lives in localStorage and in exported JSON files.
// Every field is described in SCHEMA.md. When you change a shape here, bump
// CURRENT_SCHEMA_VERSION and add a migration in normalize.ts.

export const CURRENT_SCHEMA_VERSION = 1

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]

export const SKILLS = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
} as const satisfies Record<string, Ability>
export type SkillId = keyof typeof SKILLS
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[]

export type SkillProficiency = 'none' | 'proficient' | 'expertise'

/** How a feature is used at the table. `passive` = always on, nothing to activate. */
export const ACTIVATIONS = ['passive', 'action', 'bonus', 'reaction', 'free', 'special'] as const
export type Activation = (typeof ACTIVATIONS)[number]

/** When spent uses come back. `dawn` = at dawn each day (magic items mostly). */
export const RECHARGES = ['short', 'long', 'dawn', 'other', 'none'] as const
export type Recharge = (typeof RECHARGES)[number]

export const SOURCE_TYPES = ['class', 'subclass', 'species', 'background', 'feat', 'item', 'other'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export type CasterType = 'full' | 'half' | 'third' | 'pact' | 'none'

/** A number, or a formula like "max(1, cha)" or "barbarian.rages". See expr.ts. */
export type Formula = number | string

export interface Uses {
  max: Formula
  used: number
  recharge: Recharge
  /** Uses regained on a Short Rest when recharge is "long" (e.g. Rage regains 1). Number or formula. */
  shortRestRegain?: Formula
  /**
   * Partial recovery that needs a roll, e.g. "1d6+1" for a wand that regains 1d6+1 charges at dawn.
   * When set, rests do NOT refill this counter automatically; they remind you to roll instead.
   */
  regain?: string
  /** Free text shown next to the counter. */
  note?: string
}

export interface Feature {
  id: string
  name: string
  source: { type: SourceType; name: string }
  activation: Activation
  uses?: Uses
  description: string
  /** Character level or class level at which it was gained (informational). */
  level?: number
}

export interface ClassEntry {
  /** SRD class id ("wizard") or any id for a non-SRD class. */
  id: string
  name: string
  level: number
  subclass?: string
  /** Needed only for classes that are not in the SRD. */
  hitDie?: number
  /** Overrides the SRD caster type; needed for non-SRD classes and PHB subclasses like Eldritch Knight. */
  casterType?: CasterType
  spellcastingAbility?: Ability
}

export interface Spell {
  id: string
  name: string
  /** 0 = cantrip */
  level: number
  /** Class id this spell is prepared for (decides the spellcasting ability), or "feat", "item", ... */
  source?: string
  prepared: boolean
  alwaysPrepared: boolean
  ritual: boolean
  concentration: boolean
  school?: string
  castingTime?: string
  range?: string
  components?: string
  duration?: string
  description?: string
  /** Free casts without a slot (Magic Initiate, Mystic Arcanum, Favored Enemy...). */
  freeCasts?: Uses
}

export interface Attack {
  id: string
  name: string
  /** "str", "dex", "spell", or "finesse" (best of str/dex). */
  ability: Ability | 'spell' | 'finesse'
  proficient: boolean
  /** Extra to-hit (e.g. +1 weapon). */
  bonus: number
  damage: string
  damageType?: string
  /** Add the ability modifier to damage (true for most weapon attacks). */
  addAbilityToDamage: boolean
  damageBonus: number
  mastery?: string
  notes?: string
}

export interface ArmorInfo {
  /** Base AC of the armor, e.g. 14 for Scale Mail. */
  base: number
  /** Max Dex bonus: null = unlimited (light), 2 = medium, 0 = heavy. */
  dexCap: number | null
}

export interface Item {
  id: string
  name: string
  quantity: number
  equipped: boolean
  requiresAttunement: boolean
  attuned: boolean
  weight?: number
  /** When equipped, this item sets base AC (body armor). */
  armor?: ArmorInfo
  /** When equipped (and attuned if it requires attunement): added to AC. Shield = 2. */
  acBonus?: number
  /** Same rule as acBonus, added to every saving throw (Ring/Cloak of Protection). */
  saveBonus?: number
  charges?: Uses
  description?: string
}

export interface Money {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

export interface SessionNote {
  id: string
  date: string
  title: string
  text: string
}

export interface Roleplay {
  appearance: string
  personality: string
  ideals: string
  bonds: string
  flaws: string
  voice: string
  mannerisms: string
  goals: string
  backstory: string
  allies: string
  notes: string
}

export interface Character {
  schemaVersion: number
  id: string
  name: string
  player: string
  species: { name: string; size: string }
  background: string
  alignment: string
  xp: number
  classes: ClassEntry[]
  abilities: Record<Ability, number>
  proficiencies: {
    /** If empty, the saving throws of the first class are used. */
    savingThrows: Ability[]
    skills: Partial<Record<SkillId, SkillProficiency>>
    /** Bard's Jack of All Trades: half PB to ability checks without proficiency. */
    jackOfAllTrades: boolean
    armor: string
    weapons: string
    tools: string
    languages: string
    weaponMasteries: string[]
  }
  combat: {
    /** Used when no body armor is equipped. Formula, e.g. "10 + dex + con" (Barbarian). */
    unarmoredAc: Formula
    acBonus: number
    initiativeBonus: number
    speed: number
    hp: { current: number; max: number; temp: number }
    /** Spent hit dice by die size, e.g. { "d8": 1 }. */
    hitDiceUsed: Record<string, number>
    deathSaves: { successes: number; failures: number }
  }
  conditions: string[]
  /** 0-6, 2024 rules. */
  exhaustion: number
  heroicInspiration: boolean
  features: Feature[]
  attacks: Attack[]
  spellcasting: {
    /** Used slots per spell level, index 0 = level 1. */
    slotsUsed: number[]
    pactSlotsUsed: number
    concentration: string
    /** Replaces the computed slots entirely (index 0 = level 1). For homebrew. */
    slotsOverride?: number[]
    pactOverride?: { slots: number; level: number }
  }
  spells: Spell[]
  inventory: { items: Item[]; money: Money }
  roleplay: Roleplay
  sessionNotes: SessionNote[]
  updatedAt: string
}
