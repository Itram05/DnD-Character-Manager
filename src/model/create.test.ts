import { describe, expect, it } from 'vitest'
import { en } from '../i18n/en'
import { CUSTOM, bonusValid, buildCharacter, finalScores, pointBuyCost, validateChoices, type CreateChoices } from './create'
import { normalizeCharacter } from './normalize'
import { armorClass, savingThrowProficiencies, skillMod, usesMax } from './rules'

const base = (over: Partial<CreateChoices> = {}): CreateChoices => ({
  name: 'Tessa',
  classId: 'cleric',
  background: 'Acolyte',
  species: 'Dwarf',
  method: 'standard',
  scores: { str: 14, dex: 8, con: 13, int: 10, wis: 15, cha: 12 },
  bonus: { wis: 2, cha: 1 },
  ...over,
})

describe('ability scores', () => {
  it('point buy cost', () => {
    expect(pointBuyCost({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27)
    expect(pointBuyCost({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeNaN()
  })
  it('background bonus patterns', () => {
    const allowed = ['int', 'wis', 'cha'] as const
    expect(bonusValid({ wis: 2, cha: 1 }, [...allowed])).toBe(true)
    expect(bonusValid({ int: 1, wis: 1, cha: 1 }, [...allowed])).toBe(true)
    expect(bonusValid({ wis: 2, str: 1 }, [...allowed])).toBe(false) // Str is not an Acolyte ability
    expect(bonusValid({ wis: 3 }, [...allowed])).toBe(false)
    expect(bonusValid({ wis: 1, cha: 1 }, [...allowed])).toBe(false)
    expect(bonusValid({}, [...allowed])).toBe(false)
  })
  it('the increase cannot go above 20', () => {
    expect(finalScores({ scores: { str: 19, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, bonus: { str: 2, dex: 1 } }).str).toBe(20)
  })
})

describe('validation', () => {
  it('a complete choice is valid', () => {
    expect(validateChoices(base())).toEqual([])
  })
  it('reports what is missing', () => {
    const errs = validateChoices(base({ classId: '', species: 'Dragonborn', method: 'standard', scores: { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 } }))
    expect(errs).toEqual(expect.arrayContaining(['class', 'speciesOption', 'standardArray']))
  })
  it('point buy over budget', () => {
    expect(validateChoices(base({ method: 'pointBuy', scores: { str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 } }))).toContain('pointBuy')
  })
  it('custom entries need a name', () => {
    const errs = validateChoices(base({ classId: CUSTOM, background: CUSTOM, species: CUSTOM, bonus: { str: 2, dex: 1 } }))
    expect(errs).toEqual(['customClass', 'customBackground', 'customSpecies'])
  })
})

describe('buildCharacter', () => {
  it('Dwarf Cleric Acolyte: HP, saves, skills, features, feat', () => {
    const { character: c, todo } = buildCharacter(base())
    // Con 13 (+1), Cleric d8, Dwarven Toughness +1 -> 8 + 1 + 1
    expect(c.combat.hp).toEqual({ current: 10, max: 10, temp: 0 })
    expect(c.abilities).toEqual({ str: 14, dex: 8, con: 13, int: 10, wis: 17, cha: 13 })
    expect(c.classes).toEqual([{ id: 'cleric', name: 'Cleric', level: 1 }])
    expect(c.species).toEqual({ name: 'Dwarf', size: 'Medium' })
    expect(c.background).toBe('Acolyte')
    expect(savingThrowProficiencies(c)).toEqual(['wis', 'cha'])
    expect(c.proficiencies.skills).toEqual({ insight: 'proficient', religion: 'proficient' })
    expect(skillMod(c, 'insight')).toBe(3 + 2)
    expect(c.proficiencies.armor).toMatch(/Medium armor/)
    expect(c.proficiencies.tools).toBe("Calligrapher's Supplies")
    const names = c.features.map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['Spellcasting', 'Divine Order', 'Darkvision', 'Stonecunning', 'Magic Initiate (Cleric)']))
    const stone = c.features.find((f) => f.name === 'Stonecunning')!
    expect(stone.activation).toBe('bonus')
    expect(usesMax(c, stone.uses!.max)).toBe(2)
    expect(c.features.find((f) => f.name === 'Magic Initiate (Cleric)')!.source).toEqual({ type: 'feat', name: 'Acolyte background' })
    expect(todo.map((x) => x.key)).toEqual(expect.arrayContaining(['create.todo.classSkills', 'create.todo.magicInitiate', 'create.todo.equipment']))
  })
  it('Fighter gets Second Wind with uses from the class table', () => {
    const { character: c } = buildCharacter(base({ classId: 'fighter', species: 'Human', size: 'Small', background: 'Soldier', scores: { str: 15, dex: 14, con: 13, int: 8, wis: 10, cha: 12 }, bonus: { str: 2, con: 1 } }))
    const sw = c.features.find((f) => f.name === 'Second Wind')!
    expect(sw.activation).toBe('bonus')
    expect(usesMax(c, sw.uses!.max)).toBe(2)
    expect(c.combat.hp.max).toBe(10 + 2) // d10 + Con 14 (+2)
    expect(c.species.size).toBe('Small')
    expect(c.proficiencies.tools).toBe('Choose one kind of Gaming Set')
  })
  it('Barbarian and Monk get their Unarmored Defense formula', () => {
    const barb = buildCharacter(base({ classId: 'barbarian', scores: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 }, bonus: { wis: 1, int: 1, cha: 1 } })).character
    expect(barb.combat.unarmoredAc).toBe('10 + dex + con')
    expect(armorClass(barb).total).toBe(10 + 1 + 2)
    const monk = buildCharacter(base({ classId: 'monk' })).character
    expect(monk.combat.unarmoredAc).toBe('10 + dex + wis')
  })
  it('Dragonborn ancestry flows into name and damage type', () => {
    const { character: c } = buildCharacter(base({ species: 'Dragonborn', speciesOption: 'Gold' }))
    expect(c.species.name).toBe('Dragonborn (Gold)')
    const bw = c.features.find((f) => f.name === 'Breath Weapon')!
    expect(bw.activation).toBe('action')
    expect(bw.description).toMatch(/Gold:\*\* Damage type: Fire/)
    // level 5 trait is on the sheet but not usable yet
    const flight = c.features.find((f) => f.name === 'Draconic Flight')!
    expect(flight.activation).toBe('passive')
    expect(flight.uses).toBeUndefined()
    expect(flight.level).toBe(5)
  })
  it('Wood Elf speed and Goliath boon', () => {
    expect(buildCharacter(base({ species: 'Elf', speciesOption: 'Wood Elf' })).character.combat.speed).toBe(35)
    const g = buildCharacter(base({ species: 'Goliath', speciesOption: "Stone's Endurance (Stone Giant)" })).character
    expect(g.combat.speed).toBe(35)
    const boon = g.features.find((f) => f.name === "Giant Ancestry: Stone's Endurance")!
    expect(boon.activation).toBe('reaction')
    expect(boon.uses?.max).toBe('pb')
  })
  it('custom class, species and background', () => {
    const { character: c, todo } = buildCharacter(
      base({
        classId: CUSTOM,
        customClass: { name: 'Artificer', hitDie: 8, text: 'Magical tinkering.' },
        species: CUSTOM,
        customSpecies: { name: 'Warforged', size: 'Medium', speed: 30, text: 'Constructed Resilience.' },
        background: CUSTOM,
        customBackground: { name: 'Guild Artisan', text: 'Business contacts.' },
        bonus: { int: 2, con: 1 },
      }),
    )
    expect(c.classes).toEqual([{ id: 'artificer', name: 'Artificer', level: 1, hitDie: 8 }])
    expect(c.combat.hp.max).toBe(8 + 2) // Con 13 + 1 from the background = 14 (+2)
    expect(c.species).toEqual({ name: 'Warforged', size: 'Medium' })
    expect(c.background).toBe('Guild Artisan')
    expect(c.features.map((f) => f.source.type).sort()).toEqual(['background', 'class', 'species'])
    expect(todo.map((x) => x.key)).toContain('create.todo.customClass')
  })
  it('the result survives a JSON round trip unchanged', () => {
    const { character } = buildCharacter(base({ species: 'Tiefling', speciesOption: 'Infernal', classId: 'warlock' }))
    const { character: again, warnings } = normalizeCharacter(JSON.parse(JSON.stringify(character)))
    expect(warnings).toEqual([])
    expect(again).toEqual(character)
  })
  it('every todo key exists in the English dictionary', () => {
    for (const classId of ['fighter', 'wizard', 'bard', 'monk', CUSTOM]) {
      const { todo } = buildCharacter(
        base({ classId, customClass: { name: 'X', hitDie: 8, text: '' }, species: 'Elf', speciesOption: 'Drow', background: 'Criminal', bonus: { dex: 2, con: 1 } }),
      )
      for (const item of todo) expect(en[item.key], item.key).toBeDefined()
    }
  })
})
