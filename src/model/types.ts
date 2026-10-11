// The character data model. This is what lives in localStorage and in exported JSON files.
// Every field is described in SCHEMA.md. When you change a shape here, bump
// CURRENT_SCHEMA_VERSION and add a migration in normalize.ts.
//
// AI-GUIDE.md (repo root) describes this format to the players' AI assistants, who write character
// files by hand. A new or changed field must be described there too, and its example
// (examples/ai-guide-example.json, copied into the guide) kept current. tests/aiGuide.test.ts fails when
// a field the importer reads (KNOWN in normalize.ts) or one of the fixed word lists is missing from the guide.

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
  /**
   * The feature whose `uses` this one spends (Feature.id): Turn Undead -> Channel Divinity, a Wild Shape
   * form -> Wild Shape, Flurry of Blows -> Monk's Focus. The card then shows that counter and "Use" spends
   * from it. An id, like Attack.itemId, so renaming the pool keeps the link. Absent = spends nothing shared.
   */
  poolId?: string
  /** With `poolId`: how many of the pool's uses one use takes. A whole number, 1 or more. Absent = 1. */
  cost?: number
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
  /**
   * The ability this one spell is cast with, when it is not the class's: a spell from a species (a Tiefling's
   * Charisma), a feat (Magic Initiate, Fey-Touched) or an item. The card then shows the spell's own save DC and
   * attack bonus (8 + that modifier + PB, and the modifier + PB; item bonuses included). Absent = nothing is
   * shown on the card; the DC in the head is the class's.
   */
  castingAbility?: Ability
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

export const ABILITY_SCORE_MODES = ['add', 'set'] as const
export type AbilityScoreMode = (typeof ABILITY_SCORE_MODES)[number]

/**
 * What an item does to one ability score while it counts (equipped, and attuned if it requires attunement:
 * the rule of acBonus). The score typed into `abilities` stays the hero's own; this is added at display time
 * (abilityScore in rules.ts), so taking the item off undoes it.
 */
