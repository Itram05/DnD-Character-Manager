// A feature that spends another feature's uses (Feature.poolId, Feature.cost): Channel Divinity and its
// options, Wild Shape, Monk's Focus. Found by the blind test of AI-GUIDE.md on 2026-10-03: the options' cards
// had no "Use" and spent nothing, the player tapped the pool's card in Free / Other separately.
import { describe, expect, it } from 'vitest'
import { importCharacterJson, normalizeCharacter } from './normalize'
import { deleteFeature, featureAffordable, featureCard, featurePool, playCards, poolChoices, poolOptions, spendFeature, useCard } from './play'
import { longRest, shortRest } from './rest'
import { characterToJson } from './storage'
import type { Character } from './types'

const cleric = (features: object[] = []) => ({
  schemaVersion: 3,
  name: 'Test',
  abilities: { wis: 16 },
  classes: [{ id: 'cleric', level: 6 }],
  features: [
    { id: 'cd', name: 'Channel Divinity', source: { type: 'class', name: 'Cleric 2' }, activation: 'special', description: 'The pool.', uses: { max: 'cleric.channel-divinity', used: 0, recharge: 'long', shortRestRegain: 1 } },
    { id: 'turn', name: 'Turn Undead', source: { type: 'class', name: 'Cleric 2' }, activation: 'action', description: 'Turn.', poolId: 'cd', cost: 1 },
    { id: 'life', name: 'Preserve Life', source: { type: 'subclass', name: 'Life Domain 3' }, activation: 'action', description: 'Heal.', poolId: 'cd' },
    { id: 'big', name: 'Double Channel', source: { type: 'other', name: 'Homebrew' }, activation: 'action', description: 'Costs two.', poolId: 'cd', cost: 2 },
    ...features,
  ],
})
const read = (raw: object) => normalizeCharacter(raw)
const c = read(cleric()).character
const left = (x: Character, id: string) => featureCard(x, x.features.find((f) => f.id === id)!).uses
const used = (x: Character, id = 'cd') => x.features.find((f) => f.id === id)!.uses!.used

