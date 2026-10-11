// AI-GUIDE.md is what a player hands to their own AI assistant, so that it can write a character file
// for this app. That reader sees nothing else: not the code, not the app. These tests keep the guide true:
// - its example hero (examples/ai-guide-example.json) imports with no adjustments and is exactly what
//   the app would export, so it shows the format as it is, not as it once was;
// - the copy of the example inside the guide is the file, character for character;
// - the Cleric fragment of the guide (Channel Divinity with an option that spends it, a domain spell) imports clean;
// - every field the importer reads (KNOWN in normalize.ts) and every fixed word list is in the guide,
//   in the section of the object it belongs to. A new field in types.ts / normalize.ts fails here until
//   the guide describes it.
import { describe, expect, it } from 'vitest'
import { SRD_CLASSES } from '../src/data/srd'
import { itemTiles } from '../src/model/itemPanel'
import { KNOWN, importCharacterJson } from '../src/model/normalize'
import { healingPotionRows, playCards, playPassivePowers, playPassives, useCard } from '../src/model/play'
import { armorClass, attackStats, attunedCount, castingStats, initiative, spellSlots, usesMax } from '../src/model/rules'
import { characterToJson } from '../src/model/storage'
import { ABILITIES, ACTIVATIONS, CURRENT_SCHEMA_VERSION, RECHARGES, SKILL_IDS, SOURCE_TYPES, USES_RESOURCES } from '../src/model/types'
import { XP_TABLE } from '../src/model/xp'

import guideRaw from '../AI-GUIDE.md?raw'
import exampleRaw from '../examples/ai-guide-example.json?raw'

// a checkout with CRLF line ends must not fail: the comparison is about content
const lf = (s: string) => s.replace(/\r\n/g, '\n')
const guide = lf(guideRaw)
const exampleText = lf(exampleRaw)

