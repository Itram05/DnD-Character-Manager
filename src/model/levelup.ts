// Level Up helper: what happens when you add one level in a class.
// Rules: SRD 5.2.1 "Level Advancement" and "Multiclassing".
import { srdClass, srdSubclass, type SrdClass, type SrdFeature } from '../data/srd'
import { guessActivation, presetFor } from '../data/srdPresets'
import { newId } from './normalize'
import {
  abilityMod,
  classHitDie,
  fixedHpPerLevel,
  pactSlots,
  proficiencyBonus,
  spellSlots,
  totalLevel,
} from './rules'
import type { Ability, Activation, Character, ClassEntry, Feature, Uses } from './types'

export interface PlannedFeature {
  key: string
  name: string
  level: number
  text: string
  origin: 'class' | 'subclass'
  activation: Activation
  uses?: Uses
  /** Already on the sheet (same name): unchecked by default. */
  alreadyHave: boolean
}

export interface LevelUpPlan {
  classId: string
  className: string
  srd?: SrdClass
  isNewClass: boolean
  fromLevel: number
  toLevel: number
  newTotalLevel: number
  hitDie: number
  conMod: number
  fixedHp: number
  pbBefore: number
  pbAfter: number
  features: PlannedFeature[]
  /** Subclass must be picked at this level and isn't set yet. */
  needsSubclass: boolean
  subclassName?: string
  /** true = SRD has data for this subclass; false = no data (PHB or homebrew); undefined = no subclass yet. */
  subclassHasData?: boolean
  columnChanges: { label: string; before: string; after: string }[]
  slotsBefore: number[]
  slotsAfter: number[]
  pactBefore: { slots: number; level: number }
  pactAfter: { slots: number; level: number }
  decisions: string[]
  multiclass?: { prerequisitesMet: boolean; requirement: string; gains: string }
  /** No SRD data for the class at all. */
  noClassData: boolean
}

function findText(features: SrdFeature[], name: string, level: number): SrdFeature | undefined {
  const same = features.filter((f) => f.name.toLowerCase() === name.toLowerCase())
  if (!same.length) return undefined
  // Prefer the entry for exactly this level, else the latest one at or below it (e.g. ASI at 8 → the level 4 text).
  return same.find((f) => f.level === level) ?? same.filter((f) => f.level <= level).sort((a, b) => b.level - a.level)[0] ?? same[0]
}

function toPlanned(c: Character, classId: string, subclassId: string | undefined, f: SrdFeature, level: number, origin: 'class' | 'subclass'): PlannedFeature {
  const preset = presetFor(classId, subclassId, f.name)
  const uses: Uses | undefined = preset?.uses ? { ...preset.uses, used: 0 } : undefined
  return {
    key: `${origin}:${f.name}:${level}`,
    name: f.name,
    level,
    text: f.text,
    origin,
    activation: preset?.activation ?? guessActivation(f.text),
    uses,
    alreadyHave: c.features.some((x) => x.name.toLowerCase() === f.name.toLowerCase()),
  }
}

