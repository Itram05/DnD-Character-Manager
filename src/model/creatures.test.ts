// Creatures (Character.creatures): reading a file, the one shape the app writes, the creatures in play
// (Hit Points, conditions, uses), the preferences, rests and the dice of the Roll button.
import { describe, expect, it } from 'vitest'
import sample from '../../examples/ai-guide-example.json'
import {
  DEFAULT_CREATURE_PREFS,
  actionNumbers,
  actionUses,
  addToPlay,
  creatureInitiative,
  creaturePrefs,
  creatureSave,
  creaturesInPlay,
  creaturesShownInPlay,
  damageCreature,
  deleteCreature,
  duplicateCreature,
  firstAttack,
  healCreature,
  instanceName,
  isPinned,
  mammothExample,
  moveCreature,
  pinAll,
  removeFromPlay,
  rollAction,
  rollDice,
  saveCreature,
  setCreatureHp,
  setCreatureHpMax,
  setCreatureLabel,
  setCreatureNote,
  setCreaturePref,
  setPinned,
  setRowField,
  spendCreatureAction,
  tempHpCreature,
  toggleCreatureCondition,
} from './creatures'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { longRest, shortRest } from './rest'
import { characterToJson } from './storage'
import type { Character, Creature } from './types'

const hero = (extra: Record<string, unknown> = {}) => normalizeCharacter({ schemaVersion: 3, id: 'h', name: 'Grav', classes: [{ id: 'paladin', level: 5 }], abilities: { cha: 18 }, ...extra })

/** A mammoth as a careful hand would write it, with a breath weapon added to have a limited action. */
const MAMMOTH = {
  id: 'mammoth',
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
    { id: 'multi', name: 'Multiattack', activation: 'action', description: 'The mammoth makes two Gore attacks.' },
    { id: 'gore', name: 'Gore', activation: 'action', toHit: 10, damage: '2d10', damageBonus: 7, damageType: 'Piercing', description: 'Reach 10 ft.' },
    { id: 'trample', name: 'Trample', activation: 'bonus', damage: '4d10', damageBonus: 7, damageType: 'Bludgeoning', saveDc: 18, saveAbility: 'dex', description: 'One Prone creature.' },
    { id: 'roar', name: 'Roar', activation: 'action', uses: { max: 1, used: 0, recharge: 'other', note: 'Recharge 5-6' }, description: 'Frightens.' },
    { id: 'rally', name: 'Rally', activation: 'reaction', uses: { max: 3, used: 0, recharge: 'long' }, description: '3/Day.' },
    { id: 'snort', name: 'Snort', activation: 'bonus', uses: { max: 2, used: 0, recharge: 'short' }, description: '2 per Short Rest.' },
  ],
  extra: [{ label: 'Carries', value: '1,080 lb.' }],
  description: 'From the GM.',
  inPlay: [
    { id: 'burya', label: 'Burya', hp: { current: 126, max: 126, temp: 0 } },
    { id: 'm2', label: '2', hp: { current: 92, max: 126, temp: 5 }, conditions: ['prone'], used: { roar: 1 }, note: 'Limps.' },
  ],
}
const withMammoth = (extra: Record<string, unknown> = {}) => hero({ creatures: [MAMMOTH], ...extra })
const inst = (c: Character, id: string) => creaturesInPlay(c).find((x) => x.instance.id === id)!.instance
const block = (c: Character, id = 'mammoth') => c.creatures!.find((k) => k.id === id)!

describe('a file without creatures', () => {
  it('is read as before: no field, no warning, the same export', () => {
    const { character, warnings } = importCharacterJson(JSON.stringify(sample))
    expect(warnings).toEqual([])
    expect('creatures' in character).toBe(false)
    expect(character.preferences.creatures).toBeUndefined()
    expect(JSON.parse(characterToJson(character))).toEqual(sample)
  })
  it('an empty list is the same as no list', () => {
    const { character, warnings } = hero({ creatures: [] })
    expect(warnings).toEqual([])
    expect('creatures' in character).toBe(false)
  })
})

