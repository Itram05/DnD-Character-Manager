// Creatures on screen (server render, no browser): the stat block, its editor, the Creatures tab, the section
// of the Play screen on a phone and on a computer, a creature's window, and what the preferences change.
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { damageCreature, mammothExample, setCreaturePref, setPinned, setRowField, spendCreatureAction, toggleCreatureCondition } from '../model/creatures'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import { CreatureEditor } from './CreatureEditor'
import { CreaturePanel, CreaturesSection, CreaturesView, hpTone } from './Creatures'
import { PlayView } from './PlayView'
import type { SheetApi } from './Sheet'
import { shownTabs } from './Sheet'
import { StatBlock, actionLine, rollToast } from './StatBlock'

const strip = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })
const onComputer = (render: () => string) => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }), localStorage: { getItem: () => null, setItem() {} } })
  try {
    return render()
  } finally {
    vi.unstubAllGlobals()
  }
}

const MAMMOTH = {
  ...mammothExample(),
  id: 'mammoth',
  extra: [{ label: 'Carries', value: '1,080 lb.' }],
  inPlay: [
    { id: 'burya', label: 'Burya', hp: { current: 126, max: 126, temp: 0 } },
    { id: 'm2', label: '2', hp: { current: 40, max: 126, temp: 5 }, conditions: ['prone', 'mounted'], note: 'Limps.' },
  ],
}
MAMMOTH.actions = [...MAMMOTH.actions, { id: 'roar', name: 'Roar', activation: 'action', uses: { max: 1, used: 0, recharge: 'other', note: 'Recharge 5–6' }, description: 'Frightens.' }, { id: 'thick', name: 'Thick Hide', activation: 'passive', description: 'It is cold-proof.' }]
const hero = (extra: Record<string, unknown> = {}) => normalizeCharacter({ schemaVersion: 3, id: 'h', name: 'Grav', classes: [{ id: 'paladin', level: 5 }], creatures: [MAMMOTH], ...extra }).character
const c = hero()
const k = c.creatures![0]

describe('the stat block', () => {
  it('prints the numbers as the block gives them, grouped as a stat block is', () => {
    const text = strip(renderToString(<StatBlock c={c} creature={k} />))
    expect(text).toContain('AC 13')
    expect(text).toContain('HP 126')
    expect(text).toContain('Speed 50 ft.')
    expect(text).toContain('Initiative +2')
    expect(text).toContain('Hit Points from 11d12 + 55')
    // score, modifier, saving throw: Strength 24 is +7, the block's own save is +10
    expect(text).toContain('STR 24 +7 +10')
    expect(text).toContain('DEX 9 −1 −1')
    expect(text).toContain('Senses Passive Perception 10')
    expect(text).toContain('Carries 1,080 lb.')
    expect(text).toMatch(/Traits Thick Hide .* Actions Multiattack .* Gore \+10 to hit · 2d10\+7 Piercing .* Bonus actions Trample DEX save DC 18 · 4d10\+7 Bludgeoning/)
    // no creature: a limit is text, and nothing can be rolled without a handler
    expect(text).toContain('Uses: 1 Recharge 5–6')
    expect(renderToString(<StatBlock c={c} creature={k} />)).not.toContain('sb-roll')
  })
  it('shows one creature\'s uses as dots, and Roll where there is something to roll', () => {
    const spent = spendCreatureAction(c, 'm2', 'roar')
    const html = renderToString(<StatBlock c={spent} creature={spent.creatures![0]} instance={spent.creatures![0].inPlay![1]} onSpend={() => {}} onRoll={() => {}} />)
    expect(html).toContain('aria-label="Roar: 0 of 1 left"')
    expect(html).toContain('sb-act spent')
    // Gore and Trample can be rolled; Multiattack and the roar have no numbers
    expect(html.match(/class="btn btn-small sb-roll"/g)).toHaveLength(2)
    // the creature's own window shows its Hit Points itself
    expect(strip(html)).not.toContain('HP 126')
  })
  it('says what was rolled', () => {
    const low = () => 0
    expect(actionLine(c, k.actions[1])).toEqual(['+10 to hit', '2d10+7 Piercing'])
    expect(rollToast(c, 'Mammoth · 2', k.actions[1], low)).toEqual({ title: 'Mammoth · 2: Gore', lines: ['To hit: 11 (natural 1. d20 1 +10)', 'Damage: 9 Piercing · 2d10 (1, 1) + 7'], tone: 'info' })
    expect(rollToast(c, 'Mammoth', k.actions[2], low).lines).toEqual(['Damage: 11 Bludgeoning · 4d10 (1, 1, 1, 1) + 7', 'DEX save DC 18'])
    expect(rollToast(c, 'Mammoth', k.actions[1], () => 0.999)).toMatchObject({ tone: 'good', lines: ['To hit: 30 (natural 20! d20 20 +10) · damage dice rolled twice', 'Damage: 47 Piercing · 2d10 (10, 10) + 2d10 (10, 10) + 7'] })
  })
})

