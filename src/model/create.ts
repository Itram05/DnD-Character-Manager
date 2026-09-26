// Quick character creation: turns the choices on the "New character" screen into a level 1 character.
// Rules: SRD 5.2.1 "Character Creation" (2024). Ability score increases come from the BACKGROUND
// (+2/+1 or +1/+1/+1 among its three abilities, max 20), not from the species.
// Out of scope on purpose (done later in the sheet tabs): class skill choices, equipment, spells.
import { SRD_SPECIES, srdClass } from '../data/srd'
import {
  GIANT_BOON_ACTIVATION,
  POINT_BUY_TOTAL,
  POINT_COST,
  SPECIES_TRAIT_PRESETS,
  STANDARD_ARRAY,
  backgroundInfo,
  plain,
  speciesChoice,
  speciesSizes,
} from '../data/srdOrigins'
import { applyLevelUp, planLevelUp } from './levelup'
import { blankCharacter, newId } from './normalize'
import { abilityMod } from './rules'
import { ABILITIES, SKILL_IDS, type Ability, type Character, type Feature, type SkillId, type Activation, type Uses } from './types'

export const CUSTOM = 'custom'
export type ScoreMethod = 'standard' | 'pointBuy' | 'manual'

export interface CreateChoices {
  name: string
  /** SRD class id, or CUSTOM. */
  classId: string
  customClass?: { name: string; hitDie: number; text: string }
  /** SRD background name, or CUSTOM. */
  background: string
  customBackground?: { name: string; text: string }
  /** SRD species name, or CUSTOM. */
  species: string
  customSpecies?: { name: string; size: string; speed: number; text: string }
  /** Ancestry / lineage / legacy option name (Dragonborn, Elf, Gnome, Goliath, Tiefling). */
  speciesOption?: string
  /** For species that let you pick (Human, Tiefling). */
  size?: string
  method: ScoreMethod
  /** Scores BEFORE the background increase. */
  scores: Record<Ability, number>
  /** Background increase, e.g. { wis: 2, cha: 1 } or { int: 1, wis: 1, cha: 1 }. */
  bonus: Partial<Record<Ability, number>>
}

/** Validation problems. The UI shows them with t('create.err.<code>'). */
export type CreateError =
  | 'class'
  | 'customClass'
  | 'background'
  | 'customBackground'
  | 'species'
  | 'customSpecies'
  | 'speciesOption'
  | 'standardArray'
  | 'pointBuy'
  | 'manualRange'
  | 'bonus'

/** A line of the "still to do after creating" list. The UI shows it with t(key, params). */
export interface TodoItem {
  key: string
  params?: Record<string, string | number>
}

// ---------------- ability scores ----------------

/** Points spent, or NaN if a score is outside 8-15. */
export function pointBuyCost(scores: Record<Ability, number>): number {
  return ABILITIES.reduce((s, a) => s + (POINT_COST[scores[a]] ?? NaN), 0)
}

export function isStandardArray(scores: Record<Ability, number>): boolean {
  return [...ABILITIES.map((a) => scores[a])].sort((a, b) => b - a).join() === [...STANDARD_ARRAY].join()
}

/** The three abilities the background may raise (all six for a custom background). */
export function bonusAbilities(ch: Pick<CreateChoices, 'background'>): Ability[] {
  if (ch.background === CUSTOM) return [...ABILITIES]
  return backgroundInfo(ch.background)?.abilities ?? []
}

/** +2 and +1 on two different abilities, or +1 on three, all among the allowed ones. */
export function bonusValid(bonus: Partial<Record<Ability, number>>, allowed: Ability[]): boolean {
  const entries = Object.entries(bonus).filter(([, v]) => v) as [Ability, number][]
  if (entries.some(([a]) => !allowed.includes(a))) return false
  const vals = entries.map(([, v]) => v).sort((a, b) => b - a).join()
  return vals === '2,1' || vals === '1,1,1'
}

/** Final scores: base + background increase, never above 20. */
export function finalScores(ch: Pick<CreateChoices, 'scores' | 'bonus'>): Record<Ability, number> {
  return Object.fromEntries(ABILITIES.map((a) => [a, Math.min(20, ch.scores[a] + (ch.bonus[a] ?? 0))])) as Record<Ability, number>
}

