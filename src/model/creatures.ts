// Creatures the hero leads, rides or summons (Character.creatures; since 2026-10-11).
//
// A STAT BLOCK is written once (Creature); the creatures of that kind that are in the game are a list inside
// it (Creature.inPlay), each with its own Hit Points, conditions, spent uses and note. So a wrong number
// fixed in the stat block is fixed for all three mammoths, and a stat block with nothing in play is simply
// kept for later (a demon not summoned yet, a Wild Shape form).
//
// Nothing here knows an edition's rules. Every number of a stat block is the player's: typed, copied from a
// book or from the GM, and changed at will. The one built-in block (the Mammoth of SRD 5.2.1) is a starting
// point that is copied into the hero and edited like any other.
//
// Every function takes a character and returns a new one (or the same one when nothing changed), so each
// goes through the sheet's `update` and can be undone.
import { newId } from './id'
import { abilityMod, evalFormula } from './rules'
import { ABILITIES, CREATURE_ROW_FIELDS, type Ability, type Character, type Creature, type CreatureAction, type CreatureInstance, type CreatureLongRest, type CreaturePlace, type CreaturePrefs, type CreatureRowField, type CreatureShortRest, type Formula } from './types'

// ---------------- preferences.creatures ----------------

export interface CreaturePrefsInForce {
  where: CreaturePlace
  row: readonly CreatureRowField[]
  rolls: boolean
  longRest: CreatureLongRest
  shortRest: CreatureShortRest
  /** undefined = every creature in play is shown in Play. */
  pinned?: string[]
}

/** What a character without the preference gets. `pinned` has no default value: absent means "all". */
export const DEFAULT_CREATURE_PREFS: Omit<CreaturePrefsInForce, 'pinned'> = {
  // a section in Play (the creatures are at hand in a fight) and a tab (the stat blocks, read in peace)
  where: 'both',
  row: ['bar', 'ac', 'speed', 'attack', 'conditions'],
  rolls: true,
  // creatures rest with the hero: all Hit Points and what comes back on a rest
  longRest: 'full',
  shortRest: 'uses',
}

/** The creature preferences in force: the stored ones over the defaults. */
export function creaturePrefs(c: Pick<Character, 'preferences'>): CreaturePrefsInForce {
  return { ...DEFAULT_CREATURE_PREFS, ...(c.preferences.creatures ?? {}) }
}

// the order the importer writes the choices in; the setters keep it, so an export reads back character for character
const PREF_ORDER = ['where', 'pinned', 'row', 'rolls', 'longRest', 'shortRest']

function withCreaturePrefs(c: Character, prefs: CreaturePrefs): Character {
  const { creatures: _old, ...rest } = c.preferences
  void _old
  const src = prefs as Record<string, unknown>
  const inOrder = Object.fromEntries([...PREF_ORDER.filter((k) => src[k] !== undefined), ...Object.keys(src).filter((k) => !PREF_ORDER.includes(k) && src[k] !== undefined)].map((k) => [k, src[k]])) as CreaturePrefs
  return { ...c, preferences: Object.keys(inOrder).length ? { ...rest, creatures: inOrder } : rest }
}

/** Sets one creature preference; the default is stored as "absent" (and an empty group is removed). */
export function setCreaturePref<K extends 'where' | 'rolls' | 'longRest' | 'shortRest'>(c: Character, key: K, value: CreaturePrefsInForce[K]): Character {
  if (creaturePrefs(c)[key] === value) return c
  const prefs: CreaturePrefs = { ...(c.preferences.creatures ?? {}) }
  if (value === DEFAULT_CREATURE_PREFS[key]) delete prefs[key]
  else (prefs as Record<string, unknown>)[key] = value
  return withCreaturePrefs(c, prefs)
}

/** Shows or hides one detail of the folded row. The default set is stored as "absent". */
export function setRowField(c: Character, field: CreatureRowField, shown: boolean): Character {
  const now = creaturePrefs(c).row
  if (now.includes(field) === shown) return c
  const row = CREATURE_ROW_FIELDS.filter((f) => (f === field ? shown : now.includes(f)))
  const prefs: CreaturePrefs = { ...(c.preferences.creatures ?? {}) }
  if (row.join() === DEFAULT_CREATURE_PREFS.row.join()) delete prefs.row
  else prefs.row = row
  return withCreaturePrefs(c, prefs)
}