describe('an option that spends a pool', () => {
  it('imports clean, and keeps the link as written (cost absent stays absent and counts as 1)', () => {
    expect(read(cleric()).warnings).toEqual([])
    expect(c.features.map((f) => [f.id, f.poolId, f.cost])).toEqual([
      ['cd', undefined, undefined],
      ['turn', 'cd', 1],
      ['life', 'cd', undefined],
      ['big', 'cd', 2],
    ])
  })
  it("its card shows the pool's counter and names the pool", () => {
    const card = featureCard(c, c.features[1])
    expect(card.uses).toEqual({ left: 3, max: 3 })
    expect(card.pool).toEqual({ id: 'cd', name: 'Channel Divinity', cost: 1 })
    expect(card.tapped).toBe(false)
    expect(featureCard(c, c.features[2]).pool!.cost).toBe(1)
    expect(featureCard(c, c.features[3]).pool!.cost).toBe(2)
    // the pool's own card is what it was
    expect(featureCard(c, c.features[0])).toMatchObject({ uses: { left: 3, max: 3 }, tapped: false })
    expect(featureCard(c, c.features[0]).pool).toBeUndefined()
  })
  it('Use spends from the pool; every card of the pool shows the same counter', () => {
    const one = useCard(c, { kind: 'feature', id: 'turn' })
    expect(used(one)).toBe(1)
    for (const id of ['cd', 'turn', 'life', 'big']) expect(left(one, id)).toEqual({ left: 2, max: 3 })
    const three = useCard(one, { kind: 'feature', id: 'big' })
    expect(used(three)).toBe(3)
    expect(playCards(three).filter((x) => x.kind === 'feature').map((x) => x.tapped)).toEqual([true, true, true, true])
  })
  it('Undo gives the cost back', () => {
    const spent = useCard(useCard(c, { kind: 'feature', id: 'big' }), { kind: 'feature', id: 'turn' })
    expect(used(spent)).toBe(3)
    expect(used(useCard(spent, { kind: 'feature', id: 'big' }, -1))).toBe(1)
    expect(used(useCard(spent, { kind: 'feature', id: 'turn' }, -1))).toBe(2)
    // never below nothing spent
    expect(used(useCard(c, { kind: 'feature', id: 'big' }, -1))).toBe(0)
  })
  it('cannot be used when the pool has less than its cost: nothing is spent, the card is tapped', () => {
    const two = spendFeature(spendFeature(c, 'turn'), 'life')
    expect(used(two)).toBe(2)
    const big = two.features[3]
    expect(featureAffordable(two, big)).toBe(false)
    expect(featureCard(two, big).tapped).toBe(true)
    expect(spendFeature(two, 'big')).toBe(two)
    // one is left, so the options that cost one still work
    expect(featureCard(two, two.features[1]).tapped).toBe(false)
  })
  it('tapping the pool card itself still works, as before', () => {
    expect(used(useCard(c, { kind: 'feature', id: 'cd' }))).toBe(1)
    expect(used(useCard(useCard(c, { kind: 'feature', id: 'cd' }), { kind: 'feature', id: 'cd' }, -1))).toBe(0)
  })
  it('rests restore the pool as before: 1 on a Short Rest, all on a Long Rest', () => {
    const spent = spendFeature(spendFeature(spendFeature(c, 'turn'), 'life'), 'turn')
    expect(used(spent)).toBe(3)
    expect(used(shortRest(spent).character)).toBe(2)
    expect(used(longRest(spent).character)).toBe(0)
    expect(left(longRest(spent).character, 'turn')).toEqual({ left: 3, max: 3 })
  })
  it('an option with uses of its own spends both (once per Long Rest AND one from the pool)', () => {
    const x = read(cleric([{ id: 'once', name: 'Once', activation: 'action', description: '', poolId: 'cd', uses: { max: 1, used: 0, recharge: 'long' } }])).character
    expect(left(x, 'once')).toEqual({ left: 1, max: 1 })
    const after = spendFeature(x, 'once')
    expect([used(after), used(after, 'once')]).toEqual([1, 1])
    expect(featureCard(after, after.features[4]).tapped).toBe(true)
    expect(spendFeature(after, 'once')).toBe(after)
    const back = spendFeature(after, 'once', -1)
    expect([used(back), used(back, 'once')]).toEqual([0, 0])
  })
  it('a feature without a pool behaves as it always did', () => {
    const x = read({ name: 'T', features: [{ id: 'sw', name: 'Second Wind', activation: 'bonus', uses: { max: 2, used: 0, recharge: 'short' } }, { id: 'p', name: 'Plain', activation: 'action' }] }).character
    expect(used(useCard(x, { kind: 'feature', id: 'sw' }), 'sw')).toBe(1)
    expect(used(useCard(useCard(useCard(x, { kind: 'feature', id: 'sw' }), { kind: 'feature', id: 'sw' }), { kind: 'feature', id: 'sw' }), 'sw')).toBe(2)
    expect(featureCard(x, x.features[1])).toMatchObject({ uses: undefined, tapped: false })
    expect('pool' in featureCard(x, x.features[1])).toBe(false)
    expect(useCard(x, { kind: 'feature', id: 'p' })).toBe(x)
  })
})

