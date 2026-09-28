// Wave 2 (first part): schema version 2 with migration, item powers as cards, tags and the tag filter.
import { describe, expect, it } from 'vitest'
import { ImportError, importCharacterJson, normalizeCharacter } from './normalize'
import { findPower, playCards, playPassivePowers, playPassives, powerAffordable, useCard, usePower } from './play'
import { longRest } from './rest'
import { attackTags, matchesTags, spellTags, tagCounts, textTags } from './tags'
import { CURRENT_SCHEMA_VERSION, type Character } from './types'

import sampleText from '../../examples/sample-character.json?raw'

describe('schema version 2 and the migration from 1', () => {
  it('the app writes version 2', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2)
    expect(normalizeCharacter({}).character.schemaVersion).toBe(2)
  })
  it('a version 1 file (the sample hero) imports without warnings and loses nothing but the version number', () => {
    const raw = JSON.parse(sampleText)
    expect(raw.schemaVersion).toBe(1)
    const { character, warnings } = importCharacterJson(sampleText)
    expect(warnings).toEqual([])
    expect(character.schemaVersion).toBe(2)
    expect(JSON.parse(JSON.stringify(character))).toMatchObject({ ...raw, schemaVersion: 2 })
  })
  it('a file without schemaVersion is read as version 1 and exported as 2', () => {
    const { character, warnings } = importCharacterJson('{"name":"Old"}')
    expect(warnings).toEqual([])
    expect(character.schemaVersion).toBe(2)
  })
  it('an exported v2 file imports back identically', () => {
    const c = importCharacterJson(sampleText).character
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('version 3 is refused with a readable message', () => {
    expect(() => importCharacterJson('{"schemaVersion": 3}')).toThrow(ImportError)
    expect(() => importCharacterJson('{"schemaVersion": 3}')).toThrow(/version 3.*only knows version 2/)
  })
})

describe('unknown fields are kept, never silently dropped', () => {
  const input = {
    schemaVersion: 1,
    name: 'Keeper',
    homebrewNotes: { mood: 'grim' },
    species: { name: 'Elf', size: 'Medium', subrace: 'High' },
    abilities: { str: 10, luck: 3 },
    classes: [{ id: 'wizard', level: 3, school: 'Evocation' }],
    combat: { hp: { max: 20, bonus: 1 }, mount: 'horse' },
    features: [{ name: 'F', source: { type: 'feat', name: 'X', page: 12 }, uses: { max: 1, colour: 'red' }, summary: 'short' }],
    attacks: [{ name: 'Dagger', range: '20/60' }],
    spells: [{ name: 'Fire Bolt', level: 0, tips: 'aim well' }],
    spellcasting: { slotsUsed: [], focus: 'wand' },
    inventory: {
      items: [{ name: 'Rope', rarity: 'common', armor: undefined }, { name: 'Mail', armor: { base: 16, dexCap: 0, stealth: 'disadvantage' } }],
      money: { gp: 5, gems: 2 },
      bag: 'leather',
    },
    roleplay: { quirks: 'hums' },
    sessionNotes: [{ text: 'n', mood: 'ok' }],
  }
  const { character, warnings } = normalizeCharacter(input)
  const c = character as unknown as Record<string, any>
  it('keeps them at the same place, with their value', () => {
    expect(c.homebrewNotes).toEqual({ mood: 'grim' })
    expect(c.species.subrace).toBe('High')
    expect(c.abilities.luck).toBe(3)
    expect(c.classes[0].school).toBe('Evocation')
    expect(c.combat.mount).toBe('horse')
    expect(c.combat.hp.bonus).toBe(1)
    expect(c.features[0].summary).toBe('short')
    expect(c.features[0].source.page).toBe(12)
    expect(c.features[0].uses.colour).toBe('red')
    expect(c.attacks[0].range).toBe('20/60')
    expect(c.spells[0].tips).toBe('aim well')
    expect(c.spellcasting.focus).toBe('wand')
    expect(c.inventory.items[0].rarity).toBe('common')
    expect(c.inventory.items[1].armor.stealth).toBe('disadvantage')
    expect(c.inventory.money.gems).toBe(2)
    expect(c.inventory.bag).toBe('leather')
    expect(c.roleplay.quirks).toBe('hums')
    expect(c.sessionNotes[0].mood).toBe('ok')
  })
  it('lists every one of them in the import warnings', () => {
    for (const path of ['homebrewNotes', 'species.subrace', 'abilities.luck', 'classes[0].school', 'combat.mount', 'combat.hp.bonus', 'features[0].summary', 'features[0].source.page', 'features[0].uses.colour', 'attacks[0].range', 'spells[0].tips', 'spellcasting.focus', 'inventory.items[0].rarity', 'inventory.items[1].armor.stealth', 'inventory.money.gems', 'inventory.bag', 'roleplay.quirks', 'sessionNotes[0].mood'])
      expect(warnings.some((w) => w.startsWith(`${path}: not a field`)), path).toBe(true)
  })
  it('survives export and import again', () => {
    const again = importCharacterJson(JSON.stringify(character)).character as unknown as Record<string, any>
    expect(again.homebrewNotes).toEqual({ mood: 'grim' })
    expect(again.spells[0].tips).toBe('aim well')
  })
  it('aliases the importer reads (race, top-level money) are not treated as unknown', () => {
    const r = normalizeCharacter({ race: 'Dwarf', money: { gp: 3 } })
    expect(r.warnings).toEqual([])
    expect(r.character.species.name).toBe('Dwarf')
    expect(r.character.inventory.money.gp).toBe(3)
  })
})

