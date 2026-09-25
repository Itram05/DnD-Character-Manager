// Typed access to the generated SRD 5.2.1 data (see scripts/build-srd-data.mjs).
import classesJson from './srd/classes.json'
import conditionsJson from './srd/conditions.json'
import glossaryJson from './srd/glossary.json'
import featsJson from './srd/feats.json'
import originsJson from './srd/origins.json'
import type { Ability } from '../model/types'

export interface SrdFeature {
  level: number
  name: string
  text: string
}
export interface SrdSubclass {
  id: string
  name: string
  description: string
  features: SrdFeature[]
}
export interface SrdTableRow {
  level: number
  features: string[]
  values: Record<string, string>
}
export interface SrdClass {
  id: string
  name: string
  primaryAbility: Ability[]
  primaryAbilityText: string
  primaryAbilityMode: 'any' | 'all'
  hitDie: number
  savingThrows: Ability[]
  skillProficiencies: string
  weaponProficiencies: string
  toolProficiencies: string
  armorTraining: string
  multiclassGains: string
  spellcasting: { ability: Ability | null; type: 'full' | 'half' | 'pact' } | null
  subclassLevel: number
  columns: { key: string; label: string }[]
  table: SrdTableRow[]
  features: SrdFeature[]
  subclasses: SrdSubclass[]
  optionGroups: { name: string; options: { name: string; text: string }[] }[]
}
export interface SrdSpell {
  name: string
  level: number
  school: string
  classes: string[]
  castingTime: string
  ritual: boolean
  range: string
  components: string
  duration: string
  concentration: boolean
  text: string
}
export interface SrdEntry {
  name: string
  text: string
}

export const SRD_CLASSES = classesJson.data as unknown as SrdClass[]
export const SRD_CONDITIONS = conditionsJson.data as { id: string; name: string; text: string }[]
export const SRD_GLOSSARY = glossaryJson.data as SrdEntry[]
export const SRD_FEATS = featsJson.data as { name: string; category: string; text: string }[]
export const SRD_SPECIES = originsJson.data.species as { name: string; speed: number; text: string; traits: SrdEntry[] }[]
export const SRD_BACKGROUNDS = originsJson.data.backgrounds as SrdEntry[]
export const SRD_META = classesJson.meta

export function srdClass(id: string | undefined): SrdClass | undefined {
  if (!id) return undefined
  const key = id.toLowerCase()
  return SRD_CLASSES.find((c) => c.id === key || c.name.toLowerCase() === key)
}

export function srdSubclass(cls: SrdClass | undefined, name: string | undefined): SrdSubclass | undefined {
  if (!cls || !name) return undefined
  const key = name.toLowerCase()
  return cls.subclasses.find((s) => s.id === key || s.name.toLowerCase() === key)
}

export function glossary(name: string): string {
  return SRD_GLOSSARY.find((g) => g.name === name)?.text ?? ''
}

// Spells are ~350 KB, so they load on demand (only the spell picker needs them).
let spellsPromise: Promise<SrdSpell[]> | null = null
export function loadSrdSpells(): Promise<SrdSpell[]> {
  if (!spellsPromise) spellsPromise = import('./srd/spells.json').then((m) => m.default.data as SrdSpell[])
  return spellsPromise
}

/** Official attribution text required by the SRD 5.2.1 license (copied verbatim from its Legal Information page). */
export const SRD_ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.'