describe('the editor of a stat block', () => {
  it('has every field of the block, filled in', () => {
    const html = renderToString(<CreatureEditor api={api(c)} initial={k} onClose={() => {}} />)
    const text = strip(html)
    expect(text).toContain('Edit stat block')
    for (const label of ['Name', 'Size, type, alignment', 'Armor Class', 'Hit Points', 'Hit Dice (shown only)', 'Speed', 'Initiative', 'CR', 'STR (+7)', 'STR save', 'Skills', 'Vulnerabilities', 'Resistances', 'Immunities', 'Senses', 'Languages', 'Traits and actions', 'Your own lines', 'Notes'])
      expect(text, label).toContain(label)
    for (const value of ['value="Mammoth"', 'value="Huge Beast, Unaligned"', 'value="13"', 'value="126"', 'value="11d12 + 55"', 'value="50 ft."', 'value="24"', 'value="Carries"', 'value="1,080 lb."']) expect(html, value).toContain(value)
    // a save the block does not give shows the modifier as what counts when left empty
    expect(html).toContain('placeholder="−1"')
    // the lines of the block, folded, with their numbers
    expect(text).toContain('Gore Action +10 to hit · 2d10+7 Piercing')
    expect(text).toContain('Thick Hide Trait')
    expect(text).toContain('+ Trait')
    expect(text).toContain('+ Reaction')
    // two of them are in play: the editor says the change is for both
    expect(text).toContain('2 of these in play')
    expect(text).toContain('Delete')
  })
  it('opens empty for a new one, with nothing to delete', () => {
    const blank = { id: 'new', name: '', ac: 10, hp: 10, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, actions: [] }
    const text = strip(renderToString(<CreatureEditor api={api(c)} initial={blank} onClose={() => {}} />))
    expect(text).toContain('New stat block')
    expect(text).toContain('Nothing yet.')
    expect(text).not.toContain('Delete')
    expect(text).not.toContain('of these in play')
  })
})

describe('the Creatures tab', () => {
  it('lists every stat block with the ones in play', () => {
    const text = strip(renderToString(<CreaturesView api={api(c)} />))
    expect(text).toContain('New stat block')
    expect(text).toContain('Mammoth (SRD 5.2.1)')
    expect(text).toContain('Mammoth (2 in play)')
    expect(text).toContain('Mammoth · Burya 126 / 126')
    expect(text).toContain('Mammoth · 2 40 / 126 +5')
    expect(text).toContain('Put in play')
  })
  it('says so when a hero has none', () => {
    expect(strip(renderToString(<CreaturesView api={api(hero({ creatures: [] }))} />))).toContain('No stat blocks yet.')
  })
  it('is in the tab row unless the hero keeps creatures only in Play', () => {
    expect(shownTabs(c)).toContain('creatures')
    expect(shownTabs(setCreaturePref(c, 'where', 'tab'))).toContain('creatures')
    expect(shownTabs(setCreaturePref(c, 'where', 'play'))).not.toContain('creatures')
  })
})