describe('tags in the file', () => {
  it('are lowercase, trimmed and without duplicates; a text "a, b" works too', () => {
    const { character: c, warnings } = normalizeCharacter({
      spells: [{ name: 'X', tags: [' Buff ', 'buff', 'AoE'] }],
      features: [{ name: 'F', tags: 'Control, mobility' }],
      inventory: { items: [{ name: 'I', tags: [] }] },
    })
    expect(warnings).toEqual([])
    expect(c.spells[0].tags).toEqual(['buff', 'aoe'])
    expect(c.features[0].tags).toEqual(['control', 'mobility'])
    // an empty list is the same as none
    expect(c.inventory.items[0].tags).toBeUndefined()
  })
  it('a wrong type is dropped with a warning', () => {
    const r = normalizeCharacter({ spells: [{ name: 'X', tags: 5 }] })
    expect(r.character.spells[0].tags).toBeUndefined()
    expect(r.warnings[0]).toMatch(/spells\[0\]\.tags/)
  })
})

describe('automatic tags', () => {
  it('read damage types, saves, healing and control from the text', () => {
    expect(textTags('Each creature makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save.')).toEqual(['save', 'damage', 'fire'])
    expect(textTags('A creature of your choice regains Hit Points equal to 1d8 + your modifier.')).toEqual(['healing'])
    expect(textTags('The target must succeed on a Wisdom saving throw or have the Paralyzed condition.')).toEqual(['save', 'control'])
    expect(textTags('Make a melee spell attack. On a hit, 1d10 Necrotic damage.')).toEqual(['damage', 'necrotic', 'attack'])
  })
  it('do not mistake the opposite for healing, or an item bonus for a save', () => {
    expect(textTags("the target can't regain Hit Points until the start of your next turn")).not.toContain('healing')
    expect(textTags('+1 spell save DC.')).toEqual([])
    // advantage on saves against being charmed is a defence, not control
    expect(textTags('You have advantage on saving throws against being charmed.')).toEqual([])
  })
  it('spells add concentration and ritual; own tags come after the automatic ones', () => {
    const { character: c } = normalizeCharacter({ spells: [{ name: 'Web', level: 2, concentration: true, tags: ['control', 'aoe'], description: 'Dexterity saving throw or Restrained.' }] })
    expect(spellTags(c.spells[0])).toEqual(['concentration', 'save', 'control', 'aoe'])
  })
  it('attacks are tagged "attack", "damage" and their damage type', () => {
    expect(attackTags({ id: 'a', name: 'Sword', ability: 'str', proficient: true, bonus: 0, damage: '1d8', damageType: 'Slashing', addAbilityToDamage: true, damageBonus: 0 })).toEqual(['damage', 'slashing', 'attack'])
  })
  it('tag filter: a card needs every selected tag; counts list each tag once per card', () => {
    expect(matchesTags(['fire', 'save'], [])).toBe(true)
    expect(matchesTags(['fire', 'save'], ['fire'])).toBe(true)
    expect(matchesTags(['fire', 'save'], ['fire', 'healing'])).toBe(false)
    expect(tagCounts([['fire', 'save'], ['save'], undefined])).toEqual([
      { tag: 'fire', n: 1 },
      { tag: 'save', n: 2 },
    ])
  })
})

// ---------------- item powers ----------------

const staffHero = (attuned = true): Character =>
  normalizeCharacter({
    name: 'Staff',
    classes: [{ id: 'sorcerer', level: 9 }],
    features: [{ id: 'f-item', name: 'Staff trick', source: { type: 'item', name: 'Staff of Ages' }, activation: 'passive' }],
    inventory: {
      items: [
        {
          id: 'staff',
          name: 'Staff of Ages',
          requiresAttunement: true,
          attuned,
          equipped: true,
          charges: { max: 3, recharge: 'dawn', regain: '1d3' },
          tags: ['staff'],
          powers: [
            { id: 'spell-atk', name: '+3 spell attack', activation: 'passive', description: '+3 to spell attack rolls while holding it.' },
            { id: 'echo', name: 'Temporal Echo', activation: 'reaction', cost: 'all', description: 'Undo the damage.' },
            { id: 'ward', name: 'Hourglass Ward', activation: 'bonus action', cost: 1, description: 'Absorb Elements.' },
            { id: 'init', name: 'Echo of Ages', activation: 'special', cost: '1', description: 'Advantage on initiative.' },
          ],
        },
        {
          id: 'amulet',
          name: 'Amulet',
          powers: [{ id: 'see', name: 'See the unseen', activation: 'reaction', uses: { max: 1, recharge: 'long' }, description: 'See an invisible creature.' }],
        },
      ],
    },
  }).character