export function validateChoices(ch: CreateChoices): CreateError[] {
  const errors: CreateError[] = []
  if (!ch.classId) errors.push('class')
  else if (ch.classId === CUSTOM) {
    if (!ch.customClass?.name.trim()) errors.push('customClass')
  } else if (!srdClass(ch.classId)) errors.push('class')

  if (!ch.background) errors.push('background')
  else if (ch.background === CUSTOM) {
    if (!ch.customBackground?.name.trim()) errors.push('customBackground')
  } else if (!backgroundInfo(ch.background)) errors.push('background')

  if (!ch.species) errors.push('species')
  else if (ch.species === CUSTOM) {
    if (!ch.customSpecies?.name.trim()) errors.push('customSpecies')
  } else if (!SRD_SPECIES.some((s) => s.name === ch.species)) errors.push('species')
  else {
    const choice = speciesChoice(ch.species)
    if (choice && !choice.options.some((o) => o.name === ch.speciesOption)) errors.push('speciesOption')
  }

  if (ch.method === 'standard' && !isStandardArray(ch.scores)) errors.push('standardArray')
  if (ch.method === 'pointBuy') {
    const cost = pointBuyCost(ch.scores)
    if (!Number.isFinite(cost) || cost > POINT_BUY_TOTAL) errors.push('pointBuy')
  }
  if (ch.method === 'manual' && ABILITIES.some((a) => !Number.isInteger(ch.scores[a]) || ch.scores[a] < 1 || ch.scores[a] > 20)) errors.push('manualRange')

  if (ch.background && !bonusValid(ch.bonus, bonusAbilities(ch))) errors.push('bonus')
  return errors
}

// ---------------- build ----------------

const skillIdFromName = (name: string): SkillId | undefined => {
  const key = name.replace(/\s+(\w)/g, (_, c: string) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase())
  return SKILL_IDS.find((id) => id.toLowerCase() === key.toLowerCase())
}

const joinText = (...parts: string[]) => parts.map((p) => p.trim()).filter((p) => p && p.toLowerCase() !== 'none').join('; ')

/**
 * Builds a complete level 1 character. Throws if the choices are invalid (call validateChoices first).
 * Returns the character and a list of things the player still has to do by hand.
 */
