// The character data model. This is what lives in localStorage and in exported JSON files.
// Every field is described in SCHEMA.md. When you change a shape here, bump
// CURRENT_SCHEMA_VERSION and add a migration in normalize.ts.

export const CURRENT_SCHEMA_VERSION = 3

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
  /**
   * Marks a counter as a known class resource, so the app can show it in a special place.
   * "sorcery-points": shown next to the spell slots, with Flexible Casting buttons.
   * Optional: without it, Sorcery Points are still recognized by note or formula.
   */
  resource?: UsesResource
}

export const USES_RESOURCES = ['sorcery-points'] as const
export type UsesResource = (typeof USES_RESOURCES)[number]

export interface Feature {
  id: string
  name: string
  source: { type: SourceType; name: string }
  activation: Activation
  uses?: Uses
  description: string
  /** Character level or class level at which it was gained (informational). */
  level?: number
  /** Your own tags (lowercase). Automatic tags (damage type, healing, save...) are added at display time, see tags.ts. */
  tags?: string[]
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
  /** Your own tags (lowercase), e.g. "buff", "control". */
  tags?: string[]
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
  /**
   * The item this attack is made with (Staff of Ages (+3) -> Staff of Ages): the attack is also a card in
   * that item's panel in Play. An id, so renaming the item keeps the link. null = no item, on purpose or
   * because none matched. Absent = never checked: the next read links it by name (normalize.ts, linkAttacks).
   */
  itemId?: string | null
}

export interface ArmorInfo {
  /** Base AC of the armor, e.g. 14 for Scale Mail. */
  base: number
  /** Max Dex bonus: null = unlimited (light), 2 = medium, 0 = heavy. */
  dexCap: number | null
}

/** Charges a power takes from its item's pool: a number, or "all" = every charge left (at least 1). */
export type PowerCost = number | 'all'

/**
 * One ability of a magic item (Staff of Ages: Temporal Echo, Hourglass Ward...).
 * Active powers are cards in the hand of their activation; passive ones sit with "Always on".
 * They follow the item's attunement: an item that is not usable in Play takes its powers with it.
 */
export interface ItemPower {
  id: string
  name: string
  activation: Activation
  /** Charges spent from the item's `charges` when used. Absent or 0 = free. */
  cost?: PowerCost
  /** Its own counter, separate from the item's charges (e.g. "once per long rest"). */
  uses?: Uses
  description: string
  tags?: string[]
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
  /** Same rule as acBonus, added to the spell save DC (Witch Focus +1). Shown as a chip under "Always on". */
  spellDcBonus?: number
  /** Same rule as acBonus, added to spell attack rolls (Staff of Ages +3). Shown as a chip under "Always on". */
  spellAttackBonus?: number
  charges?: Uses
  /** Set this to make the item a card on the play screen. Potions and scrolls are recognized by name and do not need it (see consumables.ts). */
  activation?: Activation
  description?: string
  /** Separate abilities of the item, each its own card (or "Always on" chip when passive). */
  powers?: ItemPower[]
  tags?: string[]
  /**
   * The container the item is in (Container.id). Always set after reading a file; absent or unknown = the
   * first container. Where it is kept, not whether it is worn: wearing is `equipped`, and an equipped item
   * counts as on you whatever its container (its container is where it goes when you take it off).
   */
  containerId?: string
  /** A category id: built-in (BUILTIN_CATEGORIES) or one of `inventory.categories`. Absent = guessed at display time (categories.ts). */
  category?: string
}

/**
 * A place items are kept in, made by the player: Backpack, Bag of Holding, the horse, a chest at home.
 * The inventory stays one flat list of items; each item names its container (Item.containerId).
 * Containers nest through items: a container can BE an item (the Bag of Holding item, `itemId`), and that
 * item is in another container like any item. A container without an item is "loose" (top level).
 */
export interface Container {
  id: string
  name: string
  /** A short symbol shown with the name: an emoji or a letter or two. */
  icon?: string
  /** A CSS colour, e.g. "#a274e0". */
  color?: string
  /** Weight limit of what is inside, in lb (Bag of Holding: 500). Absent = no limit. Over the limit is a warning, not a block. */
  capacity?: number
  /** What is inside does not count toward the weight you carry (Bag of Holding, a mount, a chest at home). */
  weightless?: boolean
  /** An extradimensional space (Bag of Holding, Handy Haversack, Portable Hole): one inside another is the rules' hazard, the app warns. */
  extradimensional?: boolean
  /** The item that is this container (the Bag of Holding item). The container is where that item is. Absent = not an item. */
  itemId?: string
}

/** A category of items made by the player, or a built-in one renamed (same id as the built-in). */
export interface ItemCategory {
  id: string
  name: string
  icon?: string
  color?: string
}

export const GEAR_VIEWS = ['hybrid', 'tiles', 'rows'] as const
export type GearView = (typeof GEAR_VIEWS)[number]
export const GEAR_GROUPINGS = ['container', 'category', 'none'] as const
export type GearGrouping = (typeof GEAR_GROUPINGS)[number]
export const GEAR_SHOW_FIELDS = ['quantity', 'weight', 'category', 'tags', 'charges'] as const
export type GearShowField = (typeof GEAR_SHOW_FIELDS)[number]