describe('reading creatures', () => {
  it('a full stat block with two creatures in play is read with no adjustment and written back character for character', () => {
    const { character, warnings } = withMammoth()
    expect(warnings).toEqual([])
    expect(character.creatures).toEqual([MAMMOTH])
    const text = characterToJson(character)
    const again = importCharacterJson(text)
    expect(again.warnings).toEqual([])
    expect(characterToJson(again.character)).toBe(text)
  })

  it('writes the fields in one order whatever the order of the file, and leaves empty optional ones out', () => {
    const shuffled = { inPlay: [{ note: '', used: {}, conditions: [], hp: { temp: 0, max: 30, current: 30 }, id: 'a' }], actions: [], cr: '', abilities: { cha: 6, str: 24 }, speed: '50 ft.', hp: 30, ac: 13, name: 'Elk', id: 'elk', extra: [], saves: {} }
    const { character, warnings } = hero({ creatures: [shuffled] })
    expect(warnings).toEqual([])
    expect(JSON.stringify(character.creatures)).toBe(
      JSON.stringify([{ id: 'elk', name: 'Elk', ac: 13, hp: 30, speed: '50 ft.', abilities: { str: 24, dex: 10, con: 10, int: 10, wis: 10, cha: 6 }, actions: [], inPlay: [{ id: 'a', hp: { current: 30, max: 30, temp: 0 } }] }]),
    )
  })

  it('forgives what a hand or an assistant writes: names for ids, a bare name in play, long ability names', () => {
    const { character, warnings } = hero({
      creatures: [
        {
          name: 'Wolf',
          ac: '13',
          hp: 11,
          abilities: { strength: 12, dexterity: 15 },
          saves: { Dexterity: 4 },
          actions: ['Pack Tactics', { name: 'Bite', activation: 'Action', toHit: '+4', damage: '2d4', damageBonus: 2 }, { name: 'Howl', uses: 2 }],
          extra: { Owner: 'Mira' },
          inPlay: ['Grey', { label: 'Black', hp: 7, conditions: ['Prone', 'mounted'], used: { Howl: 1 } }, { hp: { current: 3 } }],
        },
      ],
    })
    expect(warnings).toEqual([])
    const wolf = character.creatures![0]
    expect(wolf.ac).toBe(13)
    expect(wolf.abilities).toMatchObject({ str: 12, dex: 15, con: 10 })
    expect(wolf.saves).toEqual({ dex: 4 })
    expect(wolf.actions.map((a) => [a.name, a.activation, a.toHit])).toEqual([
      ['Pack Tactics', 'passive', undefined],
      ['Bite', 'action', 4],
      ['Howl', 'action', undefined],
    ])
    expect(wolf.extra).toEqual([{ label: 'Owner', value: 'Mira' }])
    const [grey, black, third] = wolf.inPlay!
    // nothing written = the stat block's Hit Points; a bare number = that many of that many
    expect(grey).toMatchObject({ label: 'Grey', hp: { current: 11, max: 11, temp: 0 } })
    expect(black.hp).toEqual({ current: 7, max: 7, temp: 0 })
    // an SRD condition is stored by its id, the player's own word as written
    expect(black.conditions).toEqual(['prone', 'mounted'])
    expect(black.used).toEqual({ [wolf.actions[2].id]: 1 })
    // a current without a maximum: the stat block's maximum
    expect(third.hp).toEqual({ current: 3, max: 11, temp: 0 })
  })

  it('says what it changed', () => {
    const { character, warnings } = hero({
      creatures: [
        { id: 'x', name: 'A', hp: 10, actions: [{ id: 'b', name: 'Breath', uses: { max: 1, used: 1 } }, { id: 'b', name: 'Bite' }], inPlay: [{ id: 'i', used: { Breath: 5, Bite: 1, Tail: 1 } }, { id: 'i' }] },
        { id: 'x', name: 'B' },
        7,
      ],
      preferences: { creatures: { pinned: ['i', 'gone'], row: ['ac', 'wings'], where: 'everywhere' } },
    })
    expect(warnings).toEqual([
      'creatures[0].actions[0].uses.used: ignored: what a creature has spent is kept per creature in play (inPlay[].used), not on the stat block.',
      'creatures[0].actions[1]: the id "b" is used twice in this creature; this one got a new id.',
      'creatures[0].inPlay[0].used: "Bite" has no limit (uses) on the stat block; ignored.',
      'creatures[0].inPlay[0].used: "Tail" is not an action of "A"; ignored.',
      'creatures[0].inPlay[1]: the id "i" is used by another creature in play; this one got a new id.',
      'creatures[1]: the id "x" is used by another creature; this one got a new id.',
      'creatures[1].hp: "B" has no Hit Points; using 1.',
      'creatures[2]: expected an object, ignored.',
      'preferences.creatures.where: "everywhere" is not one of both, play, tab; using "both".',
      'preferences.creatures.pinned: "gone" not a creature in play; removed from the list.',
      'preferences.creatures.row: "wings" not one of bar, ac, speed, attack, conditions, uses, note; ignored.',
      'creatures[0].inPlay[0].used: "Breath" of "A" has 5 used of a maximum of 1; using 1.',
    ])
    expect(character.creatures![0].inPlay![0].used).toEqual({ b: 1 })
    expect(character.preferences.creatures).toEqual({ pinned: ['i'], row: ['ac'] })
  })

  it('keeps a field it does not know, where it was', () => {
    const { character, warnings } = hero({ creatures: [{ ...MAMMOTH, spellId: 'spell-x', inPlay: [{ id: 'a', hp: { current: 1, max: 1, temp: 0 }, slot: 5 }] }] })
    expect(warnings).toEqual(['creatures[0].inPlay[0].slot: not a field this app uses; kept unchanged.', 'creatures[0].spellId: not a field this app uses; kept unchanged.'])
    expect(character.creatures![0]).toMatchObject({ spellId: 'spell-x', inPlay: [{ slot: 5 }] })
    // and the app's own changes keep it too
    const after = damageCreature(character, 'a', 1)
    expect(after.creatures![0]).toMatchObject({ spellId: 'spell-x', inPlay: [{ slot: 5, hp: { current: 0 } }] })
  })

  it('reads a formula with the hero\'s numbers', () => {
    const { character, warnings } = hero({ creatures: [{ id: 's', name: 'Spirit', ac: '11 + pb', hp: '5 + 10 * pb', actions: [{ id: 'r', name: 'Rend', toHit: 'cha + pb', damage: '1d6', damageBonus: 'pb', saveDc: '8 + cha + pb' }], inPlay: [{ id: 'a' }] }] })
    expect(warnings).toEqual([])
    const k = character.creatures![0]
    // Paladin 5: PB +3, Charisma 18: +4
    expect(k.inPlay![0].hp).toEqual({ current: 35, max: 35, temp: 0 })
    expect(actionNumbers(character, k.actions[0])).toEqual({ toHit: '+7', damage: '1d6+3', saveDc: 15 })
  })
})

