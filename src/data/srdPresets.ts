// How SRD 5.2.1 class features behave at the table: activation and limited uses.
// Each entry was checked against the feature text in src/data/srd/classes.json.
// Key: "<classId>:<Feature Name>" or "<classId>/<subclassId>:<Feature Name>".
// Features not listed here get an activation guessed from their text (guessActivation).
import type { Activation, Uses } from '../model/types'

export interface FeaturePreset {
  activation: Activation
  uses?: Omit<Uses, 'used'>
  /** When this feature is gained, change another feature already on the sheet. */
  patch?: { target: string; uses: Partial<Uses> }
}

export const SRD_PRESETS: Record<string, FeaturePreset> = {
  // Barbarian
  'barbarian:Rage': { activation: 'bonus', uses: { max: 'barbarian.rages', recharge: 'long', shortRestRegain: 1 } },
  'barbarian:Reckless Attack': { activation: 'free' },
  'barbarian:Unarmored Defense': { activation: 'passive' },
  // Bard
  'bard:Bardic Inspiration': { activation: 'bonus', uses: { max: 'max(1, cha)', recharge: 'long' } },
  'bard:Font of Inspiration': { activation: 'passive', patch: { target: 'Bardic Inspiration', uses: { recharge: 'short' } } },
  'bard:Countercharm': { activation: 'reaction' },
  'bard/college-of-lore:Cutting Words': { activation: 'reaction' },
  // Cleric
  'cleric:Channel Divinity': { activation: 'action', uses: { max: 'cleric.channel-divinity', recharge: 'long', shortRestRegain: 1 } },
  'cleric:Divine Intervention': { activation: 'action', uses: { max: 1, recharge: 'long' } },
  'cleric/life-domain:Preserve Life': { activation: 'action' },
  // Druid
  'druid:Wild Shape': { activation: 'bonus', uses: { max: 'druid.wild-shape', recharge: 'long', shortRestRegain: 1 } },
  'druid:Wild Companion': { activation: 'action' },
  'druid/circle-of-the-land:Natural Recovery': { activation: 'special', uses: { max: 1, recharge: 'long' } },
  // Fighter
  'fighter:Second Wind': { activation: 'bonus', uses: { max: 'fighter.second-wind', recharge: 'long', shortRestRegain: 1 } },
  // "Starting at level 17, you can use it twice before a rest"
  'fighter:Action Surge': { activation: 'free', uses: { max: 'min(2, 1 + floor(fighter / 17))', recharge: 'short' } },
  // 1 use at 9, 2 at 13, 3 at 17
  'fighter:Indomitable': { activation: 'free', uses: { max: 'floor((fighter - 5) / 4)', recharge: 'long' } },
  'fighter:Tactical Mind': { activation: 'free' },
  // Monk
  "monk:Monk's Focus": { activation: 'special', uses: { max: 'monk.focus-points', recharge: 'short' } },
  'monk:Uncanny Metabolism': { activation: 'free', uses: { max: 1, recharge: 'long' } },
  'monk/warrior-of-the-open-hand:Wholeness of Body': { activation: 'bonus', uses: { max: 'max(1, wis)', recharge: 'long' } },
  // Paladin
  'paladin:Lay On Hands': { activation: 'bonus', uses: { max: 'paladin * 5', recharge: 'long', note: 'HP pool' } },
  'paladin:Channel Divinity': { activation: 'action', uses: { max: 'paladin.channel-divinity', recharge: 'long', shortRestRegain: 1 } },
  'paladin:Aura of Protection': { activation: 'passive' },
  // Ranger
  'ranger:Favored Enemy': { activation: 'special', uses: { max: 'ranger.favored-enemy', recharge: 'long', note: "Hunter's Mark without a slot" } },
  'ranger:Tireless': { activation: 'action', uses: { max: 'max(1, wis)', recharge: 'long' } },
  "ranger:Nature's Veil": { activation: 'bonus', uses: { max: 'max(1, wis)', recharge: 'long' } },
  // Rogue
  'rogue:Sneak Attack': { activation: 'free' },
  'rogue:Cunning Action': { activation: 'bonus' },
  'rogue:Steady Aim': { activation: 'bonus' },
  'rogue:Uncanny Dodge': { activation: 'reaction' },
  'rogue:Stroke of Luck': { activation: 'free', uses: { max: 1, recharge: 'short' } },
  // Sorcerer
  'sorcerer:Innate Sorcery': { activation: 'bonus', uses: { max: 2, recharge: 'long' } },
  'sorcerer:Font of Magic': { activation: 'special', uses: { max: 'sorcerer.sorcery-points', recharge: 'long', note: 'Sorcery Points', resource: 'sorcery-points' } },
  // Warlock
  'warlock:Magical Cunning': { activation: 'special', uses: { max: 1, recharge: 'long' } },
  // one arcanum at 11, 13, 15 and 17
  'warlock:Mystic Arcanum': { activation: 'action', uses: { max: 'min(4, floor((warlock - 9) / 2))', recharge: 'long' } },
  "warlock/fiend-patron:Dark One's Own Luck": { activation: 'free', uses: { max: 'max(1, cha)', recharge: 'long' } },
  // Wizard
  'wizard:Arcane Recovery': { activation: 'special', uses: { max: 1, recharge: 'long' } },
  // Informational / always-on
  'bard:Spellcasting': { activation: 'passive' },
  'cleric:Spellcasting': { activation: 'passive' },
  'druid:Spellcasting': { activation: 'passive' },
  'paladin:Spellcasting': { activation: 'passive' },
  'ranger:Spellcasting': { activation: 'passive' },
  'sorcerer:Spellcasting': { activation: 'passive' },
  'wizard:Spellcasting': { activation: 'passive' },
  'warlock:Pact Magic': { activation: 'passive' },
  'warlock:Eldritch Invocations': { activation: 'passive' },
}

/** Best guess from the feature text. Shown to the user as editable. */
export function guessActivation(text: string): Activation {
  const t = text.slice(0, 600)
  if (/\bas a bonus action\b/i.test(t)) return 'bonus'
  if (/\b(take|use) (a|your) reaction\b|\bas a reaction\b/i.test(t)) return 'reaction'
  if (/\b(as|take) (a|the) magic action\b|\bas an action\b|\btake an action\b/i.test(t)) return 'action'
  return 'passive'
}

export function presetFor(classId: string, subclassId: string | undefined, name: string): FeaturePreset | undefined {
  return (subclassId && SRD_PRESETS[`${classId}/${subclassId}:${name}`]) || SRD_PRESETS[`${classId}:${name}`]
}