/** Whether the Play section shows this creature in play. */
export function isPinned(c: Pick<Character, 'preferences'>, instanceId: string): boolean {
  const pinned = c.preferences.creatures?.pinned
  return !pinned || pinned.includes(instanceId)
}

/** Shows or hides one creature in the Play section. The first hiding writes the list of the ones still shown. */
export function setPinned(c: Character, instanceId: string, on: boolean): Character {
  if (isPinned(c, instanceId) === on) return c
  const all = creaturesInPlay(c).map((x) => x.instance.id)
  const pinned = all.filter((id) => (id === instanceId ? on : isPinned(c, id)))
  const prefs: CreaturePrefs = { ...(c.preferences.creatures ?? {}) }
  // all of them shown again = the default, "absent"
  if (pinned.length === all.length) delete prefs.pinned
  else prefs.pinned = pinned
  return withCreaturePrefs(c, prefs)
}

/** Every creature in play shown in Play again. */
export function pinAll(c: Character): Character {
  if (!c.preferences.creatures?.pinned) return c
  const { pinned: _old, ...prefs } = c.preferences.creatures
  void _old
  return withCreaturePrefs(c, prefs)
}

// ---------------- reading a stat block ----------------

export const creatureList = (c: Pick<Character, 'creatures'>): Creature[] => c.creatures ?? []

export interface InPlay {
  creature: Creature
  instance: CreatureInstance
}

/** Every creature in play, in the order of the stat blocks and, within one, of its `inPlay`. */
export function creaturesInPlay(c: Pick<Character, 'creatures'>): InPlay[] {
  return creatureList(c).flatMap((creature) => (creature.inPlay ?? []).map((instance) => ({ creature, instance })))
}

/** The creatures the Play section shows: in play, and not hidden from it. */
export const creaturesShownInPlay = (c: Pick<Character, 'creatures' | 'preferences'>): InPlay[] => creaturesInPlay(c).filter((x) => isPinned(c, x.instance.id))

export function findInPlay(c: Pick<Character, 'creatures'>, instanceId: string): InPlay | undefined {
  return creaturesInPlay(c).find((x) => x.instance.id === instanceId)
}

/** "Mammoth · Burya", or the stat block's name alone when the creature has no label of its own. */
export const instanceName = (creature: Creature, instance: CreatureInstance): string => (instance.label ? `${creature.name} · ${instance.label}` : creature.name)

/** A number of a stat block: itself, or its formula worked out with the hero's names. NaN when the formula cannot be worked out. */
export function creatureNumber(c: Character, f: Formula | undefined): number {
  if (f === undefined) return NaN
  if (typeof f === 'number') return f
  const r = evalFormula(c, f)
  return r.error || r.unknown.length || !Number.isFinite(r.value) ? NaN : Math.floor(r.value)
}

/** The Hit Points a new creature of this kind starts with: the stat block's, at least 1. */
export function creatureHpMax(c: Character, creature: Creature): number {
  const n = creatureNumber(c, creature.hp)
  return Number.isNaN(n) ? 1 : Math.max(1, n)
}

export const creatureMod = (creature: Creature, a: Ability): number => abilityMod(creature.abilities[a])
/** The saving throw bonus: the stat block's own when it gives one, else the ability modifier. */
export const creatureSave = (creature: Creature, a: Ability): number => creature.saves?.[a] ?? creatureMod(creature, a)
/** The Initiative bonus: the stat block's own when it gives one, else the Dexterity modifier. */
export const creatureInitiative = (creature: Creature): number => creature.initiative ?? creatureMod(creature, 'dex')