describe('the numbers of a stat block', () => {
  const { character: c } = withMammoth()
  const k = block(c)
  it('takes saves and Initiative from the stat block when it gives them, else from the ability', () => {
    expect(creatureSave(k, 'str')).toBe(10)
    expect(creatureSave(k, 'dex')).toBe(-1)
    expect(creatureInitiative(k)).toBe(2)
    expect(creatureInitiative({ ...k, initiative: undefined })).toBe(-1)
  })
  it('shows an action as the stat block prints it', () => {
    expect(actionNumbers(c, k.actions[1])).toEqual({ toHit: '+10', damage: '2d10+7', damageType: 'Piercing' })
    expect(actionNumbers(c, k.actions[2])).toEqual({ damage: '4d10+7', damageType: 'Bludgeoning', saveDc: 18, saveAbility: 'dex' })
    expect(firstAttack(k)?.name).toBe('Gore')
    expect(instanceName(k, k.inPlay![0])).toBe('Mammoth · Burya')
    expect(instanceName(k, { ...k.inPlay![0], label: undefined })).toBe('Mammoth')
  })
})

describe('creatures in play', () => {
  it('puts new ones in play at full Hit Points, each with a label of its own', () => {
    let { character: c } = hero({ creatures: [{ ...MAMMOTH, inPlay: undefined }] })
    c = addToPlay(c, 'mammoth')
    expect(block(c).inPlay).toHaveLength(1)
    expect(block(c).inPlay![0]).toMatchObject({ hp: { current: 126, max: 126, temp: 0 } })
    expect(block(c).inPlay![0].label).toBeUndefined()
    c = addToPlay(c, 'mammoth', 2)
    expect(block(c).inPlay!.map((i) => i.label)).toEqual([undefined, '2', '3'])
    c = addToPlay(c, 'mammoth', 1, 'Burya')
    expect(block(c).inPlay!.map((i) => i.label)).toEqual([undefined, '2', '3', 'Burya'])
    expect(addToPlay(c, 'nothing')).toBe(c)
  })

  it('takes damage from Temporary Hit Points first and never goes below 0', () => {
    let { character: c } = withMammoth()
    c = damageCreature(c, 'm2', 3)
    expect(inst(c, 'm2').hp).toEqual({ current: 92, max: 126, temp: 2 })
    c = damageCreature(c, 'm2', 12)
    expect(inst(c, 'm2').hp).toEqual({ current: 82, max: 126, temp: 0 })
    c = damageCreature(c, 'm2', 500)
    expect(inst(c, 'm2').hp.current).toBe(0)
    // the other mammoth is untouched
    expect(inst(c, 'burya').hp.current).toBe(126)
    expect(damageCreature(c, 'm2', 0)).toBe(c)
    expect(damageCreature(c, 'nobody', 5)).toBe(c)
  })

  it('heals up to the maximum; Temporary Hit Points do not stack', () => {
    let { character: c } = withMammoth()
    c = healCreature(c, 'm2', 20)
    expect(inst(c, 'm2').hp.current).toBe(112)
    c = healCreature(c, 'm2', 999)
    expect(inst(c, 'm2').hp.current).toBe(126)
    expect(healCreature(c, 'm2', 5)).toBe(c)
    expect(tempHpCreature(c, 'm2', 3)).toBe(c)
    c = tempHpCreature(c, 'm2', 9)
    expect(inst(c, 'm2').hp.temp).toBe(9)
    c = tempHpCreature(c, 'm2', 0)
    expect(inst(c, 'm2').hp.temp).toBe(0)
  })

  it('lets one creature have its own maximum, a label, a note and conditions', () => {
    let { character: c } = withMammoth()
    c = setCreatureHpMax(c, 'm2', 80)
    expect(inst(c, 'm2').hp).toMatchObject({ current: 80, max: 80 })
    c = setCreatureHp(c, 'm2', 500)
    expect(inst(c, 'm2').hp.current).toBe(80)
    c = setCreatureLabel(c, 'm2', '  Old One ')
    c = setCreatureNote(c, 'm2', '')
    expect(inst(c, 'm2')).toMatchObject({ label: 'Old One' })
    expect('note' in inst(c, 'm2')).toBe(false)
    c = toggleCreatureCondition(c, 'm2', 'frightened')
    c = toggleCreatureCondition(c, 'm2', 'prone')
    expect(inst(c, 'm2').conditions).toEqual(['frightened'])
    c = toggleCreatureCondition(c, 'm2', 'frightened')
    expect('conditions' in inst(c, 'm2')).toBe(false)
    c = setCreatureLabel(c, 'm2', '')
    expect('label' in inst(c, 'm2')).toBe(false)
  })

  it('counts the uses of an action per creature', () => {
    let { character: c } = withMammoth()
    const roar = block(c).actions[3]
    expect(actionUses(c, roar, inst(c, 'burya'))).toEqual({ left: 1, max: 1 })
    expect(actionUses(c, roar, inst(c, 'm2'))).toEqual({ left: 0, max: 1 })
    expect(actionUses(c, block(c).actions[1], inst(c, 'm2'))).toBeUndefined()
    // spent: nothing more to spend; given back: the key goes
    expect(spendCreatureAction(c, 'm2', 'roar')).toBe(c)
    c = spendCreatureAction(c, 'm2', 'roar', -1)
    expect('used' in inst(c, 'm2')).toBe(false)
    c = spendCreatureAction(c, 'burya', 'rally')
    c = spendCreatureAction(c, 'burya', 'rally')
    expect(inst(c, 'burya').used).toEqual({ rally: 2 })
    expect(spendCreatureAction(c, 'burya', 'gore')).toBe(c)
  })

  it('removes one from play and keeps the stat block', () => {
    let { character: c } = withMammoth()
    c = removeFromPlay(c, 'burya')
    c = removeFromPlay(c, 'm2')
    expect(c.creatures).toHaveLength(1)
    expect('inPlay' in block(c)).toBe(false)
    expect(removeFromPlay(c, 'm2')).toBe(c)
  })
})