describe('item powers', () => {
  it('read from the file: activation aliases, "all" and numbers as cost', () => {
    const { warnings } = normalizeCharacter(staffHero())
    expect(warnings).toEqual([])
    const s = staffHero().inventory.items[0]
    expect(s.powers!.map((p) => [p.name, p.activation, p.cost])).toEqual([
      ['+3 spell attack', 'passive', undefined],
      ['Temporal Echo', 'reaction', 'all'],
      ['Hourglass Ward', 'bonus', 1],
      ['Echo of Ages', 'special', 1],
    ])
  })
  it('each active power is a card in its own hand; the item has no card of its own', () => {
    const cards = playCards(staffHero())
    const staff = cards.filter((x) => x.itemId === 'staff')
    expect(staff.map((x) => [x.name, x.kind, x.zone, x.cost, x.chargeCost])).toEqual([
      ['Temporal Echo', 'power', 'reaction', 'R', 'all'],
      ['Hourglass Ward', 'power', 'bonus', 'BA', 1],
      ['Echo of Ages', 'power', 'other', '*', 1],
    ])
    expect(cards.some((x) => x.kind === 'item' && x.id === 'staff')).toBe(false)
    // the counter on a power card is the item's charge pool
    expect(staff[1].uses).toEqual({ left: 3, max: 3 })
    // item tags reach the powers, so "staff" finds every Staff power
    expect(staff.every((x) => x.tags!.includes('staff'))).toBe(true)
  })
  it('passive powers are listed apart, not as cards', () => {
    const c = staffHero()
    expect(playPassivePowers(c).map((x) => x.power.name)).toEqual(['+3 spell attack'])
    expect(playCards(c).some((x) => x.name === '+3 spell attack')).toBe(false)
  })
  it('using a power spends its cost from the shared pool; "all" takes everything left', () => {
    let c = staffHero()
    c = usePower(c, 'ward')
    expect(c.inventory.items[0].charges!.used).toBe(1)
    c = useCard(c, { kind: 'power', id: 'init' })
    expect(c.inventory.items[0].charges!.used).toBe(2)
    c = usePower(c, 'echo')
    expect(c.inventory.items[0].charges!.used).toBe(3)
    // empty pool: every staff power is tapped and using one does nothing
    expect(playCards(c).filter((x) => x.itemId === 'staff').every((x) => x.tapped)).toBe(true)
    expect(usePower(c, 'ward')).toBe(c)
    // undo gives one charge back
    c = usePower(c, 'ward', -1)
    expect(c.inventory.items[0].charges!.used).toBe(2)
    expect(powerAffordable(c, c.inventory.items[0], findPower(c, 'ward')!.power)).toBe(true)
  })
  it('a power with its own uses counts them, and a Long Rest restores them', () => {
    let c = staffHero()
    c = usePower(c, 'see')
    expect(findPower(c, 'see')!.power.uses!.used).toBe(1)
    expect(playCards(c).find((x) => x.id === 'see')!.tapped).toBe(true)
    const r = longRest(c)
    expect(findPower(r.character, 'see')!.power.uses!.used).toBe(0)
    expect(r.restored).toContain('Amulet: See the unseen')
  })
  it('a staff that regains 1d3 at dawn reminds you to roll instead of refilling', () => {
    const r = longRest(usePower(staffHero(), 'ward'))
    expect(r.character.inventory.items[0].charges!.used).toBe(1)
    expect(r.reminders.join(' ')).toMatch(/Staff of Ages charges: roll 1d3/)
  })
  it('attunement: an item that is not attuned takes all its powers (and item features) out of Play', () => {
    const c = staffHero(false)
    expect(playCards(c).some((x) => x.itemId === 'staff')).toBe(false)
    expect(playPassivePowers(c)).toEqual([])
    expect(playPassives(c).map((f) => f.name)).not.toContain('Staff trick')
    // the amulet needs no attunement and stays
    expect(playCards(c).some((x) => x.id === 'see')).toBe(true)
  })
  it('an item whose powers are all passive keeps its normal card', () => {
    const c = normalizeCharacter({
      inventory: { items: [{ id: 'w', name: 'Wand', activation: 'action', charges: { max: 7, recharge: 'dawn' }, powers: [{ name: 'Glow', activation: 'passive' }] }] },
    }).character
    expect(playCards(c).map((x) => [x.kind, x.name])).toEqual([['item', 'Wand']])
    expect(playPassivePowers(c).map((x) => x.power.name)).toEqual(['Glow'])
  })
  it('round-trips through export and import', () => {
    const c = usePower(staffHero(), 'ward')
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
})