export function planLevelUp(c: Character, classId: string, subclassOverride?: string): LevelUpPlan {
  const existing = c.classes.find((k) => k.id === classId)
  const srd = srdClass(classId)
  const isNewClass = !existing
  const fromLevel = existing?.level ?? 0
  const toLevel = fromLevel + 1
  const entry: ClassEntry = existing ?? { id: srd?.id ?? classId, name: srd?.name ?? classId, level: 0 }
  const hitDie = classHitDie(entry)
  const conMod = abilityMod(c.abilities.con)
  const before = totalLevel(c)
  const after = c.classes.reduce((s, k) => s + k.level, 0) + 1

  const subclassName = subclassOverride || existing?.subclass
  const sub = srdSubclass(srd, subclassName)
  const needsSubclass = !!srd && toLevel >= srd.subclassLevel && !existing?.subclass

  const features: PlannedFeature[] = []
  const decisions: string[] = []
  const columnChanges: LevelUpPlan['columnChanges'] = []

  if (srd) {
    const row = srd.table.find((r) => r.level === toLevel)
    const prev = srd.table.find((r) => r.level === fromLevel)
    for (const name of row?.features ?? []) {
      if (name === 'Ability Score Improvement') {
        decisions.push('Ability Score Improvement: +2 to one score or +1 to two (max 20), or take another feat you qualify for.')
        continue
      }
      if (name === 'Epic Boon') {
        decisions.push('Epic Boon: choose an Epic Boon feat (or another feat you qualify for).')
        continue
      }
      if (/Subclass$/.test(name)) {
        if (needsSubclass && !subclassName) decisions.push(`Choose your ${srd.name} subclass.`)
        continue
      }
      if (name === 'Subclass feature') continue
      const f = findText(srd.features, name, toLevel)
      features.push(
        f ? toPlanned(c, srd.id, sub?.id, f, toLevel, 'class') : { key: `class:${name}:${toLevel}`, name, level: toLevel, text: 'See the class description.', origin: 'class', activation: 'passive', alreadyHave: false },
      )
    }
    // subclass features at this level (also covers the level where the subclass is chosen)
    if (sub) {
      for (const f of sub.features.filter((x) => x.level === toLevel)) features.push(toPlanned(c, srd.id, sub.id, f, toLevel, 'subclass'))
    } else if (subclassName && toLevel >= srd.subclassLevel) {
      const subLevels = new Set(srd.table.filter((r) => r.features.includes('Subclass feature')).map((r) => r.level))
      subLevels.add(srd.subclassLevel)
      if (subLevels.has(toLevel)) decisions.push(`${subclassName} is not in the SRD: add its level ${toLevel} features by hand (see your book).`)
    }
    // table columns that change
    for (const col of srd.columns) {
      const a = prev?.values[col.key] ?? ''
      const b = row?.values[col.key] ?? ''
      if (a !== b && !/^slot\d$|^spell-slots$|^slot-level$/.test(col.key)) columnChanges.push({ label: col.label, before: a || '—', after: b || '—' })
    }
    for (const ch of columnChanges) {
      if (/cantrips/i.test(ch.label)) decisions.push(`Learn ${Number(ch.after) - (Number(ch.before) || 0)} new cantrip(s).`)
      else if (/prepared spells/i.test(ch.label)) decisions.push(`Prepared spells: ${ch.before} → ${ch.after}. Pick the new spell(s).`)
      else if (/invocations/i.test(ch.label)) decisions.push(`Eldritch Invocations: ${ch.before} → ${ch.after}. Pick the new one(s).`)
      else if (/weapon mastery/i.test(ch.label)) decisions.push(`Weapon Mastery: ${ch.before} → ${ch.after} weapons. Pick the new one(s).`)
    }
    for (const f of features) {
      if (/\b(of your choice|choose|you gain one|you learn)\b/i.test(f.text) && !f.alreadyHave) decisions.push(`${f.name}: this feature includes a choice. Read it and decide.`)
    }
  } else {
    decisions.push(`${entry.name} is not an SRD class: add this level's features by hand.`)
  }

  // after-state for slots
  const afterClasses = isNewClass ? [...c.classes, { ...entry, level: 1 }] : c.classes.map((k) => (k.id === classId ? { ...k, level: toLevel } : k))
  const cAfter: Character = { ...c, classes: afterClasses }

  let multiclass: LevelUpPlan['multiclass']
  if (isNewClass && c.classes.length > 0 && srd) {
    // "at least 13 in the primary ability of the new class and your current classes"
    const check = (k: SrdClass | undefined) => {
      if (!k) return true
      const ok = (a: Ability) => c.abilities[a] >= 13
      return k.primaryAbilityMode === 'any' ? k.primaryAbility.some(ok) : k.primaryAbility.every(ok)
    }
    const all = [srd, ...c.classes.map((k) => srdClass(k.id))]
    multiclass = {
      prerequisitesMet: all.every(check),
      requirement: all
        .filter((k): k is SrdClass => !!k)
        .map((k) => `${k.name}: ${k.primaryAbilityText} 13+`)
        .join('; '),
      gains: srd.multiclassGains,
    }
  }

  return {
    classId: entry.id,
    className: entry.name,
    srd,
    isNewClass,
    fromLevel,
    toLevel,
    newTotalLevel: after,
    hitDie,
    conMod,
    fixedHp: fixedHpPerLevel(hitDie),
    pbBefore: proficiencyBonus(before),
    pbAfter: proficiencyBonus(after),
    features,
    needsSubclass,
    subclassName,
    subclassHasData: subclassName ? !!sub : undefined,
    columnChanges,
    slotsBefore: spellSlots(c),
    slotsAfter: spellSlots(cAfter),
    pactBefore: pactSlots(c),
    pactAfter: pactSlots(cAfter),
    decisions,
    multiclass,
    noClassData: !srd,
  }
}