const signed = (n: number) => (Number.isNaN(n) ? '?' : n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** "2d10+7", "2d10", "7" or '' : the damage of an action as one text. */
export function actionDamage(c: Character, a: CreatureAction): string {
  const bonus = a.damageBonus === undefined ? 0 : creatureNumber(c, a.damageBonus)
  const dice = a.damage?.replace(/\s+/g, '') ?? ''
  if (!dice) return bonus ? String(bonus) : ''
  return `${dice}${bonus ? signed(bonus) : ''}`
}

export interface ActionNumbers {
  /** "+10" */
  toHit?: string
  /** "2d10+7" */
  damage?: string
  damageType?: string
  /** "DEX save DC 18" is built by the screen from these two. */
  saveDc?: number
  saveAbility?: Ability
}

/** The numbers of one action, worked out for showing. */
export function actionNumbers(c: Character, a: CreatureAction): ActionNumbers {
  const out: ActionNumbers = {}
  if (a.toHit !== undefined) out.toHit = signed(creatureNumber(c, a.toHit))
  const dmg = actionDamage(c, a)
  if (dmg) out.damage = dmg
  if (a.damageType) out.damageType = a.damageType
  if (a.saveDc !== undefined) out.saveDc = creatureNumber(c, a.saveDc)
  if (a.saveAbility) out.saveAbility = a.saveAbility
  return out
}

/** The first action that is an attack roll (or, failing that, has damage): what the folded row shows. */
export const firstAttack = (creature: Creature): CreatureAction | undefined => creature.actions.find((a) => a.toHit !== undefined) ?? creature.actions.find((a) => !!a.damage)

/** Uses of one action left for one creature in play. */
export function actionUses(c: Character, a: CreatureAction, instance: CreatureInstance): { left: number; max: number } | undefined {
  if (!a.uses) return undefined
  const n = creatureNumber(c, a.uses.max)
  const max = Number.isNaN(n) ? 0 : Math.max(0, n)
  return { max, left: Math.max(0, max - Math.min(instance.used?.[a.id] ?? 0, max)) }
}

// ---------------- dice (the Roll button; the only place a creature's numbers meet chance) ----------------

export interface DiceRoll {
  total: number
  /** "2d10 (4, 9) + 7" */
  detail: string
}

/**
 * Rolls a dice text: "2d10", "2d10+7", "1d6 + 1d4 - 1". Anything that is not dice, a number, + or − makes it
 * unreadable: null, and the screen then shows no Roll button rather than a wrong number.
 */
export function rollDice(text: string, rng: () => number = Math.random): DiceRoll | null {
  const s = text.replace(/\s+/g, '').replace(/−/g, '-')
  if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(s)) return null
  let total = 0
  const parts: string[] = []
  for (const m of s.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/gi)) {
    const sign = m[1] === '-' ? -1 : 1
    let shown: string
    if (m[3] !== undefined) {
      const n = Math.min(100, Math.max(1, Number(m[2] || 1)))
      const sides = Math.max(1, Number(m[3]))
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(rng() * sides))
      total += sign * rolls.reduce((x, y) => x + y, 0)
      shown = `${n}d${sides} (${rolls.join(', ')})`
    } else {
      total += sign * Number(m[4])
      shown = m[4]
    }
    parts.push(parts.length ? `${sign < 0 ? '−' : '+'} ${shown}` : `${sign < 0 ? '−' : ''}${shown}`)
  }
  return { total, detail: parts.join(' ') }
}

export interface ActionRoll {
  attack?: { d20: number; total: number; bonus: number }
  damage?: DiceRoll
  /** A natural 20: the damage dice were rolled twice. */
  critical?: boolean
}

/** Whether an action has something the Roll button can roll. */
export function canRoll(c: Character, a: CreatureAction): boolean {
  if (a.toHit !== undefined && !Number.isNaN(creatureNumber(c, a.toHit))) return true
  return !!a.damage && rollDice(actionDamage(c, a).replace(/−/g, '-')) !== null
}