describe('stat blocks', () => {
  it('adds one, and replaces one without touching what is in play', () => {
    let { character: c } = hero()
    const k = mammothExample()
    c = saveCreature(c, k)
    expect(c.creatures).toHaveLength(1)
    c = addToPlay(c, k.id)
    c = damageCreature(c, block(c, k.id).inPlay![0].id, 30)
    // the editor's copy has no inPlay (it was opened before); the creature in play stays
    c = saveCreature(c, { ...k, name: 'War Mammoth' })
    expect(block(c, k.id)).toMatchObject({ name: 'War Mammoth', inPlay: [{ hp: { current: 96, max: 126 } }] })
  })

  it('a changed Hit Point number follows to the creatures that still had the old one', () => {
    let { character: c } = withMammoth()
    c = setCreatureHpMax(c, 'm2', 100)
    c = saveCreature(c, { ...block(c), hp: 140 })
    expect(inst(c, 'burya').hp).toMatchObject({ current: 140, max: 140 })
    // its maximum was set by hand: it stays
    expect(inst(c, 'm2').hp).toMatchObject({ current: 92, max: 100 })
  })

  it('an action that is gone takes what was spent of it', () => {
    let { character: c } = withMammoth()
    c = saveCreature(c, { ...block(c), actions: block(c).actions.filter((a) => a.id !== 'roar') })
    expect('used' in inst(c, 'm2')).toBe(false)
  })

  it('copies, moves and deletes; the last one deleted removes the field', () => {
    let { character: c } = withMammoth()
    c = duplicateCreature(c, 'mammoth')
    expect(c.creatures!.map((k) => k.name)).toEqual(['Mammoth', 'Mammoth (copy)'])
    expect('inPlay' in c.creatures![1]).toBe(false)
    expect(c.creatures![1].actions[0].id).not.toBe('multi')
    c = moveCreature(c, 'mammoth', 1)
    expect(c.creatures!.map((k) => k.name)).toEqual(['Mammoth (copy)', 'Mammoth'])
    expect(moveCreature(c, 'mammoth', 1)).toBe(c)
    c = deleteCreature(c, c.creatures![0].id)
    c = deleteCreature(c, 'mammoth')
    expect('creatures' in c).toBe(false)
    expect(deleteCreature(c, 'mammoth')).toBe(c)
  })

  it('the built-in Mammoth is the block of SRD 5.2.1 and reads back unchanged', () => {
    const k = mammothExample()
    expect(k).toMatchObject({ ac: 13, hp: 126, speed: '50 ft.', abilities: { str: 24, dex: 9, con: 21, int: 3, wis: 11, cha: 6 }, saves: { str: 10, con: 8 }, initiative: 2 })
    const { character, warnings } = hero({ creatures: [k] })
    expect(warnings).toEqual([])
    expect(JSON.stringify(character.creatures)).toBe(JSON.stringify([k]))
    expect(actionNumbers(character, k.actions[1])).toEqual({ toHit: '+10', damage: '2d10+7', damageType: 'Piercing' })
  })
})

