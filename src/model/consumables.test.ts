// Healing potions as counters next to Concentration; spell scrolls and other potions as cards in one group right under the spells.
import { describe, expect, it } from 'vitest'
import srdSpells from '../data/srd/spells.json'
import type { SrdSpell } from '../data/srd'
import { healingDice, healingTier, isPotion, isScroll, potionDice, potionLabel, readScroll, scrollInfo, scrollSpellName } from './consumables'
import { tokenize } from './highlight'
import { PLAY_KINDS, kindGroup, playCards, playHealingPotions, useCard } from './play'
import { normalizeCharacter } from './normalize'
import type { Character } from './types'

const SRD = (srdSpells as unknown as { data: SrdSpell[] }).data

const hero = (): Character =>
  normalizeCharacter({
    name: 'H',
    classes: [{ id: 'cleric', level: 5 }],
    spells: [
      { id: 'cmd', name: 'Command', level: 1, prepared: true, castingTime: 'Action', range: '60 feet', description: 'My own note on Command.' },
      { id: 'cw', name: 'Cure Wounds (Paladin)', level: 1, prepared: true, castingTime: 'Action', description: 'Paladin copy.' },
    ],
    inventory: {
      items: [
        { id: 's-cmd', name: 'Scroll of Command', quantity: 1, activation: 'action' },
        { id: 's-shatter', name: 'Scroll of Shatter', quantity: 2 },
        { id: 's-hold', name: 'Spell Scroll (Hold Person)', quantity: 1, description: 'Found in the crypt.' },
        { id: 's-shield', name: 'Spell Scroll: Shield', quantity: 1 },
        { id: 's-prot', name: 'Scroll of Protection', quantity: 1, description: 'Protection from one creature type for 5 minutes.' },
        { id: 's-att', name: 'Scroll of Fireball', quantity: 1, requiresAttunement: true },
        { id: 'case', name: 'Scroll case', quantity: 1, activation: 'action' },
        { id: 'p1', name: 'Potion of Healing', quantity: 3, activation: 'action', description: 'Regain 2d4 + 2 HP.' },
        { id: 'p2', name: 'Elixir of Health', quantity: 0 },
        { id: 'p3', name: 'greater healing potion', quantity: 2 },
        { id: 'p-climb', name: 'Potion of Climbing', quantity: 1, description: 'You gain a Climb Speed equal to your Speed for 1 hour.' },
        { id: 'fire', name: "Alchemist's Fire", quantity: 2, activation: 'action', description: '1d4 Fire damage at the start of each of its turns.' },
        { id: 'p-charged', name: 'Potion Flask of Endless Brew', quantity: 1, activation: 'action', charges: { max: 3, recharge: 'dawn' } },
        { id: 'rope', name: 'Rope', quantity: 1 },
      ],
    },
  }).character

const item = (c: Character, id: string) => c.inventory.items.find((i) => i.id === id)!

describe('recognizing scrolls and potions', () => {
  it('reads the spell name from the usual scroll names', () => {
    expect(scrollSpellName('Scroll of Scorching Ray')).toBe('Scorching Ray')
    expect(scrollSpellName('Spell Scroll of Fireball')).toBe('Fireball')
    expect(scrollSpellName('Spell Scroll (Hold Person)')).toBe('Hold Person')
    expect(scrollSpellName('Spell Scroll: Shield')).toBe('Shield')
    expect(scrollSpellName('scroll - Misty Step')).toBe('Misty Step')
    expect(scrollSpellName('Fireball scroll')).toBe('Fireball')
    expect(scrollSpellName('Свитък с Aid')).toBe('Aid')
    expect(scrollSpellName('Spell Scroll')).toBeUndefined()
  })
  it('scroll = the word "scroll" and no charges; potion = potion/elixir/philter and no charges', () => {
    const c = hero()
    expect(isScroll(item(c, 's-cmd'))).toBe(true)
    expect(isScroll(item(c, 'case'))).toBe(false)
    expect(isPotion(item(c, 'p1'))).toBe(true)
    expect(isPotion(item(c, 'p2'))).toBe(true)
    expect(isPotion(item(c, 'p-charged'))).toBe(false)
    expect(isPotion(item(c, 'rope'))).toBe(false)
    expect(isPotion({ name: 'Отвара за лекуване' })).toBe(true)
  })
})