/** Rolls an action: d20 + the attack bonus, and the damage. A natural 20 rolls the damage DICE twice (the bonus once). */
export function rollAction(c: Character, a: CreatureAction, rng: () => number = Math.random): ActionRoll {
  const out: ActionRoll = {}
  const bonus = a.toHit === undefined ? NaN : creatureNumber(c, a.toHit)
  if (!Number.isNaN(bonus)) {
    const d20 = 1 + Math.floor(rng() * 20)
    out.attack = { d20, bonus, total: d20 + bonus }
    if (d20 === 20) out.critical = true
  }
  if (a.damage) {
    const dice = a.damage.replace(/\s+/g, '')
    const flat = a.damageBonus === undefined ? 0 : creatureNumber(c, a.damageBonus)
    const text = `${dice}${out.critical ? `+${dice.replace(/^[+-]/, '')}` : ''}${flat ? (flat > 0 ? `+${flat}` : `${flat}`) : ''}`
    const rolled = Number.isNaN(flat) ? null : rollDice(text, rng)
    if (rolled) out.damage = rolled
  }
  return out
}

// ---------------- writing: one canonical shape ----------------

const KEY_ORDER = {
  creature: ['id', 'name', 'kind', 'ac', 'hp', 'hitDice', 'speed', 'abilities', 'saves', 'initiative', 'skills', 'vulnerabilities', 'resistances', 'immunities', 'senses', 'languages', 'cr', 'actions', 'extra', 'description', 'inPlay'],
  action: ['id', 'name', 'activation', 'toHit', 'damage', 'damageBonus', 'damageType', 'saveDc', 'saveAbility', 'uses', 'description'],
  instance: ['id', 'label', 'hp', 'conditions', 'used', 'note'],
} as const
// never left out, even when empty
const ALWAYS = new Set(['id', 'name', 'ac', 'hp', 'speed', 'abilities', 'actions', 'activation', 'description:action'])

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) ? v.length === 0 : typeof v === 'object' && Object.keys(v as object).length === 0)

function ordered<T extends object>(o: T, order: readonly string[], kind: string): T {
  const src = o as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of order) if (k in src && (ALWAYS.has(k) || ALWAYS.has(`${k}:${kind}`) || !isEmpty(src[k]))) out[k] = src[k]
  // fields the app does not know (kept from the file) stay, after its own
  for (const k of Object.keys(src)) if (!(order as readonly string[]).includes(k) && src[k] !== undefined) out[k] = src[k]
  return out as T
}

/**
 * A stat block as it is stored: its fields in one fixed order, and every optional one that is empty left out.
 * The importer and the editor both end here, so a hero exported by the app reads back character for character.
 */
export function tidyCreature(k: Creature): Creature {
  return ordered(
    {
      ...k,
      actions: k.actions.map((a) => ordered({ ...a, ...(a.damageBonus === 0 ? { damageBonus: undefined } : {}) }, KEY_ORDER.action, 'action')),
      ...(k.saves ? { saves: Object.fromEntries(ABILITIES.filter((a) => k.saves![a] !== undefined).map((a) => [a, k.saves![a]])) } : {}),
      ...(k.extra ? { extra: k.extra.filter((x) => x.label.trim() || x.value.trim()) } : {}),
      ...(k.inPlay ? { inPlay: k.inPlay.map(tidyInstance) } : {}),
    },
    KEY_ORDER.creature,
    'creature',
  )
}

function tidyInstance(i: CreatureInstance): CreatureInstance {
  const used = i.used ? Object.fromEntries(Object.entries(i.used).filter(([, n]) => n > 0)) : undefined
  return ordered({ ...i, used, ...(i.note !== undefined && !i.note.trim() ? { note: undefined } : {}) }, KEY_ORDER.instance, 'instance')
}

/** The character with this list of creatures: the field is absent when the list is empty, and pins to creatures that are gone are dropped. */
function withCreatures(c: Character, list: Creature[]): Character {
  // the field stands where the importer puts it (before `recipes`), so an export reads back character for character
  const out: Record<string, unknown> = {}
  let placed = !list.length
  for (const [key, value] of Object.entries(c)) {
    if (key === 'creatures') {
      if (list.length) out.creatures = list
      placed = true
      continue
    }
    if (key === 'recipes' && !placed) {
      out.creatures = list
      placed = true
    }
    out[key] = value
  }
  if (!placed) out.creatures = list
  let next = out as unknown as Character
  const pinned = next.preferences.creatures?.pinned
  if (pinned) {
    const alive = new Set(creaturesInPlay(next).map((x) => x.instance.id))
    if (pinned.some((id) => !alive.has(id))) next = withCreaturePrefs(next, { ...next.preferences.creatures, pinned: pinned.filter((id) => alive.has(id)) })
  }
  return next
}