describe('preferences.creatures', () => {
  it('has defaults that are never written', () => {
    let { character: c } = withMammoth()
    expect(creaturePrefs(c)).toEqual(DEFAULT_CREATURE_PREFS)
    c = setCreaturePref(c, 'where', 'tab')
    c = setCreaturePref(c, 'longRest', 'uses')
    c = setCreaturePref(c, 'rolls', false)
    expect(c.preferences.creatures).toEqual({ where: 'tab', longRest: 'uses', rolls: false })
    c = setCreaturePref(c, 'where', 'both')
    c = setCreaturePref(c, 'longRest', 'full')
    c = setCreaturePref(c, 'rolls', true)
    expect('creatures' in c.preferences).toBe(false)
    expect(setCreaturePref(c, 'shortRest', 'uses')).toBe(c)
  })

  it('chooses what the folded row shows, in a fixed order', () => {
    let { character: c } = withMammoth()
    c = setRowField(c, 'note', true)
    c = setRowField(c, 'ac', false)
    expect(c.preferences.creatures).toEqual({ row: ['bar', 'speed', 'attack', 'conditions', 'note'] })
    c = setRowField(c, 'ac', true)
    c = setRowField(c, 'note', false)
    expect('creatures' in c.preferences).toBe(false)
  })

  it('shows every creature in Play until one is hidden; a new one is shown; a removed one leaves the list', () => {
    let { character: c } = withMammoth()
    expect(creaturesShownInPlay(c).map((x) => x.instance.id)).toEqual(['burya', 'm2'])
    c = setPinned(c, 'm2', false)
    expect(c.preferences.creatures).toEqual({ pinned: ['burya'] })
    expect(isPinned(c, 'm2')).toBe(false)
    c = addToPlay(c, 'mammoth')
    const added = block(c).inPlay![2].id
    expect(c.preferences.creatures!.pinned).toEqual(['burya', added])
    c = removeFromPlay(c, 'burya')
    expect(c.preferences.creatures!.pinned).toEqual([added])
    // all shown again = the default: the list goes
    c = setPinned(c, 'm2', true)
    expect('creatures' in c.preferences).toBe(false)
    c = setPinned(c, 'm2', false)
    expect(pinAll(c).preferences.creatures).toBeUndefined()
  })

  it('reads a file\'s preferences and writes back only what is not the default', () => {
    const { character, warnings } = withMammoth({ preferences: { creatures: { where: 'both', pinned: ['m2'], row: ['conditions', 'attack', 'speed', 'ac', 'bar'], rolls: true, longRest: 'none', shortRest: 'uses' } } })
    expect(warnings).toEqual([])
    expect(character.preferences.creatures).toEqual({ pinned: ['m2'], longRest: 'none' })
  })
})

