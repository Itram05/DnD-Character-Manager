// The icon strip: what is read from the fields, what from the text, and that nothing is guessed.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CardStrip } from '../ui/CardStrip'
import { GameCard, type CardFace } from '../ui/GameCard'
import { cantripDice, cardStrip, castingAction, findArea, findDamage, findHeal, findSave, findTimes, mainText, shortDice, shortRange } from './strip'

describe('strip: action', () => {
  it('reads the casting time', () => {
    expect(castingAction('Action')).toEqual({ kind: 'action' })
    expect(castingAction('1 action')).toEqual({ kind: 'action' })
    expect(castingAction('Bonus Action')).toEqual({ kind: 'bonus' })
    expect(castingAction('1 bonus action')).toEqual({ kind: 'bonus' })
    expect(castingAction('Reaction, when hit by an attack')).toEqual({ kind: 'reaction' })
    expect(castingAction('10 minutes')).toEqual({ kind: 'time', label: '10 min' })
    expect(castingAction('1 minute')).toEqual({ kind: 'time', label: '1 min' })
    expect(castingAction('1 hour')).toEqual({ kind: 'time', label: '1 h' })
    expect(castingAction('')).toBeUndefined()
    expect(castingAction('whenever you like')).toBeUndefined()
  })
  it('an item power uses its activation; passive has none', () => {
    expect(cardStrip({ activation: 'reaction' }).action).toEqual({ kind: 'reaction' })
    expect(cardStrip({ activation: 'special' }).action).toEqual({ kind: 'special' })
    expect(cardStrip({ activation: 'passive' }).action).toBeUndefined()
  })
  it('the casting time wins over the activation (a scroll holding a Bonus Action spell)', () => {
    expect(cardStrip({ castingTime: 'Bonus Action', activation: 'action' }).action).toEqual({ kind: 'bonus' })
  })
})

describe('strip: range and area', () => {
  it('short ranges', () => {
    expect(shortRange('60 feet')).toBe('60 ft')
    expect(shortRange('1,000 feet')).toBe('1000 ft')
    expect(shortRange('Self')).toBe('Self')
    expect(shortRange('touch')).toBe('Touch')
    expect(shortRange('1 mile')).toBe('1 mi')
    expect(shortRange('Special (see text)')).toBeUndefined()
  })
  it('areas in any of the usual spellings', () => {
    expect(findArea('20-foot-radius sphere')).toEqual({ shape: 'sphere', size: '20 ft' })
    expect(findArea('Each creature in a 20-foot-radius Sphere centered there')).toEqual({ shape: 'sphere', size: '20 ft' })
    expect(findArea('15-foot radius')).toEqual({ shape: 'radius', size: '15 ft' })
    expect(findArea('Each creature in a 60-foot Cone originating from you')).toEqual({ shape: 'cone', size: '60 ft' })
    expect(findArea('fits within a 5-foot cube')).toEqual({ shape: 'cube', size: '5 ft' })
    expect(findArea('5-mile radius')).toEqual({ shape: 'radius', size: '5 mi' })
    expect(findArea('a 10-foot-radius, 40-foot-high Cylinder')).toEqual({ shape: 'cylinder', size: '10 ft' })
    expect(findArea('a Line 100 feet long and 5 feet wide')).toEqual({ shape: 'line', size: '100 ft' })
    expect(findArea('a 15-foot Emanation')).toEqual({ shape: 'emanation', size: '15 ft' })
    expect(findArea('one creature within 5 feet of you')).toBeUndefined()
  })
  it('"120 feet (20-foot-radius sphere)" is a range and an area', () => {
    expect(cardStrip({ range: '120 feet (20-foot-radius sphere)' })).toMatchObject({ range: '120 ft', area: { shape: 'sphere', size: '20 ft' } })
    expect(cardStrip({ range: 'Self (15-foot radius)' })).toMatchObject({ range: 'Self', area: { shape: 'radius', size: '15 ft' } })
  })
  it('"Self (5-foot radius)" of a melee cantrip is its reach, not an area', () => {
    const s = cardStrip({ range: 'Self (5-foot radius)', text: 'You make a melee attack with the weapon against one creature within 5 feet of you.' })
    expect(s.range).toBe('5 ft')
    expect(s.area).toBeUndefined()
  })
  it('without a range field, "within 30 ft" in the text is the range; with one, the text is not read', () => {
    expect(cardStrip({ text: 'Absorb Elements on you or an ally within 30 ft.' }).range).toBe('30 ft')
    expect(cardStrip({ range: 'Touch', text: 'a creature within 30 feet' }).range).toBe('Touch')
  })
})