describe('the example hero of the AI guide', () => {
  const { character: c, warnings } = importCharacterJson(exampleText)

  it('imports with no adjustments at all', () => {
    expect(warnings).toEqual([])
  })
  it('is exactly what the app exports: nothing defaulted, added, reordered or dropped by the import', () => {
    expect(c).toEqual(JSON.parse(exampleText))
    expect(characterToJson(c) + '\n').toBe(exampleText)
  })
  it('survives export and a second import unchanged, again with no adjustments', () => {
    const again = importCharacterJson(characterToJson(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('gives the numbers the guide promises the reader', () => {
    expect(armorClass(c).total).toBe(17)
    expect(initiative(c)).toBe(7)
    expect(castingStats(c).map((s) => s.saveDc)).toEqual([13])
    expect(spellSlots(c)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0])
    expect(c.attacks.map((a) => [a.name, attackStats(c, a)])).toEqual([
      ['Emberwood Longbow', { toHit: 10, dmgMod: 5 }],
      ['Shortsword', { toHit: 7, dmgMod: 4 }],
      ['Unarmed Strike', { toHit: 3, dmgMod: 0 }],
    ])
    expect(usesMax(c, c.spells.find((s) => s.name === "Hunter's Mark")!.freeCasts!.max)).toBe(3)
    expect(attunedCount(c)).toBe(2)
    for (const n of ['Armor Class 17', 'Initiative +7', 'spell save DC 13', '+10 to hit for 1d8+5', '+7 for 1d6+4']) expect(guide).toContain(n)
  })
  it('puts on the Play screen what the guide says it does', () => {
    const cards = playCards(c).map((x) => `${x.zone}/${x.kind}: ${x.name}`)
    expect(cards).toEqual([
      "other/feature: Hunter's Prey: Colossus Slayer",
      'bonus/feature: Adrenaline Rush',
      'other/feature: Relentless Endurance',
      "bonus/spell: Hunter's Mark",
      'action/spell: Cure Wounds',
      'bonus/spell: Ensnaring Strike',
      'action/spell: Speak with Animals',
      'bonus/spell: Lesser Restoration',
      'action/spell: Silence',
      'action/spell: Spike Growth',
      // the bow has active powers, so no card of its own; Goodberry is not prepared
      'other/power: Ember Arrow',
      'action/power: Flare Shot',
      'reaction/power: Cinder Step',
      'action/scroll: Spell Scroll (Fog Cloud)',
      "action/item: Alchemist's Fire",
    ])
    expect(playPassives(c).map((f) => f.name)).toContain('Favored Enemy')
    expect(playPassivePowers(c).map((p) => p.power.name)).toEqual(['Hearthlight'])
    expect(healingPotionRows(c)[0]).toMatchObject({ name: 'Potion of Healing', quantity: 2 })
    expect(itemTiles(c).map((t) => t.item.name)).toEqual(['Emberwood Longbow', 'Shortsword', "Alchemist's Fire"])
  })
})

describe('AI-GUIDE.md', () => {
  it('contains the example file, character for character', () => {
    const m = guide.match(/<!-- EXAMPLE:START[^>]*-->\n```json\n([\s\S]*?)\n```\n<!-- EXAMPLE:END -->/)
    expect(m, 'the example block between the EXAMPLE markers').not.toBeNull()
    expect(m![1] + '\n').toBe(exampleText)
  })

  // the Cleric fragment of section 7 is real JSON, and it imports as the text around it says
  it('has a caster fragment that imports clean: a pool card, an option that spends it, an always-prepared spell', () => {
    const m = guide.match(/<!-- FRAGMENT:START[^>]*-->\n```json\n([\s\S]*?)\n```\n<!-- FRAGMENT:END -->/)
    expect(m, 'the fragment block between the FRAGMENT markers').not.toBeNull()
    const { character: f, warnings } = importCharacterJson(m![1])
    expect(warnings).toEqual([])
    const pool = f.features.find((x) => x.name === 'Channel Divinity')!
    expect(usesMax(f, pool.uses!.max)).toBe(3)
    expect(playCards(f).map((x) => `${x.zone}/${x.kind}: ${x.name}${x.uses ? ` (${x.uses.left}/${x.uses.max})` : ''}${x.pool ? ` spends ${x.pool.cost} of ${x.pool.name}` : ''}`)).toEqual([
      'other/feature: Channel Divinity (2/3)',
      'action/feature: Channel Divinity: Turn Undead (2/3) spends 1 of Channel Divinity',
      'action/spell: Bless',
    ])
    // the option has no counter of its own; using its card spends the pool
    const turn = f.features.find((x) => x.name === 'Channel Divinity: Turn Undead')!
    expect(turn.uses).toBeUndefined()
    const after = useCard(f, { kind: 'feature', id: turn.id })
    expect(after.features.find((x) => x.name === 'Channel Divinity')!.uses!.used).toBe(2)
    expect(f.spells[0]).toMatchObject({ prepared: true, alwaysPrepared: true, source: 'cleric' })
  })

  it('names the schema version the app writes', () => {
    expect(guide).toContain(`**schema version ${CURRENT_SCHEMA_VERSION}**`)
    expect(guide).toContain(`Write \`${CURRENT_SCHEMA_VERSION}\``)
    expect(guide).toContain(`\`"schemaVersion": ${CURRENT_SCHEMA_VERSION}\``)
  })

  // the text of one "### heading" section of the reference, up to the next heading of level 2 or 3
  const section = (heading: string) => {
    const mark = `\n### ${heading}\n`
    const start = guide.indexOf(mark)
    expect(start, `section "### ${heading}"`).toBeGreaterThan(-1)
    const body = guide.slice(start + mark.length)
    const end = body.search(/\n#{2,3} /)
    return end === -1 ? body : body.slice(0, end)
  }
  // names the importer accepts as another spelling of a field; the guide teaches the real one
  const ALIASES = new Set(['race', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'])
  // inventory.items and inventory.money are also read from the top level; the guide teaches `inventory`
  const TOP_ALIASES = new Set(['items', 'money'])

  // which section of the guide describes which object of the importer
  const SECTIONS: Record<keyof typeof KNOWN, string> = {
    top: 'Top level',
    species: 'Top level',
    abilities: 'abilities',
    class: 'classes',
    proficiencies: 'proficiencies',
    combat: 'combat',
    hp: 'combat',
    deathSaves: 'combat',
    feature: 'features',
    source: 'features',
    uses: 'Counters',
    attack: 'attacks',
    spell: 'spells',
    spellcasting: 'spellcasting',
    pactOverride: 'spellcasting',
    inventory: 'Top level',
    item: 'items',
    armor: 'items',
    abilityScore: 'items',
    container: 'containers',
    category: 'containers',
    preferences: 'preferences',
    gearPrefs: 'preferences',
    gearShow: 'preferences',
    moneyPrefs: 'preferences',
    playPrefs: 'preferences',
    image: 'images',
    pin: 'images',
    recipe: 'recipes',
    recipePart: 'recipes',
    recipeOutput: 'recipes',
    playCounter: 'recipes',
    power: 'item powers',
    money: 'money',
    roleplay: 'roleplay',
    sessionNote: 'sessionNotes',
    xpEntry: 'xpLog',
    timer: 'timers',
  }

  it.each(Object.keys(KNOWN) as (keyof typeof KNOWN)[])('describes every field of "%s" that the importer reads', (group) => {
    const text = section(SECTIONS[group])
    const missing = (KNOWN[group] as readonly string[])
      .filter((f) => !ALIASES.has(f) && !(group === 'top' && TOP_ALIASES.has(f)))
      // `field`, or inside a shape such as `{ max, current, temp }`
      .filter((f) => !new RegExp('`' + f + '`|`\\{[^`]*\\b' + f + '\\b[^`]*\\}`').test(text))
    expect(missing, `fields missing from "### ${SECTIONS[group]}" of AI-GUIDE.md`).toEqual([])
  })

  it('lists every value of the fixed word lists', () => {
    const missing = (words: readonly string[]) => words.filter((w) => !guide.includes('`' + w + '`'))
    expect(missing(ACTIVATIONS), 'activation').toEqual([])
    expect(missing(RECHARGES), 'recharge').toEqual([])
    expect(missing(SOURCE_TYPES), 'source.type').toEqual([])
    expect(missing(SKILL_IDS), 'skills').toEqual([])
    expect(missing(ABILITIES), 'abilities').toEqual([])
    expect(missing(['full', 'half', 'third', 'pact', 'none']), 'casterType').toEqual([])
    expect(USES_RESOURCES.filter((w) => !guide.includes(`"${w}"`)), 'resource').toEqual([])
    expect(SRD_CLASSES.map((k) => k.id).filter((id) => !guide.includes(id)), 'SRD class ids').toEqual([])
  })

  it('has the XP table of the app', () => {
    const cells = [...guide.matchAll(/^\| XP \|(.+)\|$/gm)].flatMap((m) => m[1].split('|').map((x) => Number(x.trim())))
    expect(cells).toEqual([...XP_TABLE])
  })
})