const mapCreature = (c: Character, id: string, fn: (k: Creature) => Creature): Character => {
  const list = creatureList(c)
  const i = list.findIndex((k) => k.id === id)
  if (i < 0) return c
  const next = fn(list[i])
  return next === list[i] ? c : withCreatures(c, list.map((k, j) => (j === i ? tidyCreature(next) : k)))
}

const mapInstance = (c: Character, instanceId: string, fn: (i: CreatureInstance, k: Creature) => CreatureInstance): Character => {
  const hit = findInPlay(c, instanceId)
  if (!hit) return c
  const next = fn(hit.instance, hit.creature)
  return next === hit.instance ? c : mapCreature(c, hit.creature.id, (k) => ({ ...k, inPlay: (k.inPlay ?? []).map((x) => (x.id === instanceId ? next : x)) }))
}

// ---------------- stat blocks ----------------

export function blankCreature(): Creature {
  return { id: newId(), name: '', ac: 10, hp: 10, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, actions: [] }
}

export function blankAction(activation: CreatureAction['activation'] = 'action'): CreatureAction {
  return { id: newId(), name: '', activation, description: '' }
}

/**
 * The Mammoth of SRD 5.2.1 ("Animals"; the 2024 rules), as a starting point: it is copied into the hero and
 * then it is the player's, to change to the numbers their table plays (the 2014 mammoth is another block).
 * System Reference Document 5.2.1, (c) Wizards of the Coast LLC, CC-BY-4.0.
 */
export function mammothExample(): Creature {
  return tidyCreature({
    id: newId(),
    name: 'Mammoth',
    kind: 'Huge Beast, Unaligned',
    ac: 13,
    hp: 126,
    hitDice: '11d12 + 55',
    speed: '50 ft.',
    abilities: { str: 24, dex: 9, con: 21, int: 3, wis: 11, cha: 6 },
    saves: { str: 10, con: 8 },
    initiative: 2,
    senses: 'Passive Perception 10',
    languages: 'None',
    cr: '6 (XP 2,300; PB +3)',
    actions: [
      { id: newId(), name: 'Multiattack', activation: 'action', description: 'The mammoth makes two Gore attacks.' },
      {
        id: newId(),
        name: 'Gore',
        activation: 'action',
        toHit: 10,
        damage: '2d10',
        damageBonus: 7,
        damageType: 'Piercing',
        description:
          'Melee Attack Roll: +10, reach 10 ft. Hit: 18 (2d10 + 7) Piercing damage. If the target is a Huge or smaller creature and the mammoth moved 20+ feet straight toward it immediately before the hit, the target has the Prone condition.',
      },
      {
        id: newId(),
        name: 'Trample',
        activation: 'bonus',
        damage: '4d10',
        damageBonus: 7,
        damageType: 'Bludgeoning',
        saveDc: 18,
        saveAbility: 'dex',
        description: 'Dexterity Saving Throw: DC 18, one creature within 5 feet that has the Prone condition. Failure: 29 (4d10 + 7) Bludgeoning damage. Success: Half damage.',
      },
    ],
    description: 'From SRD 5.2.1 (the 2024 rules). A starting point: change any number to what your table plays.',
  })
}

/**
 * Adds a stat block, or replaces the one with the same id. The creatures in play are the character's own, not
 * the editor's copy (it may be older). When the stat block's Hit Points change, the creatures in play that
 * still had the old maximum follow it (a wrong number fixed once is fixed for all); one whose maximum was set
 * by hand keeps its own.
 */