describe('strip: damage and save from the text', () => {
  it('the first damage: dice and type, flat, untyped, type only', () => {
    expect(findDamage('Wisdom save, 3d8 Radiant (half on success)')).toEqual({ dice: '3d8', type: 'radiant' })
    expect(findDamage('taking 8d6 Fire damage on a failed save')).toEqual({ dice: '8d6', type: 'fire' })
    expect(findDamage('melee spell attack, 1d8 + Cha Force')).toEqual({ dice: '1d8+Cha', type: 'force' })
    expect(findDamage('1d8 + your spellcasting ability modifier fire damage')).toEqual({ dice: '1d8+mod', type: 'fire' })
    expect(findDamage('Dex save, 20 Radiant (half on success)')).toEqual({ dice: '20', type: 'radiant' })
    expect(findDamage('+1d6 damage on your weapon hits')).toEqual({ dice: '1d6' })
    expect(findDamage('takes fire damage equal to your spellcasting ability modifier')).toEqual({ type: 'fire' })
    expect(findDamage("This movement doesn't have enough force to cause damage.")).toBeUndefined()
    expect(findDamage('subtract 1d4 from attack rolls')).toBeUndefined()
  })
  it('shortDice', () => {
    expect(shortDice('1d8 + Charisma modifier')).toBe('1d8+Cha')
    expect(shortDice('2d6  +  3')).toBe('2d6+3')
  })
  it('the save the target makes, not a bonus to saves', () => {
    expect(findSave('The target must succeed on a Wisdom saving throw or be paralyzed')).toBe('wis')
    expect(findSave('Each creature in the sphere makes an **Intelligence save**')).toBe('int')
    expect(findSave('Up to 3 creatures: Cha save or subtract 1d4')).toBe('cha')
    expect(findSave('You have advantage on Wisdom saving throws against magic')).toBeUndefined()
    expect(findSave('+1 to Dexterity saving throws while you hold it')).toBeUndefined()
    expect(findSave('Once per long rest, no saving throw: the mind is open')).toBeUndefined()
    expect(findSave('+1 spell save DC')).toBeUndefined()
  })
  it('only the text before "At Higher Levels" / "Using a Higher-Level Spell Slot" counts', () => {
    const text = 'A creature takes fire damage equal to your modifier.\n\nAt Higher Levels. At 5th level, the attack deals an extra 1d8 fire damage.'
    expect(mainText(text).trim()).toBe('A creature takes fire damage equal to your modifier.')
    expect(cardStrip({ text }).damage).toEqual({ type: 'fire' })
    expect(mainText('Boom.\n\n_Using a Higher-Level Spell Slot._ More boom.').trim()).toBe('Boom.')
  })
})

describe('strip: cantrips grow with the character level', () => {
  const toll = 'The target must succeed on a Wisdom saving throw or take 1d8 necrotic damage.\n\nAt Higher Levels. The damage increases by one die when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8).'
  it('one die more at 5, 11 and 17', () => {
    expect(cantripDice('1d8', toll, 4)).toBe('1d8')
    expect(cantripDice('1d8', toll, 5)).toBe('2d8')
    expect(cantripDice('1d8', toll, 14)).toBe('3d8')
    expect(cantripDice('1d8', toll, 17)).toBe('4d8')
    expect(cardStrip({ text: toll, cantripLevel: 14 }).damage).toEqual({ dice: '3d8', type: 'necrotic' })
  })
  it('the 2024 wording counts too', () => {
    expect(cantripDice('1d10', 'Boom 1d10 Fire.\n\n_Cantrip Upgrade._ The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).', 11)).toBe('3d10')
  })
  it('a text with the dice already worked out, or without an upgrade line, is left alone', () => {
    expect(cardStrip({ text: 'Ranged spell attack, 3d10 Fire.', cantripLevel: 14 }).damage).toEqual({ dice: '3d10', type: 'fire' })
    expect(cardStrip({ text: 'Takes 1d8 cold damage.', cantripLevel: 14 }).damage).toEqual({ dice: '1d8', type: 'cold' })
  })
})