/** How the Gear tab shows this character's items. Per character, saved in the file. */
export interface GearPrefs {
  /** Layout (stage 3 of the inventory rework; stored now, used by the new Gear). */
  view: GearView
  /** How the item list is grouped. */
  groupBy: GearGrouping
  /** Which details a row or tile shows. */
  show: Record<GearShowField, boolean>
}

/** A character without preferences gets these. "hybrid" is layout B of the inventory mockups (recommended, not yet chosen). */
export const DEFAULT_GEAR_PREFS: GearPrefs = {
  view: 'hybrid',
  groupBy: 'container',
  show: { quantity: true, weight: true, category: true, tags: true, charges: true },
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

/**
 * One change of the XP total, newest last. `amount` is what was added to `xp` (negative for a
 * correction downwards), so undoing the last entry subtracts it again.
 */
export interface XpEntry {
  id: string
  /** Local date, YYYY-MM-DD. */
  date: string
  /** "session": the group's XP split between the players; "correction": the total set by hand. */
  kind: 'session' | 'correction'
  amount: number
  /** Session only: XP the GM gave the whole group, and how many players shared it. */
  groupXp?: number
  players?: number
}

/** A countdown in days (the king's wedding, rent due, a book being read). A Long Rest takes 1 day off. */
export interface DayTimer {
  id: string
  name: string
  /** Days left; 0 = ended (stays until you delete or restart it). */
  days: number
  /** Days it was set to, for Restart. */
  start: number
  note?: string
}

/**
 * A picture kept with the character (a map of the campaign, a family tree). Only this entry is part of
 * the character in the browser; the picture itself is in IndexedDB (imageStore.ts). In an exported file
 * each entry also has `data`: the picture as a data URL, taken out again on import.
 */
export interface CharacterImage {
  id: string
  name: string
  /** Size of the stored picture in pixels (0 when unknown). */
  width: number
  height: number
  /** Size of the stored picture in bytes. */
  bytes?: number
  /** A small preview (data URL, about 320 px) for the grid, so the grid needs no picture loaded. */
  thumb?: string
}

/**
 * What a recipe makes from or what a counter counts: items by NAME (case and spaces ignored), every stack
 * of that name together, in any container. A name, not an item id, so a recipe can be written before you
 * own any of the material, and keeps working when the stack runs out, is deleted, split or merged.
 */
export interface RecipePart {
  name: string
  /** How many one craft takes (input) or makes (output). Above 0. */
  quantity: number
}

/** What a new item made by a recipe looks like, when there is no stack of it to add to: any item field but the ones of one stack. */
export type ItemTemplate = Partial<Omit<Item, 'id' | 'name' | 'quantity' | 'containerId' | 'equipped' | 'attuned'>>

/** A recipe made by the player: "Craft" takes the inputs out of the inventory and puts the output in. */
export interface Recipe {
  id: string
  name: string
  /** Taken out on every craft. Empty = nothing is taken (a recipe that only makes something). */
  inputs: RecipePart[]
  /** Put in on every craft: added to a stack of that name in the chosen container, or a new item (from `template`). */
  output: RecipePart & { template?: ItemTemplate }
  /** Free text, shown only: how long it takes, the tool needed, the check, anything else. The app does not enforce them. */
  time?: string
  tool?: string
  dc?: string
  note?: string
  /** The container the output went to last time; the Craft dialog starts there. */
  containerId?: string
}

/** An item (by name, all stacks) shown as a counter with − and + in Play: materials, arrows, rations, anything. */
export interface PlayCounter {
  name: string
}

export type ExhaustionRules = '2014' | '2024'

export interface Character {
  schemaVersion: number
  id: string
  name: string
  player: string
  species: { name: string; size: string }
  background: string
  alignment: string
  xp: number
  /** How many players share the session XP the GM gives (default 5). */
  partySize: number
  /** Every change of `xp` made through the XP panel, oldest first. */
  xpLog: XpEntry[]
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
  /** 0-6. What a level does depends on `exhaustionRules` (see exhaustionEffects in rules.ts). */
  exhaustion: number
  /** Which edition's Exhaustion applies. Absent = '2024' (the app's rules); '2014' for a table that plays the old one. */
  exhaustionRules?: ExhaustionRules
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
    /**
     * Extra slots created with Flexible Casting (Sorcery Points -> slot), index 0 = level 1.
     * They add to the normal maximum and vanish on a Long Rest.
     */
    bonusSlots?: number[]
  }
  spells: Spell[]
  inventory: {
    items: Item[]
    money: Money
    /** Never empty: a file without containers gets one "Backpack" with every item in it. The first is where new items go. */
    containers: Container[]
    /** The player's own categories, and renamed built-in ones. */
    categories: ItemCategory[]
  }
  roleplay: Roleplay
  sessionNotes: SessionNote[]
  timers: DayTimer[]
  /** Maps and other pictures, in the order shown. Absent when there are none. See CharacterImage. */
  images?: CharacterImage[]
  /** The player's crafting recipes (none are built in). */
  recipes: Recipe[]
  /** Items pinned as counters in Play, in the order shown. */
  playCounters: PlayCounter[]
  /** The player's choices for how the sheet looks, per character. */
  preferences: { gear: GearPrefs }
  updatedAt: string
}