export function buildCharacter(ch: CreateChoices, fallbackName = 'New hero'): { character: Character; todo: TodoItem[] } {
  const errors = validateChoices(ch)
  if (errors.length) throw new Error(`Invalid choices: ${errors.join(', ')}`)
  const todo: TodoItem[] = []
  const abilities = finalScores(ch)
  const conMod = abilityMod(abilities.con)

  // ----- species (needed first: Dwarven Toughness changes HP) -----
  const srdSpecies = SRD_SPECIES.find((s) => s.name === ch.species)
  const choice = srdSpecies ? speciesChoice(srdSpecies.name) : undefined
  const option = choice?.options.find((o) => o.name === ch.speciesOption)
  const sizes = srdSpecies ? speciesSizes(srdSpecies.name) : []
  const species = srdSpecies
    ? {
        name: option ? `${srdSpecies.name} (${option.name.replace(/\s*\(.*\)$/, '')})` : srdSpecies.name,
        size: ch.size && sizes.includes(ch.size) ? ch.size : sizes[0],
      }
    : { name: ch.customSpecies!.name.trim(), size: ch.customSpecies!.size || 'Medium' }
  const speed = srdSpecies ? (option?.speed ?? srdSpecies.speed) : ch.customSpecies!.speed || 30
  const dwarf = srdSpecies?.name === 'Dwarf' ? 1 : 0

  // ----- base character with no class yet -----
  let c: Character = blankCharacter(ch.name.trim() || fallbackName)
  c = {
    ...c,
    classes: [],
    abilities,
    species,
    background: ch.background === CUSTOM ? ch.customBackground!.name.trim() : (backgroundInfo(ch.background)?.name ?? ''),
    combat: { ...c.combat, speed, hp: { current: 0, max: 0, temp: 0 } },
  }

  // ----- class level 1 -----
  const cls = ch.classId === CUSTOM ? undefined : srdClass(ch.classId)
  if (cls) {
    const plan = planLevelUp(c, cls.id)
    const hpGain = Math.max(1, plan.hitDie + conMod + dwarf)
    c = applyLevelUp(c, plan, { hpGain, selected: plan.features.map((f) => f.key), extraFeatures: [] })
    const tools = cls.toolProficiencies ? plain(cls.toolProficiencies) : ''
    c = {
      ...c,
      proficiencies: {
        ...c.proficiencies,
        savingThrows: [...cls.savingThrows],
        armor: cls.armorTraining.toLowerCase() === 'none' ? '' : cls.armorTraining,
        weapons: cls.weaponProficiencies,
        tools,
        languages: 'Common',
      },
    }
    // Unarmored Defense changes the AC formula.
    if (cls.id === 'barbarian') c.combat = { ...c.combat, unarmoredAc: '10 + dex + con' }
    if (cls.id === 'monk') c.combat = { ...c.combat, unarmoredAc: '10 + dex + wis' }
    todo.push({ key: 'create.todo.classSkills', params: { text: plain(cls.skillProficiencies) } })
    for (const d of plan.decisions) todo.push({ key: 'create.todo.raw', params: { text: d } })
    if (tools && /choose/i.test(tools)) todo.push({ key: 'create.todo.tools', params: { text: tools } })
  } else {
    const cc = ch.customClass!
    const name = cc.name.trim()
    const hitDie = Math.min(12, Math.max(4, Math.round(cc.hitDie || 8)))
    const hp = Math.max(1, hitDie + conMod + dwarf)
    c = {
      ...c,
      classes: [{ id: name.toLowerCase(), name, level: 1, hitDie }],
      combat: { ...c.combat, hp: { current: hp, max: hp, temp: 0 } },
      proficiencies: { ...c.proficiencies, languages: 'Common' },
    }
    if (cc.text.trim()) c.features = [...c.features, feature(name, { type: 'class', name: `${name} 1` }, cc.text, 1)]
    todo.push({ key: 'create.todo.customClass', params: { name } })
  }

  // ----- species traits -----
  if (srdSpecies) {
    for (const tr of srdSpecies.traits) {
      const preset = SPECIES_TRAIT_PRESETS[`${srdSpecies.name}:${tr.name}`]
      const later = preset?.fromLevel && preset.fromLevel > 1
      let name = tr.name
      let text = tr.text
      let activation: Activation = later ? 'passive' : (preset?.activation ?? 'passive')
      let uses: Uses | undefined = !later && preset?.uses ? { ...preset.uses, used: 0 } : undefined
      if (choice && tr.name === choice.trait && option) {
        text = `${text}\n\n**${option.name}.** ${option.text}`
        if (srdSpecies.name === 'Goliath') {
          // the chosen boon is the usable part: PB uses per Long Rest
          name = `${tr.name}: ${option.name.replace(/\s*\(.*\)$/, '')}`
          text = `${option.text}\n\nYou can use this a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest.`
          activation = GIANT_BOON_ACTIVATION[option.name] ?? 'free'
          uses = { max: 'pb', recharge: 'long', used: 0 }
        }
      }
      // Dragonborn: the ancestry decides the damage type of two other traits
      if (srdSpecies.name === 'Dragonborn' && option && (tr.name === 'Breath Weapon' || tr.name === 'Damage Resistance'))
        text = `${text}\n\n**${option.name}:** ${option.text}`
      c.features = [...c.features, { ...feature(name, { type: 'species', name: srdSpecies.name }, text, later ? preset!.fromLevel! : 1), activation, ...(uses ? { uses } : {}) }]
    }
    if (choice && option && ['Elf', 'Gnome', 'Tiefling'].includes(srdSpecies.name))
      todo.push({ key: 'create.todo.speciesSpells', params: { trait: choice.trait, option: option.name } })
    if (srdSpecies.name === 'Elf') todo.push({ key: 'create.todo.keenSenses' })
    if (srdSpecies.name === 'Human') todo.push({ key: 'create.todo.human' })
  } else {
    const cs = ch.customSpecies!
    if (cs.text.trim()) c.features = [...c.features, feature(cs.name.trim(), { type: 'species', name: cs.name.trim() }, cs.text, 1)]
  }

  // ----- background: skills, tool, feat -----
  if (ch.background === CUSTOM) {
    const cb = ch.customBackground!
    if (cb.text.trim()) c.features = [...c.features, feature(cb.name.trim(), { type: 'background', name: cb.name.trim() }, cb.text, 1)]
    todo.push({ key: 'create.todo.customBackground' })
  } else {
    const bg = backgroundInfo(ch.background)!
    const skills = { ...c.proficiencies.skills }
    for (const s of bg.skills) {
      const id = skillIdFromName(s)
      if (id) skills[id] = 'proficient'
    }
    c.proficiencies = { ...c.proficiencies, skills, tools: joinText(c.proficiencies.tools, bg.tool) }
    if (/choose/i.test(bg.tool)) todo.push({ key: 'create.todo.tools', params: { text: bg.tool } })
    if (bg.featText) {
      const featText = bg.featText.replace(/^_Origin Feat_\s*/, '')
      c.features = [...c.features, feature(bg.feat, { type: 'feat', name: `${bg.name} background` }, featText, 1)]
      if (bg.featBase === 'Magic Initiate') todo.push({ key: 'create.todo.magicInitiate', params: { feat: bg.feat } })
      if (bg.featBase === 'Alert') todo.push({ key: 'create.todo.alert' })
    }
    todo.push({ key: 'create.todo.equipment', params: { text: bg.equipment } })
  }
  if (ch.classId !== CUSTOM) todo.push({ key: 'create.todo.classEquipment' })
  todo.push({ key: 'create.todo.languages' })

  return { character: { ...c, updatedAt: new Date().toISOString() }, todo }
}

function feature(name: string, source: Feature['source'], description: string, level: number): Feature {
  return { id: newId(), name, source, activation: 'passive', description, level }
}