describe('strip: healing', () => {
  it('reads the healing in the usual wordings', () => {
    // SRD 2024
    expect(findHeal('A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.')).toEqual({ dice: '2d8+mod' })
    expect(findHeal('within range regains Hit Points equal to 2d4 plus your spellcasting ability modifier.')).toEqual({ dice: '2d4+mod' })
    expect(findHeal('A creature you touch regains 4d8 + 15 Hit Points.')).toEqual({ dice: '4d8+15' })
    expect(findHeal('Positive energy washes through the target, restoring 70 Hit Points.')).toEqual({ dice: '70' })
    expect(findHeal('You restore up to 700 Hit Points, divided as you choose')).toEqual({ dice: '700' })
    expect(findHeal('gain the benefits of a Short Rest and also regain 2d8 Hit Points.')).toEqual({ dice: '2d8' })
    expect(findHeal('The target regains all its Hit Points.')).toEqual({ dice: 'all' })
    // notes as written by hand (Grav)
    expect(findHeal('Heal 1d8 + Cha modifier, +1d8 per slot level above 1st.')).toEqual({ dice: '1d8+Cha' })
    expect(findHeal('Heal 1d4 + Cha modifier. Best for picking up a fallen ally.')).toEqual({ dice: '1d4+Cha' })
  })
  it('Temporary Hit Points are marked as such', () => {
    expect(findHeal('You gain 2d4 + 4 Temporary Hit Points.')).toEqual({ dice: '2d4+4', temp: true })
    expect(findHeal('gains Temporary Hit Points equal to your spellcasting ability modifier')).toEqual({ temp: true })
  })
  it('healing without a number is the icon alone; "can not regain" is not healing', () => {
    expect(findHeal('you regain Hit Points equal to half the amount of Necrotic damage dealt')).toEqual({})
    expect(findHeal("the target takes 1d10 Necrotic damage, and it can't regain Hit Points until the end of your next turn")).toBeUndefined()
    expect(findHeal('The first time the target would drop to 0 hit points')).toBeUndefined()
    expect(findHeal("Each target's Hit Point maximum and current Hit Points increase by 5")).toBeUndefined()
  })
  it('on the strip, next to the damage; the upgrade line does not count', () => {
    const cure = 'A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.\n\n_Using a Higher-Level Spell Slot._ The healing increases by 2d8 for each spell slot level above 1.'
    expect(cardStrip({ castingTime: 'Action', range: 'Touch', text: cure })).toEqual({ action: { kind: 'action' }, range: 'Touch', heal: { dice: '2d8+mod' } })
    const vamp = 'On a hit, the target takes 3d6 Necrotic damage, and you regain Hit Points equal to half the amount of Necrotic damage dealt.'
    expect(cardStrip({ text: vamp })).toMatchObject({ damage: { dice: '3d6', type: 'necrotic' }, heal: {} })
  })
})

describe('strip: rays, beams and darts', () => {
  const ray = 'You hurl three fiery rays. You can hurl them at one target within range or at several. Make a ranged spell attack for each ray. On a hit, the target takes 2d6 Fire damage.\n\n_Using a Higher-Level Spell Slot._ You create one additional ray for each spell slot level above 2.'
  const missile = 'You create three glowing darts of magical force. Each dart strikes a creature of your choice that you can see within range. A dart deals 1d4 + 1 Force damage to its target.\n\n_Using a Higher-Level Spell Slot._ The spell creates one more dart for each spell slot level above 1.'
  const blast = 'You hurl a beam of crackling energy. Make a ranged spell attack against one creature or object in range. On a hit, the target takes 1d10 Force damage.\n\n_Cantrip Upgrade._ The spell creates two beams at level 5, three beams at level 11, and four beams at level 17. You can direct the beams at the same target or at different ones.'
  const blast2014 = 'A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage.\n\nAt Higher Levels. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level.'
  it('the count in the text', () => {
    expect(findTimes(ray)).toBe(3)
    expect(findTimes(missile)).toBe(3)
    expect(cardStrip({ text: ray }).damage).toEqual({ dice: '2d6', type: 'fire', times: 3 })
    expect(cardStrip({ text: missile }).damage).toEqual({ dice: '1d4+1', type: 'force', times: 3 })
  })
  it('Eldritch Blast: beams by the character level, and each beam keeps its 1d10', () => {
    expect(findTimes(blast, 4)).toBeUndefined()
    expect(findTimes(blast, 5)).toBe(2)
    expect(findTimes(blast, 14)).toBe(3)
    expect(findTimes(blast, 17)).toBe(4)
    expect(findTimes(blast2014, 11)).toBe(3)
    expect(cardStrip({ text: blast, cantripLevel: 14 }).damage).toEqual({ dice: '1d10', type: 'force', times: 3 })
    expect(cardStrip({ text: blast2014, cantripLevel: 14 }).damage).toEqual({ dice: '1d10', type: 'force', times: 3 })
  })
  it('no count said, no count shown', () => {
    expect(findTimes('Up to three creatures of your choice make a Charisma saving throw')).toBeUndefined()
    expect(findTimes('A silvery beam of pale light shines down')).toBeUndefined()
    expect(cardStrip({ text: 'The target takes 8d6 Fire damage.' }).damage).toEqual({ dice: '8d6', type: 'fire' })
  })
})