describe('the pool link in a file', () => {
  it('export and import again: the same character, no warnings', () => {
    const again = importCharacterJson(characterToJson(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
    expect(characterToJson(again.character)).toBe(characterToJson(c))
  })
  it('a file without the fields imports as before: no warning, no field added', () => {
    const { character, warnings } = read({ name: 'Old', features: [{ id: 'a', name: 'Rage', activation: 'bonus', uses: { max: 2, used: 0, recharge: 'long' } }] })
    expect(warnings).toEqual([])
    expect(Object.keys(character.features[0])).toEqual(['id', 'name', 'source', 'activation', 'description', 'uses'])
  })
  it('the pool is missing: a clear warning, the link is removed', () => {
    const raw = cleric()
    raw.features = raw.features.filter((f) => (f as { id: string }).id !== 'cd')
    const { character, warnings } = read(raw)
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toBe('features[0]: "Turn Undead" spent the uses of a feature that is not in the list (poolId "cd"); the link was removed, so its card spends nothing. Set it again in the feature\'s editor ("Spends uses of").')
    expect(character.features.every((f) => f.poolId === undefined && f.cost === undefined)).toBe(true)
    // and the next import of what was saved is silent
    expect(importCharacterJson(characterToJson(character)).warnings).toEqual([])
  })
  it('the pool was given a new id by hand (a "rename" of the id): the same warning, with the old id in it', () => {
    const raw = cleric()
    ;(raw.features[0] as { id: string }).id = 'channel'
    expect(read(raw).warnings[0]).toContain('poolId "cd"')
  })
  it('renaming the pool in the app keeps the link: it is an id, not a name', () => {
    const renamed = { ...c, features: c.features.map((f) => (f.id === 'cd' ? { ...f, name: 'Channel Divinity (3/day)' } : f)) }
    expect(featureCard(renamed, renamed.features[1]).pool!.name).toBe('Channel Divinity (3/day)')
    expect(importCharacterJson(characterToJson(renamed)).warnings).toEqual([])
  })
  it('poolId holds the NAME of the pool (a hand-written file): linked by name, and said', () => {
    const raw = cleric()
    ;(raw.features[1] as { poolId: string }).poolId = ' channel divinity '
    const { character, warnings } = read(raw)
    expect(warnings).toEqual(['features[1]: "Turn Undead" now spends the uses of "Channel Divinity" (poolId was its name; it is the feature\'s id now).'])
    expect(character.features[1].poolId).toBe('cd')
  })
  it('a name two features share is not guessed', () => {
    const raw = cleric([{ id: 'cd2', name: 'Channel Divinity', activation: 'special', uses: 1 }])
    ;(raw.features[1] as { poolId: string }).poolId = 'Channel Divinity'
    expect(read(raw).warnings[0]).toContain('is not in the list')
  })
  it('the pool has no counter: the link stays (it works once the pool gets uses), with a warning; the card spends nothing', () => {
    const raw = cleric()
    delete (raw.features[0] as { uses?: unknown }).uses
    const { character, warnings } = read(raw)
    expect(warnings[0]).toBe('features[1]: "Turn Undead" spends the uses of "Channel Divinity", which has no counter (uses); its card spends nothing until "Channel Divinity" gets one.')
    expect(character.features[1].poolId).toBe('cd')
    expect(featurePool(character, character.features[1])).toBeUndefined()
    expect(featureCard(character, character.features[1])).toMatchObject({ uses: undefined, tapped: false })
    expect(featureCard(character, character.features[1]).pool).toBeUndefined()
  })
  it('a feature that names itself, a cost without a pool, a cost that is not a whole number above 0', () => {
    const { character, warnings } = read({
      name: 'T',
      features: [
        { id: 'a', name: 'A', uses: 2, poolId: 'a' },
        { id: 'b', name: 'B', cost: 2 },
        { id: 'c', name: 'C', poolId: 'a', cost: 1.5 },
        { id: 'd', name: 'D', poolId: 'a', cost: 0 },
      ],
    })
    expect(warnings).toEqual([
      'features[1].cost: ignored: a cost needs "poolId", the feature whose uses it spends.',
      'features[2].cost: 1.5 is not a whole number; using 2.',
      'features[3].cost: 0 is out of range; using 1.',
      'features[0]: "A" named itself as the feature whose uses it spends (poolId); the link was removed.',
    ])
    expect(character.features.map((f) => [f.poolId, f.cost])).toEqual([[undefined, undefined], [undefined, undefined], ['a', 2], ['a', 1]])
  })
})

describe('the pool link in the editor', () => {
  it('offers every other feature with a counter', () => {
    expect(poolChoices(c, c.features[1]).map((f) => f.id)).toEqual(['cd'])
    expect(poolChoices(c, c.features[0])).toEqual([])
  })
  it('the pool knows who spends it', () => {
    expect(poolOptions(c, c.features[0]).map((f) => f.name)).toEqual(['Turn Undead', 'Preserve Life', 'Double Channel'])
  })
  it('deleting the pool unlinks its options, so nothing points at a feature that is gone', () => {
    const x = deleteFeature(c, 'cd')
    expect(x.features.map((f) => f.id)).toEqual(['turn', 'life', 'big'])
    expect(x.features.every((f) => !('poolId' in f) && !('cost' in f))).toBe(true)
    expect(importCharacterJson(characterToJson(x)).warnings).toEqual([])
  })
  it('deleting an option leaves the pool and the other options alone', () => {
    const x = deleteFeature(c, 'turn')
    expect(x.features.map((f) => [f.id, f.poolId])).toEqual([['cd', undefined], ['life', 'cd'], ['big', 'cd']])
  })
})