export interface LevelUpChoices {
  /** HP added to the maximum (already includes Con; minimum 1). */
  hpGain: number
  subclass?: string
  /** Keys of planned features to add. */
  selected: string[]
  /** Hand-written features for this level (non-SRD subclass etc.). */
  extraFeatures: { name: string; activation: Activation; description: string; uses?: Uses }[]
}

/** HP for a level after the first: roll (or fixed value) + Con modifier, minimum 1. */
export const hpForLevel = (rollOrFixed: number, conMod: number) => Math.max(1, Math.floor(rollOrFixed) + conMod)

export function applyLevelUp(c: Character, plan: LevelUpPlan, choices: LevelUpChoices): Character {
  const subclass = choices.subclass || plan.subclassName
  let classes: ClassEntry[]
  if (plan.isNewClass) classes = [...c.classes, { id: plan.classId, name: plan.className, level: 1, ...(subclass ? { subclass } : {}) }]
  else classes = c.classes.map((k) => (k.id === plan.classId ? { ...k, level: plan.toLevel, ...(subclass ? { subclass } : {}) } : k))

  const sourceName = `${plan.className} ${plan.toLevel}`
  let features: Feature[] = [...c.features]
  for (const f of plan.features) {
    if (!choices.selected.includes(f.key)) continue
    const existing = features.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase())
    const feat: Feature = {
      id: newId(),
      name: f.name,
      source: { type: f.origin === 'subclass' ? 'subclass' : 'class', name: f.origin === 'subclass' && subclass ? `${subclass} ${plan.toLevel}` : sourceName },
      activation: f.activation,
      description: f.text,
      level: plan.toLevel,
      ...(f.uses ? { uses: { ...f.uses } } : {}),
    }
    // A higher-level version of a feature replaces the old text but keeps the used count.
    if (existing >= 0) features[existing] = { ...feat, id: features[existing].id, uses: feat.uses ? { ...feat.uses, used: features[existing].uses?.used ?? 0 } : features[existing].uses }
    else features.push(feat)
    const preset = plan.srd ? presetFor(plan.srd.id, srdSubclass(plan.srd, subclass)?.id, f.name) : undefined
    if (preset?.patch) {
      const patch = preset.patch
      features = features.map((x) => (x.name === patch.target && x.uses ? { ...x, uses: { ...x.uses, ...patch.uses } } : x))
    }
  }
  for (const e of choices.extraFeatures) {
    if (!e.name.trim()) continue
    features.push({
      id: newId(),
      name: e.name.trim(),
      source: { type: subclass ? 'subclass' : 'class', name: subclass ? `${subclass} ${plan.toLevel}` : sourceName },
      activation: e.activation,
      description: e.description,
      level: plan.toLevel,
      ...(e.uses ? { uses: e.uses } : {}),
    })
  }

  const gain = Math.max(1, Math.floor(choices.hpGain))
  const hp = { ...c.combat.hp, max: c.combat.hp.max + gain, current: c.combat.hp.current + gain }
  return { ...c, classes, features, combat: { ...c.combat, hp }, updatedAt: new Date().toISOString() }
}