export function saveCreature(c: Character, creature: Creature): Character {
  const list = creatureList(c)
  const old = list.find((k) => k.id === creature.id)
  if (!old) return withCreatures(c, [...list, tidyCreature(creature)])
  const before = creatureHpMax(c, old)
  const after = creatureHpMax(c, creature)
  const actionIds = new Set(creature.actions.filter((a) => a.uses).map((a) => a.id))
  const inPlay = old.inPlay?.map((i) => {
    const hp = i.hp.max === before && after !== before ? { ...i.hp, max: after, current: i.hp.current === before ? after : Math.min(i.hp.current, after) } : i.hp
    // what was spent of an action that is gone, or lost its limit, goes with it
    const used = i.used ? Object.fromEntries(Object.entries(i.used).filter(([id]) => actionIds.has(id))) : undefined
    return { ...i, hp, used }
  })
  return withCreatures(c, list.map((k) => (k.id === creature.id ? tidyCreature({ ...creature, inPlay }) : k)))
}

/** Removes a stat block and every creature of it in play. */
export function deleteCreature(c: Character, id: string): Character {
  const list = creatureList(c)
  return list.some((k) => k.id === id) ? withCreatures(c, list.filter((k) => k.id !== id)) : c
}

/** A copy of a stat block with new ids and nothing in play, right after the original: the start of a variant. */
export function duplicateCreature(c: Character, id: string, name?: string): Character {
  const list = creatureList(c)
  const i = list.findIndex((k) => k.id === id)
  if (i < 0) return c
  const { inPlay: _none, ...block } = list[i]
  void _none
  const copy = tidyCreature({ ...block, id: newId(), name: name ?? `${block.name} (copy)`, actions: block.actions.map((a) => ({ ...a, id: newId() })) })
  return withCreatures(c, [...list.slice(0, i + 1), copy, ...list.slice(i + 1)])
}

/** Moves a stat block one place up or down in the list. */
export function moveCreature(c: Character, id: string, d: -1 | 1): Character {
  const list = [...creatureList(c)]
  const i = list.findIndex((k) => k.id === id)
  const j = i + d
  if (i < 0 || j < 0 || j >= list.length) return c
  ;[list[i], list[j]] = [list[j], list[i]]
  return withCreatures(c, list)
}

// ---------------- creatures in play ----------------

/** The label of the next creature of a kind: none for the first, then "2", "3"... (the first number not taken). */
function nextLabel(inPlay: readonly CreatureInstance[]): string | undefined {
  if (!inPlay.length) return undefined
  const taken = new Set(inPlay.map((i) => i.label ?? ''))
  let n = inPlay.length + 1
  while (taken.has(String(n))) n++
  return String(n)
}

/**
 * Puts `count` new creatures of a stat block in play, each at the stat block's full Hit Points. They are shown
 * in Play, also when the player had hidden others from it. Returns the same character when the block is gone.
 */
export function addToPlay(c: Character, creatureId: string, count = 1, label?: string): Character {
  const creature = creatureList(c).find((k) => k.id === creatureId)
  if (!creature) return c
  const max = creatureHpMax(c, creature)
  const inPlay = [...(creature.inPlay ?? [])]
  const made: string[] = []
  for (let n = 0; n < Math.max(1, Math.min(50, Math.floor(count))); n++) {
    const own = n === 0 && label?.trim() ? label.trim() : nextLabel(inPlay)
    const inst: CreatureInstance = { id: newId(), ...(own ? { label: own } : {}), hp: { current: max, max, temp: 0 } }
    inPlay.push(inst)
    made.push(inst.id)
  }
  let next = mapCreature(c, creatureId, (k) => ({ ...k, inPlay }))
  const pinned = next.preferences.creatures?.pinned
  if (pinned) next = withCreaturePrefs(next, { ...next.preferences.creatures, pinned: [...pinned, ...made] })
  return next
}

/** Takes one creature out of play. Its stat block stays. */
export function removeFromPlay(c: Character, instanceId: string): Character {
  const hit = findInPlay(c, instanceId)
  if (!hit) return c
  return mapCreature(c, hit.creature.id, (k) => ({ ...k, inPlay: (k.inPlay ?? []).filter((i) => i.id !== instanceId) }))
}

const whole = (n: number) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))