describe('the Creatures section of Play', () => {
  const section = (x: Character, open?: boolean) => renderToString(<CreaturesSection api={api(x)} id="play-creatures" initiallyOpen={open} />)
  it('is one line on a phone until opened, with a small bar per creature', () => {
    const html = section(c)
    expect(strip(html)).toBe('Creatures (2) + Add')
    expect(html.match(/class="cr-bar cr-/g)).toHaveLength(2)
    expect(html).toContain('cr-bar cr-mid')
  })
  it('shows a row per creature: Hit Points, conditions, the first attack', () => {
    const text = strip(section(c, true))
    expect(text).toContain('Mammoth · Burya 126 / 126 AC 13 · Speed 50 ft. · Gore +10 to hit, 2d10+7 Piercing')
    expect(text).toContain('Mammoth · 2 40 / 126 +5 Prone mounted AC 13')
    // the note and the limited actions are off by default
    expect(text).not.toContain('Limps.')
    expect(text).not.toContain('Roar')
  })
  it('is always open on a computer', () => {
    expect(strip(onComputer(() => section(c)))).toContain('Mammoth · Burya 126 / 126')
  })
  it('shows what the hero chose for the row', () => {
    let x = setRowField(c, 'note', true)
    x = setRowField(x, 'uses', true)
    x = setRowField(x, 'ac', false)
    x = setRowField(x, 'attack', false)
    const text = strip(section(x, true))
    expect(text).toContain('Mammoth · 2 40 / 126 +5 Prone mounted Speed 50 ft. Roar Limps.')
    expect(text).not.toContain('AC 13')
    expect(text).not.toContain('Gore')
  })
  it('leaves out a creature hidden from Play, and marks one at 0 Hit Points', () => {
    const x = damageCreature(setPinned(c, 'burya', false), 'm2', 500)
    const text = strip(section(x, true))
    expect(text).toContain('Creatures (1)')
    expect(text).not.toContain('Burya')
    expect(text).toContain('0 / 126 0 HP Prone mounted')
    expect(hpTone({ current: 0, max: 10, temp: 0 })).toBe('down')
    expect(hpTone({ current: 2, max: 10, temp: 0 })).toBe('low')
    expect(hpTone({ current: 5, max: 10, temp: 0 })).toBe('mid')
    expect(hpTone({ current: 6, max: 10, temp: 0 })).toBe('ok')
  })
  it('is where the hero wants it: not at all, only with creatures, or always', () => {
    const none = hero({ creatures: [{ ...MAMMOTH, inPlay: [] }] })
    expect(section(setCreaturePref(c, 'where', 'tab'), true)).toBe('')
    expect(section(none, true)).toBe('')
    expect(strip(section(setCreaturePref(none, 'where', 'play'), true))).toBe('Creatures (0) + Add No creature in play. "Add" has your stat blocks.')
  })
  it('is on the Play screen and in its list of sections, before the items', () => {
    const html = onComputer(() => renderToString(<PlayView api={api(c)} />))
    expect(html).toContain('id="play-creatures"')
    expect(strip(html)).toContain('Creatures (2)')
    // and in the list of the screen's sections, right after the top panels
    expect(strip(html)).toMatch(/On this screen Spell slots Concentration Creatures 2/)
    const without = onComputer(() => renderToString(<PlayView api={api(hero({ creatures: [] }))} />))
    expect(without).not.toContain('play-creatures')
  })
})

describe('a creature\'s window', () => {
  const panel = (x: Character, open = false) => renderToString(<CreaturePanel api={api(x)} instanceId="m2" onClose={() => {}} onEdit={() => {}} initiallyOpen={open} />)
  it('has its Hit Points, the three buttons, its conditions and the stat block', () => {
    const html = panel(c)
    const text = strip(html)
    expect(text).toContain('Mammoth · 2')
    expect(text).toContain('Huge Beast, Unaligned · CR 6 (XP 2,300; PB +3)')
    expect(text).toContain('40 / 126 +5 temp')
    expect(text).toContain('− Damage + Heal Temp HP')
    expect(text).toContain('Prone ✕ mounted ✕ Conditions (2) + Another one Remove from play')
    expect(text).toContain('Limps.')
    expect(text).toContain('Gore +10 to hit · 2d10+7 Piercing Roll')
    expect(html).toContain('aria-label="Roar: 1 of 1 left"')
    expect(text).toContain('Edit stat block')
  })
  it('lets this one creature have its own name, Hit Points, maximum and note', () => {
    const html = panel(c, true)
    expect(strip(html)).toContain('Its own name or number')
    for (const v of ['value="2"', 'value="40"', 'value="126"']) expect(html).toContain(v)
    expect(html).toContain('>Limps.</textarea>')
    expect(strip(html)).toContain('Show this creature in the Play section')
  })
  it('says so at 0 Hit Points, and has no Roll when the hero turned it off', () => {
    const x = setCreaturePref(damageCreature(c, 'm2', 500), 'rolls', false)
    expect(strip(panel(x))).toContain('At 0 Hit Points.')
    expect(panel(x)).not.toContain('sb-roll')
    expect(panel(c)).toContain('sb-roll')
  })
  it('is nothing for a creature that is no longer in play', () => {
    expect(renderToString(<CreaturePanel api={api(c)} instanceId="gone" onClose={() => {}} onEdit={() => {}} />)).toBe('')
  })
  it('keeps a condition toggled from the model on the row and in the window', () => {
    const x = toggleCreatureCondition(c, 'burya', 'frightened')
    expect(strip(renderToString(<CreaturePanel api={api(x)} instanceId="burya" onClose={() => {}} onEdit={() => {}} />))).toContain('Frightened ✕ Conditions (1)')
  })
})