export interface ItemAbilityScore {
  ability: Ability
  /** "add": the score goes up by `value` (Belt of Dwarvenkind, Ioun Stone). "set": the score becomes `value`, unless it is already higher (Gauntlets of Ogre Power 19, Amulet of Health 19, a Belt of Giant Strength). */
  mode: AbilityScoreMode
  value: number
  /** "add" only: the score this bonus cannot raise above. Absent = 20, the rule of nearly every such item; write 30 for none. It never lowers a score that is already higher. */
  max?: number
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
  /** Same rule as acBonus: raises or sets ability scores (Amulet of Health: Constitution becomes 19). Shown as chips under "Always on". */
  abilityScores?: ItemAbilityScore[]
  /**
   * A spell scroll's own save DC, in place of the one from the Spell Scroll table (13 to 19 by the spell's level;
   * consumables.ts). Absent = the table. Only scrolls use it for now.
   */
  saveDc?: number
  /** A spell scroll's own spell attack bonus, in place of the table's (+5 to +11). Absent = the table. */
  spellAttack?: number
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

/** The five coins, most valuable first: the order the Gear tab shows them in. */
export const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const
export type Coin = (typeof COINS)[number]

/** The player's choices for the Money panel. Every field is optional: absent = the default (see prefs.ts). */
export interface MoneyPrefs {
  /** The coins the Money panel shows. Absent = gold only. A hidden coin keeps its amount; the panel says so in one line. */
  coins?: Coin[]
}

export const ATTACK_ORDERS = ['file', 'name'] as const
export type AttackOrder = (typeof ATTACK_ORDERS)[number]
export const PHONE_STARTS = ['all', 'action', 'bonus', 'reaction', 'other'] as const
export type PhoneStart = (typeof PHONE_STARTS)[number]

/** The player's choices for the Play screen. Every field is optional: absent = the default (prefs.ts). */
export interface PlayPrefs {
  /** The order of the attack cards: "file" = as they are in `attacks` (default), "name" = A to Z. */
  attackOrder?: AttackOrder
  /** What a phone opens Play with: "all" = every hand (default), or one hand as a filter that can be taken off. */
  phoneStart?: PhoneStart
  /** The small Edit button on each section of the Play screen. Absent = shown. */
  editButtons?: boolean
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
  /** What the player marked on the picture (model/mapMarks.ts). Each is absent when there is none. */
  pins?: MapPin[]
  routes?: MapRoute[]
  tokens?: MapToken[]
  /** What a distance on this picture is in the world. Absent = routes show no numbers. */
  scale?: MapScale
}

/**
 * A place on a picture, RELATIVE to it: x 0 = the left edge, 1 = the right edge; y 0 = the top, 1 = the
 * bottom. Not pixels, so a mark stays on its spot when the picture is stored at another size.
 */
export interface MapPoint {
  x: number
  y: number
}

export const PIN_ICONS = ['pin', 'dot', 'star', 'flag', 'house', 'tent', 'cross', 'danger', 'question'] as const
export type PinIcon = (typeof PIN_ICONS)[number]

/** A pin on a map: a named place, with a note that a tap shows. */
export interface MapPin extends MapPoint {
  id: string
  name: string
  note?: string
  /** "#rrggbb". Absent = the default colour of pins. */
  color?: string
  /** Absent = "pin". */
  icon?: PinIcon
}

/** A route on a map: a line through its points, in order. */
export interface MapRoute {
  id: string
  name: string
  /** "#rrggbb". Absent = the default colour of routes. */
  color?: string
  points: MapPoint[]
  /** How far this route's travellers go in a day, in the unit of the map's scale. Absent = the scale's own `perDay`. */
  perDay?: number
}

/** A token on a map: where the party, a hero, an NPC or a horse is. */
export interface MapToken extends MapPoint {
  id: string
  name: string
  /** The few letters written on the token. Absent = the initials of the name. */
  label?: string
  /** "#rrggbb". Absent = the default colour of tokens. */
  color?: string
  note?: string
}

/** The scale of a map: the straight line from `a` to `b` is `distance` of `unit` in the world. */
export interface MapScale {
  a: MapPoint
  b: MapPoint
  distance: number
  /** Absent = "mi". */
  unit?: string
  /** A day's travel in that unit. Absent = routes show their length, but no days. */
  perDay?: number
}

export const MAP_LAYERS = ['pins', 'routes', 'tokens'] as const
export type MapLayer = (typeof MAP_LAYERS)[number]
export const MARK_SIZES = ['small', 'medium', 'large', 'huge'] as const
export type MarkSize = (typeof MARK_SIZES)[number]

/** The player's choices for the marks on maps. Every field is optional: absent = the default (mapMarks.ts). */
export interface MapPrefs {
  /** How big pins and tokens are on screen (they do not grow with the zoom). Absent = "medium". */
  size?: MarkSize
  /** Names written next to pins, tokens and routes. Absent = shown. */
  names?: boolean
  /** The layers that are hidden. Absent = all three are shown. */
  hide?: MapLayer[]
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

// ---------------- creatures (since 2026-10-11): mounts, familiars, summoned and led creatures ----------------
// A creature is a STAT BLOCK written once (the template), and the creatures of that kind that are in the game
// right now are a list inside it (`inPlay`), each with its own Hit Points, conditions and spent uses. Three
// mammoths = one stat block and three entries in `inPlay`; a stat block with nothing in play is kept for later.
// Nothing of a stat block is worked out from an edition's rules: every number is typed (or copied) and can be
// changed, because tables play 2014, 2024 and their own mixes.

/** One line of a stat block: a trait, an action, a bonus action, a reaction. Its numbers are the stat block's own, not worked out from the hero. */
export interface CreatureAction {
  id: string
  name: string
  /** `passive` = a trait (always on); the others say what using it takes, as for the hero's features. */
  activation: Activation
  /** The attack bonus as printed ("+10" is 10). A number, or a formula (the names of the hero's formulas). Absent = not an attack roll. */
  toHit?: Formula
  /** Damage dice, as for the hero's attacks: "2d10". Absent = no damage line. */
  damage?: string
  /** Added to the damage dice: 7 for "2d10 + 7". A number or a formula. */
  damageBonus?: Formula
  damageType?: string
  /** The DC of the saving throw it forces, and the ability the target rolls. */
  saveDc?: Formula
  saveAbility?: Ability
  /**
   * A limit: "3/Day" = { max: 3, recharge: "long" }; "Recharge 5-6" = { max: 1, recharge: "other", note: "Recharge 5-6" }.
   * How many are SPENT is kept per creature in play (CreatureInstance.used), so `used` here is always 0.
   */
  uses?: Uses
  /** The full text of the line. */
  description: string
}

/** A line of the player's own on a stat block ("Carries": "540 lb.", "Saddle": "exotic, 60 gp"): whatever the fixed fields have no place for. */
export interface CreatureField {
  label: string
  value: string
}

/** One creature in the game, made from its stat block. */
export interface CreatureInstance {
  id: string
  /** What tells it from the others of its kind: a name ("Burya") or a number ("2"). Absent = shown by the stat block's name alone. */
  label?: string
  /** `max` is a plain number, set from the stat block when the creature is put in play and then its own (the GM may have rolled another). */
  hp: { current: number; max: number; temp: number }
  /** Condition ids of the SRD ("prone"), or any text of the player's own ("mounted"). Absent = none. */
  conditions?: string[]
  /** Uses spent, by the id of the action (CreatureAction.id). Absent = nothing spent. */
  used?: Record<string, number>
  /** The player's note on this one creature. */
  note?: string
}

/** A stat block, and the creatures of that kind in play. */
export interface Creature {
  id: string
  name: string
  /** The line under the name: "Huge Beast, Unaligned". */
  kind?: string
  /** Armor Class: a number, or a formula. */
  ac: Formula
  /** Hit Points of a new creature of this kind: a number, or a formula. */
  hp: Formula
  /** The dice behind the Hit Points, shown only: "11d12 + 55". */
  hitDice?: string
  /** Text, as printed: "50 ft.", "30 ft., Fly 60 ft.". Nothing is worked out from it. */
  speed: string
  abilities: Record<Ability, number>
  /** Saving throw bonuses that differ from the ability modifier: Mammoth { str: 10, con: 8 }. Absent = the modifier. */
  saves?: Partial<Record<Ability, number>>
  /** The Initiative bonus when the stat block gives one. Absent = the Dexterity modifier. */
  initiative?: number
  /** Shown only, each as printed. */
  skills?: string
  vulnerabilities?: string
  resistances?: string
  immunities?: string
  senses?: string
  languages?: string
  /** "6 (XP 2,300; PB +3)". */
  cr?: string
  /** Traits, actions, bonus actions, reactions: one list, told apart by `activation`. */
  actions: CreatureAction[]
  /** The player's own lines. Absent = none. */
  extra?: CreatureField[]
  /** Notes on the stat block: where it is from, what the table changed. */
  description?: string
  /** The creatures of this kind in the game now. Absent = none (the stat block is kept for later). */
  inPlay?: CreatureInstance[]
}

/** The text fields of a stat block that are only shown, in the order a stat block prints them. */
export const CREATURE_TEXT_FIELDS = ['skills', 'vulnerabilities', 'resistances', 'immunities', 'senses', 'languages', 'cr'] as const
export type CreatureTextField = (typeof CREATURE_TEXT_FIELDS)[number]

export const CREATURE_PLACES = ['both', 'play', 'tab'] as const
export type CreaturePlace = (typeof CREATURE_PLACES)[number]
export const CREATURE_ROW_FIELDS = ['bar', 'ac', 'speed', 'attack', 'conditions', 'uses', 'note'] as const
export type CreatureRowField = (typeof CREATURE_ROW_FIELDS)[number]
export const CREATURE_LONG_RESTS = ['full', 'uses', 'none'] as const
export type CreatureLongRest = (typeof CREATURE_LONG_RESTS)[number]
export const CREATURE_SHORT_RESTS = ['uses', 'none'] as const
export type CreatureShortRest = (typeof CREATURE_SHORT_RESTS)[number]

/** The player's choices for creatures. Every field is optional: absent = the default (creatures.ts). */
export interface CreaturePrefs {
  /** Where creatures are: a section of Play and a tab of their own ("both", default), only the section ("play"), only the tab ("tab"). */
  where?: CreaturePlace
  /** The creatures in play (CreatureInstance.id) that the Play section shows. Absent = all of them. */
  pinned?: string[]
  /** What a creature's folded row shows, of CREATURE_ROW_FIELDS. Absent = the bar, AC, speed, the first attack and the conditions. */
  row?: CreatureRowField[]
  /** A Roll button on attacks and damage. Absent = shown. */
  rolls?: boolean
  /** The hero's Long Rest for the creatures in play: "full" = Hit Points and uses (default), "uses" = uses only, "none" = nothing. */
  longRest?: CreatureLongRest
  /** The hero's Short Rest for the creatures in play: "uses" = uses that come back on a Short Rest (default), "none" = nothing. */
  shortRest?: CreatureShortRest
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
  /** Stat blocks of creatures the hero leads, rides or summons, each with the ones in play. Absent when there are none. See Creature. */
  creatures?: Creature[]
  /** The player's crafting recipes (none are built in). */
  recipes: Recipe[]
  /** Items pinned as counters in Play, in the order shown. */
  playCounters: PlayCounter[]
  /** The player's choices for how the sheet looks, per character. */
  preferences: { gear: GearPrefs; money?: MoneyPrefs; play?: PlayPrefs; maps?: MapPrefs; creatures?: CreaturePrefs }
  updatedAt: string
}