describe('what a scroll shows', () => {
  it('the character spell first (their own notes), matched without case', () => {
    const s = scrollInfo(hero(), item(hero(), 's-cmd'), SRD)
    expect(s.from).toBe('character')
    expect(s.description).toBe('My own note on Command.')
    expect(s.level).toBe(1)
    expect(s.range).toBe('60 feet')
  })
  it('"Cure Wounds (Paladin)" in the list still matches a Scroll of Cure Wounds', () => {
    const c = hero()
    const s = scrollInfo(c, { ...item(c, 's-cmd'), name: 'Scroll of Cure Wounds' }, SRD)
    expect(s.from).toBe('character')
    expect(s.description).toBe('Paladin copy.')
  })
  it('then the SRD, with level, casting time, range and concentration', () => {
    const c = hero()
    const s = scrollInfo(c, item(c, 's-hold'), SRD)
    expect(s.from).toBe('srd')
    expect(s).toMatchObject({ level: 2, castingTime: 'Action', range: '60 feet', concentration: true })
    expect(s.description).toContain('Paralyzed')
    // the item's own text is kept as a note, not lost
    expect(s.note).toBe('Found in the crypt.')
  })
  it('then the item description when the spell is unknown or the SRD is not loaded yet', () => {
    const c = hero()
    expect(scrollInfo(c, item(c, 's-prot'), SRD)).toMatchObject({ from: 'item', description: 'Protection from one creature type for 5 minutes.' })
    expect(scrollInfo(c, item(c, 's-shatter'))).toMatchObject({ from: 'item', description: '' })
    expect(scrollInfo(c, item(c, 's-shatter'), SRD).from).toBe('srd')
  })
  it('the description goes through the rules highlighting like every other text', () => {
    const c = hero()
    const kinds = tokenize(scrollInfo(c, item(c, 's-shatter'), SRD).description).map((t) => t.kind)
    expect(kinds).toContain('damage')
    expect(kinds).toContain('save')
  })
})