describe('rests', () => {
  const tired = () => {
    let { character: c } = withMammoth()
    c = damageCreature(c, 'burya', 50)
    c = spendCreatureAction(c, 'burya', 'rally', 2)
    c = spendCreatureAction(c, 'burya', 'snort', 1)
    return c
  }
  it('a Long Rest gives the creatures their Hit Points and what a rest brings back; a "Recharge" stays', () => {
    const r = longRest(tired())
    expect(inst(r.character, 'burya')).toEqual({ id: 'burya', label: 'Burya', hp: { current: 126, max: 126, temp: 0 } })
    expect(inst(r.character, 'm2')).toMatchObject({ hp: { current: 126, max: 126, temp: 0 }, used: { roar: 1 }, conditions: ['prone'] })
    expect(r.restored).toEqual(expect.arrayContaining(['Mammoth · Burya: Rally', 'Mammoth · Burya: Snort', 'Mammoth · Burya: Hit Points', 'Mammoth · 2: Hit Points']))
  })
  it('a Short Rest gives back only the uses that come back on a Short Rest', () => {
    const r = shortRest(tired())
    expect(inst(r.character, 'burya')).toMatchObject({ hp: { current: 76 }, used: { rally: 2 } })
    expect(r.restored).toContain('Mammoth · Burya: Snort')
    expect(r.restored).not.toContain('Mammoth · Burya: Hit Points')
  })
  it('a creature at 0 Hit Points is left as it is, with a reminder', () => {
    const c = damageCreature(tired(), 'burya', 999)
    const r = longRest(c)
    expect(inst(r.character, 'burya')).toEqual(inst(c, 'burya'))
    expect(r.reminders).toContain('Mammoth · Burya is at 0 Hit Points: the rest changed nothing for it.')
  })
  it('follows the preference: uses only, or nothing', () => {
    const uses = longRest(setCreaturePref(tired(), 'longRest', 'uses')).character
    expect(inst(uses, 'burya')).toMatchObject({ hp: { current: 76 } })
    expect('used' in inst(uses, 'burya')).toBe(false)
    expect(inst(uses, 'm2').hp.temp).toBe(5)
    const none = longRest(setCreaturePref(tired(), 'longRest', 'none')).character
    expect(none.creatures).toEqual(tired().creatures)
    const short = shortRest(setCreaturePref(tired(), 'shortRest', 'none')).character
    expect(short.creatures).toEqual(tired().creatures)
  })
  it('a hero without creatures rests as before', () => {
    const { character: c } = hero()
    expect('creatures' in longRest(c).character).toBe(false)
    expect('creatures' in shortRest(c).character).toBe(false)
  })
})