describe('strip: nothing is guessed', () => {
  it('a card with nothing to read has an empty strip', () => {
    expect(cardStrip({})).toEqual({})
    expect(cardStrip({ text: 'Advantage on your initiative roll.' })).toEqual({})
  })
})

describe('strip: on the card', () => {
  const face = (over: Partial<CardFace>): CardFace => ({
    key: 'k',
    kind: 'spell',
    id: 'x',
    name: 'Shatter',
    frame: 'spell',
    sourceLabel: 'Sorcerer',
    zone: 'action',
    cost: '2',
    spellLevel: 2,
    text: '',
    tapped: false,
    ...over,
  })
  it('shows only the values that are there, each with a label', () => {
    const html = renderToString(<CardStrip strip={{ action: { kind: 'action' }, range: '60 ft', save: 'con' }} />)
    expect(html).toContain('aria-label="Action"')
    expect(html).toContain('aria-label="Range: 60 ft"')
    expect(html).toContain('aria-label="Constitution saving throw"')
    expect(html).toContain('CON')
    expect(html).not.toContain('strip-area')
    expect(html).not.toContain('strip-damage')
  })
  it('damage in its type colour, with dice and type in the label', () => {
    const html = renderToString(<CardStrip strip={{ damage: { dice: '3d8', type: 'thunder' } }} />)
    expect(html).toContain('dmg-thunder')
    expect(html).toContain('aria-label="Damage: 3d8 Thunder"')
  })
  it('healing in green with its amount; Temporary Hit Points get their own label', () => {
    const html = renderToString(<CardStrip strip={{ heal: { dice: '2d8+mod' } }} />)
    expect(html).toContain('strip-heal')
    expect(html).toContain('aria-label="Healing: 2d8+mod"')
    expect(renderToString(<CardStrip strip={{ heal: {} }} />)).toContain('aria-label="Healing"')
    expect(renderToString(<CardStrip strip={{ heal: { dice: '2d4+4', temp: true } }} />)).toContain('aria-label="Temporary Hit Points: 2d4+4"')
  })
  it('"×3" beside the damage dice', () => {
    const html = renderToString(<CardStrip strip={{ damage: { dice: '2d6', type: 'fire', times: 3 } }} />)
    expect(html).toContain('×3')
    expect(html).toContain('3 times')
  })
  it('an empty strip renders nothing', () => {
    expect(renderToString(<CardStrip strip={{}} />)).toBe('')
    expect(renderToString(<CardStrip />)).toBe('')
  })
  it('the card shows the strip; a ritual is its icon there instead of the "R" tag', () => {
    const withRitual = renderToString(<GameCard card={face({ ritual: true, strip: { action: { kind: 'action' }, ritual: true } })} mode="cards" onOpen={() => {}} />)
    expect(withRitual).toContain('card-strip')
    expect(withRitual).toContain('strip-ritual')
    expect(withRitual).not.toContain('>R</span>')
    const noStrip = renderToString(<GameCard card={face({ ritual: true })} mode="cards" onOpen={() => {}} />)
    expect(noStrip).not.toContain('card-strip')
    expect(noStrip).toContain('>R</span>')
  })
})