describe('Play screen', () => {
  it('scrolls are cards of their own kind, right after spells; healing potions are not cards, other potions are', () => {
    const c = hero()
    expect(PLAY_KINDS.indexOf('scroll')).toBe(PLAY_KINDS.indexOf('spell') + 1)
    const cards = playCards(c, SRD)
    const scrolls = cards.filter((x) => x.kind === 'scroll')
    expect(scrolls.map((x) => x.id).sort()).toEqual(['s-cmd', 's-hold', 's-prot', 's-shatter', 's-shield'])
    expect(cards.some((x) => x.id === 'p1' || x.id === 'p3')).toBe(false)
    // other potions: cards in the scroll group, even at 0 and without an activation
    const potions = cards.filter((x) => x.kind === 'potion')
    expect(potions.map((x) => x.id).sort()).toEqual(['p-climb', 'p2'])
    expect(potions.every((x) => kindGroup(x.kind) === 'scroll')).toBe(true)
    expect(cards.find((x) => x.id === 'p-climb')).toMatchObject({ quantity: 1, zone: 'action', tapped: false, text: 'You gain a Climb Speed equal to your Speed for 1 hour.' })
    expect(cards.find((x) => x.id === 'p2')).toMatchObject({ quantity: 0, tapped: true })
    // a charged item keeps its card even with "potion" in the name
    expect(cards.find((x) => x.id === 'p-charged')?.kind).toBe('item')
    expect(cards.find((x) => x.id === 'case')?.kind).toBe('item')
    // Alchemist's Fire is neither: an ordinary item card with its stepper
    expect(cards.find((x) => x.id === 'fire')).toMatchObject({ kind: 'item', quantity: 2 })
  })
  it('the four healing potions are recognized by name, in any word order and case', () => {
    const tier = (name: string) => healingTier({ name })
    expect(tier('Potion of Healing')).toBe('healing')
    expect(tier('Potion of Greater Healing')).toBe('greater')
    expect(tier('Greater Healing Potion')).toBe('greater')
    expect(tier('POTION OF SUPERIOR HEALING')).toBe('superior')
    expect(tier('Potion of Supreme Healing')).toBe('supreme')
    expect(tier('Отвара за лекуване')).toBe('healing')
    for (const n of ['Potion of Climbing', 'Potion of Water Breathing', 'Elixir of Health', "Alchemist's Fire", 'Healing Kit', 'Rope'])
      expect(tier(n)).toBeUndefined()
    // a charged "healing potion" keeps its pips
    expect(healingTier({ name: 'Potion of Healing', charges: { max: 3, used: 0, recharge: 'dawn' } })).toBeUndefined()
  })
  it('healing dice: the description wins, else the standard for the kind', () => {
    expect(healingDice({ name: 'Potion of Healing', description: 'Regain 2d4 + 2 HP.' })).toBe('2d4+2')
    expect(healingDice({ name: 'Potion of Healing', description: 'House rule: 3d4 + 3.' })).toBe('3d4+3')
    expect(healingDice({ name: 'Potion of Healing' })).toBe('2d4+2')
    expect(healingDice({ name: 'Greater Healing Potion' })).toBe('4d4+4')
    expect(healingDice({ name: 'Potion of Superior Healing', description: '' })).toBe('8d4+8')
    expect(healingDice({ name: 'Potion of Supreme Healing' })).toBe('10d4+20')
    expect(healingDice({ name: 'Potion of Climbing' })).toBeUndefined()
  })
  it('a scroll card looks like its spell: level, hand by casting time, concentration, meta line', () => {
    const c = hero()
    const shield = playCards(c, SRD).find((x) => x.id === 's-shield')!
    expect(shield).toMatchObject({ cost: '1', spellLevel: 1, zone: 'reaction', quantity: 1 })
    const hold = playCards(c, SRD).find((x) => x.id === 's-hold')!
    expect(hold).toMatchObject({ zone: 'action', concentration: true, meta: 'Action · 60 feet' })
    // unknown spell: no level, the item activation decides the hand
    expect(playCards(c, SRD).find((x) => x.id === 's-prot')).toMatchObject({ spellLevel: undefined, zone: 'action' })
  })
  it('the attunement filter applies to scrolls and potions', () => {
    const c = hero()
    expect(playCards(c, SRD).some((x) => x.id === 's-att')).toBe(false)
    const attuned = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 's-att' ? { ...i, attuned: true } : i)) } }
    expect(playCards(attuned, SRD).some((x) => x.id === 's-att')).toBe(true)
    const unattuned = { ...c, inventory: { ...c.inventory, items: c.inventory.items.map((i) => (i.id === 'p1' || i.id === 'p-climb' ? { ...i, requiresAttunement: true } : i)) } }
    expect(playHealingPotions(unattuned).map((x) => x.id)).toEqual(['p3'])
    expect(playCards(unattuned, SRD).some((x) => x.id === 'p-climb')).toBe(false)
  })
  it('healing potions: counters, even at 0 and even without an activation; - and + change the quantity', () => {
    let c = hero()
    expect(playHealingPotions(c).map((x) => [x.id, x.quantity])).toEqual([
      ['p1', 3],
      ['p3', 2],
    ])
    c = useCard(c, { kind: 'item', id: 'p1' }, 1)
    c = useCard(c, { kind: 'item', id: 'p3' }, -1)
    expect(playHealingPotions(c).map((x) => x.quantity)).toEqual([2, 3])
    c = useCard(c, { kind: 'item', id: 'p1' }, 5)
    expect(playHealingPotions(c)[0].quantity).toBe(0)
  })
  it('using another potion card takes one away', () => {
    const c = useCard(hero(), { kind: 'potion', id: 'p-climb' }, 1)
    expect(item(c, 'p-climb').quantity).toBe(0)
    expect(playCards(c, SRD).find((x) => x.id === 'p-climb')!.tapped).toBe(true)
  })
  it('potion counter label and dice', () => {
    expect(potionLabel('Potion of Greater Healing')).toBe('Greater Healing')
    expect(potionLabel('Potion')).toBe('Potion')
    expect(potionLabel('Elixir of Health')).toBe('Elixir of Health')
    expect(potionDice('Regain 4d4 + 4 HP.')).toBe('4d4+4')
    expect(potionDice('You can see invisible things.')).toBeUndefined()
  })
})

describe('using a scroll', () => {
  it('one fewer; a concentration spell goes into the Concentration slot', () => {
    const c = { ...hero(), spellcasting: { ...hero().spellcasting, concentration: 'Bless' } }
    const r = readScroll(c, 's-hold', SRD)!
    expect(item(r.character, 's-hold').quantity).toBe(0)
    expect(r.character.spellcasting.concentration).toBe('Hold Person')
    expect(r.droppedConcentration).toBe('Bless')
    expect(r.left).toBe(0)
  })
  it('a non-concentration scroll leaves concentration alone', () => {
    const c = { ...hero(), spellcasting: { ...hero().spellcasting, concentration: 'Bless' } }
    const r = readScroll(c, 's-shatter', SRD)!
    expect(item(r.character, 's-shatter').quantity).toBe(1)
    expect(r.character.spellcasting.concentration).toBe('Bless')
  })
  it('at 0 nothing happens; the card stays, tapped, until removed on the Gear tab', () => {
    let c = readScroll(hero(), 's-cmd', SRD)!.character
    expect(readScroll(c, 's-cmd', SRD)).toBeUndefined()
    const card = playCards(c, SRD).find((x) => x.id === 's-cmd')!
    expect(card).toMatchObject({ quantity: 0, tapped: true })
    c = useCard(c, card, -1) // "put one back"
    expect(item(c, 's-cmd').quantity).toBe(1)
  })
})