/** Damage to one creature: Temporary Hit Points first, then Hit Points, never below 0. (No death saves: a creature at 0 stays in the list until it is removed.) */
export function damageCreature(c: Character, instanceId: string, amount: number): Character {
  const n = whole(amount)
  if (!n) return c
  return mapInstance(c, instanceId, (i) => {
    const fromTemp = Math.min(i.hp.temp, n)
    return { ...i, hp: { ...i.hp, temp: i.hp.temp - fromTemp, current: Math.max(0, i.hp.current - (n - fromTemp)) } }
  })
}

/** Healing, up to the creature's maximum. */
export function healCreature(c: Character, instanceId: string, amount: number): Character {
  const n = whole(amount)
  if (!n) return c
  return mapInstance(c, instanceId, (i) => (i.hp.current >= i.hp.max ? i : { ...i, hp: { ...i.hp, current: Math.min(i.hp.max, i.hp.current + n) } }))
}

/** Temporary Hit Points do not stack: the higher of the old and the new amount stays (as for the hero). 0 clears them. */
export function tempHpCreature(c: Character, instanceId: string, amount: number): Character {
  const n = whole(amount)
  return mapInstance(c, instanceId, (i) => {
    const temp = n === 0 ? 0 : Math.max(i.hp.temp, n)
    return temp === i.hp.temp ? i : { ...i, hp: { ...i.hp, temp } }
  })
}

/** Sets one creature's own Hit Point maximum (the GM rolled its Hit Points; it grew). The current ones never exceed it. */
export function setCreatureHpMax(c: Character, instanceId: string, max: number): Character {
  const m = Math.max(1, whole(max))
  return mapInstance(c, instanceId, (i) => (i.hp.max === m ? i : { ...i, hp: { ...i.hp, max: m, current: Math.min(i.hp.current, m) } }))
}

/** Sets the current Hit Points directly (a correction), between 0 and the maximum. */
export function setCreatureHp(c: Character, instanceId: string, current: number): Character {
  return mapInstance(c, instanceId, (i) => {
    const n = Math.min(i.hp.max, whole(current))
    return n === i.hp.current ? i : { ...i, hp: { ...i.hp, current: n } }
  })
}

/** The creature's own name or number ("Burya", "2"); empty = none. */
export function setCreatureLabel(c: Character, instanceId: string, label: string): Character {
  const l = label.trim()
  return mapInstance(c, instanceId, (i) => ((i.label ?? '') === l ? i : { ...i, label: l || undefined }))
}

export function setCreatureNote(c: Character, instanceId: string, note: string): Character {
  return mapInstance(c, instanceId, (i) => ((i.note ?? '') === note ? i : { ...i, note: note || undefined }))
}

/** Puts a condition on a creature or takes it off. `condition`: an SRD condition id, or any text. */
export function toggleCreatureCondition(c: Character, instanceId: string, condition: string): Character {
  const id = condition.trim()
  if (!id) return c
  return mapInstance(c, instanceId, (i) => {
    const now = i.conditions ?? []
    return { ...i, conditions: now.includes(id) ? now.filter((x) => x !== id) : [...now, id] }
  })
}

/** Spends (delta 1) or gives back (delta -1) uses of one action for one creature in play, within 0 and the maximum. */
export function spendCreatureAction(c: Character, instanceId: string, actionId: string, delta = 1): Character {
  return mapInstance(c, instanceId, (i, k) => {
    const a = k.actions.find((x) => x.id === actionId)
    const u = a && actionUses(c, a, i)
    if (!a || !u) return i
    const used = Math.max(0, Math.min(u.max, (u.max - u.left) + delta))
    if (used === (i.used?.[actionId] ?? 0)) return i
    return { ...i, used: { ...(i.used ?? {}), [actionId]: used } }
  })
}

/** Changes every creature in play at once (a rest). Returns the same character when nothing changed. */
export function mapAllInPlay(c: Character, fn: (i: CreatureInstance, k: Creature) => CreatureInstance): Character {
  let changed = false
  const list = creatureList(c).map((k) => {
    if (!k.inPlay?.length) return k
    const inPlay = k.inPlay.map((i) => fn(i, k))
    if (inPlay.every((x, j) => x === k.inPlay![j])) return k
    changed = true
    return tidyCreature({ ...k, inPlay })
  })
  return changed ? withCreatures(c, list) : c
}