describe('the Roll button', () => {
  // a die that always shows its highest face, then its lowest
  const high = () => 0.999
  const low = () => 0
  it('rolls dice texts and refuses what is not dice', () => {
    expect(rollDice('2d10+7', high)).toEqual({ total: 27, detail: '2d10 (10, 10) + 7' })
    expect(rollDice('2d10 + 7', low)).toEqual({ total: 9, detail: '2d10 (1, 1) + 7' })
    expect(rollDice('d6 - 1', high)).toEqual({ total: 5, detail: '1d6 (6) − 1' })
    expect(rollDice('1d6+1d4', high)?.total).toBe(10)
    expect(rollDice('12', high)).toEqual({ total: 12, detail: '12' })
    expect(rollDice('2d10 fire')).toBeNull()
    expect(rollDice('')).toBeNull()
  })
  it('rolls an attack and its damage; a natural 20 rolls the damage dice twice', () => {
    const { character: c } = withMammoth()
    const gore = block(c).actions[1]
    expect(rollAction(c, gore, low)).toEqual({ attack: { d20: 1, bonus: 10, total: 11 }, damage: { total: 9, detail: '2d10 (1, 1) + 7' } })
    expect(rollAction(c, gore, high)).toEqual({ attack: { d20: 20, bonus: 10, total: 30 }, critical: true, damage: { total: 47, detail: '2d10 (10, 10) + 2d10 (10, 10) + 7' } })
    // a save, not an attack roll: only the damage
    expect(rollAction(c, block(c).actions[2], low)).toEqual({ damage: { total: 11, detail: '4d10 (1, 1, 1, 1) + 7' } })
    expect(rollAction(c, block(c).actions[0], low)).toEqual({})
  })
})

describe('a stat block never changes the hero', () => {
  it('leaves everything else of the character as it was', () => {
    const { character: c } = withMammoth()
    const { creatures: _a, ...before } = c
    const { creatures: _b, ...after } = damageCreature(addToPlay(c, 'mammoth'), 'm2', 10) as Character & { creatures: Creature[] }
    void _a
    void _b
    expect(after).toEqual(before)
  })
})

describe('what the app writes', () => {
  it('reads back character for character, whatever was done and in whatever order', () => {
    let { character: c } = hero()
    const k = mammothExample()
    c = setCreaturePref(c, 'shortRest', 'none')
    c = saveCreature(c, k)
    c = addToPlay(c, k.id, 3)
    const [a, b, d] = c.creatures![0].inPlay!.map((i) => i.id)
    c = setCreatureNote(c, a, 'Carries the tent.')
    c = toggleCreatureCondition(c, a, 'prone')
    c = damageCreature(c, a, 20)
    c = tempHpCreature(c, b, 7)
    c = setCreatureLabel(c, b, 'Burya')
    c = setPinned(c, d, false)
    c = setRowField(c, 'note', true)
    c = setCreaturePref(c, 'rolls', false)
    c = setCreaturePref(c, 'where', 'play')
    c = saveCreature(c, { ...c.creatures![0], extra: [{ label: 'Carries', value: '1,080 lb.' }], actions: [...c.creatures![0].actions, { id: 'roar', name: 'Roar', activation: 'action', uses: { max: 2, used: 0, recharge: 'long' }, description: '' }] })
    c = spendCreatureAction(c, b, 'roar')
    c = duplicateCreature(c, k.id)
    c = longRest(c).character
    const text = characterToJson(c)
    const back = importCharacterJson(text)
    expect(back.warnings).toEqual([])
    expect(characterToJson(back.character)).toBe(text)
    // the field stands where the importer puts it, and the choices in the importer's order
    expect(Object.keys(c).indexOf('creatures')).toBe(Object.keys(c).indexOf('recipes') - 1)
    expect(Object.keys(c.preferences.creatures!)).toEqual(['where', 'pinned', 'row', 'rolls', 'shortRest'])
  })
})
