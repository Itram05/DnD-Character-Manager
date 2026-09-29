// Checks the owner's real character file against the Play screen logic of wave 1.
// Lives outside src/ so the app type-check does not need Node types.
import { existsSync, readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { importCharacterJson } from '../src/model/normalize'
import { manaRows, playCards, playHealingPotions, useCard } from '../src/model/play'
import { longRest } from '../src/model/rest'
import { pointsToSlot, slotToPoints, sorceryFeature, sorceryPoints } from '../src/model/sorcery'
import { CURRENT_SCHEMA_VERSION, type Character } from '../src/model/types'
import { InventoryView } from '../src/ui/InventoryView'
import { FlexibleCasting, PlayView } from '../src/ui/PlayView'
import type { SheetApi } from '../src/ui/Sheet'

const points = (c: Character) => sorceryPoints(c)!

// The owner's real character (Paladin 4 / Sorcerer 9, 2014 rules with slotsOverride).
// The file lives outside the repo and is read-only here; the test is skipped where it is missing (CI).
const OWNER_FILE = 'C:/Users/User/Desktop/character.json'
describe.skipIf(!existsSync(OWNER_FILE))("owner's character file", () => {
  const text = existsSync(OWNER_FILE) ? readFileSync(OWNER_FILE, 'utf8') : '{}'
  const { character: c, warnings } = importCharacterJson(text)

  it('imports without warnings and loses nothing', () => {
    expect(warnings).toEqual([])
    // schema 3 adds partySize, xpLog and timers with their defaults when the file has none
    expect(JSON.parse(JSON.stringify(c))).toEqual({ partySize: 5, xpLog: [], timers: [], ...JSON.parse(text), schemaVersion: CURRENT_SCHEMA_VERSION })
  })
  it('finds Sorcery Points in Font of Magic (max "sorcerer" = 9)', () => {
    expect(sorceryFeature(c)!.name).toBe('Font of Magic')
    expect(points(c).max).toBe(9)
    expect(playCards(c).some((x) => x.name === 'Font of Magic')).toBe(false)
  })
  it('the slots come from slotsOverride, levels 1-6', () => {
    expect(manaRows(c).map((r) => [r.level, r.max])).toEqual([
      [1, 4],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 2],
      [6, 1],
    ])
  })
  it('Flexible Casting works on it and a Long Rest cleans up', () => {
    let x = pointsToSlot(c, 5)!.character // 7 points
    expect(points(x).left).toBe(2)
    expect(manaRows(x).find((r) => r.level === 5)).toMatchObject({ max: 3, bonus: 1 })
    x = slotToPoints(x, 2)!.character
    expect(points(x).left).toBe(4)
    x = longRest(x).character
    expect(points(x).left).toBe(9)
    expect(x.spellcasting.bonusSlots).toBeUndefined()
    expect(x.spellcasting.slotsOverride).toEqual([4, 3, 3, 3, 2, 1])
  })
  it('healing potions are counters, scrolls are scroll cards with a quantity', () => {
    const greater = playHealingPotions(c).find((x) => x.name === 'Potion of Greater Healing')!
    expect(greater.quantity).toBe(8)
    const after = useCard(c, { kind: 'item', id: greater.id }, 1)
    expect(playHealingPotions(after).find((x) => x.name === 'Potion of Greater Healing')!.quantity).toBe(7)
    expect(playCards(c).filter((x) => x.kind === 'scroll').map((x) => x.name)).toContain('Scroll of Scorching Ray')
  })
  it('the Play screen renders with it (server render, no browser)', () => {
    const c2 = pointsToSlot(c, 5)!.character
    const api = (view: 'cards' | 'list'): SheetApi => ({ c: c2, update: () => {}, toast: () => {}, settings: { theme: 'dark', view }, setSettings: () => {}, go: () => {} })
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    for (const view of ['cards', 'list'] as const) {
      const t = text(renderToString(<PlayView api={api(view)} />))
      expect(t).toContain('Sorcery Points')
      expect(t).toContain('Greater Healing')
      expect(t).toContain('× 8 +')
      expect(t).toContain('Attacks ( 5 )')
      expect(t).not.toContain('Font of Magic')
    }
    const flex = text(renderToString(<FlexibleCasting api={api('cards')} onClose={() => {}} />))
    expect(flex).toContain('7 points → level 5 slot')
    expect(flex).toContain('Level 6 slot → +6')
  })
})

// The owner's current character file kept by Itram (3 attuned items: Staff of Ages, Silent Amulet, Pearl of Power).
const GRAV_FILE = 'F:/Claude/Itram/geroi/grav-srashtite.json'
describe.skipIf(!existsSync(GRAV_FILE))("owner's character: attunement on the Play screen", () => {
  const text = existsSync(GRAV_FILE) ? readFileSync(GRAV_FILE, 'utf8') : '{}'
  const { character: c, warnings } = importCharacterJson(text)

  it('imports without warnings and loses nothing', () => {
    expect(warnings).toEqual([])
    // hand-written file: the import only adds defaults, every field written in it survives unchanged
    // (an older file comes out as the current version: that number is the only change the migrations make)
    expect(JSON.parse(JSON.stringify(c))).toMatchObject({ ...JSON.parse(text), schemaVersion: CURRENT_SCHEMA_VERSION })
    // and an export of it imports back identically
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('keeps its 3 attuned items and shows only usable items in Play', () => {
    expect(c.inventory.items.filter((i) => i.attuned).map((i) => i.name)).toEqual(['Staff of Ages', 'Silent Amulet', 'Pearl of Power'])
    const names = playCards(c).filter((x) => x.kind === 'item').map((x) => x.name)
    expect(names).toEqual(expect.arrayContaining(['Pearl of Power']))
    // since wave 2 the Staff and the Helm are on the table as their powers, not as one card each
    const fromItem = playCards(c).filter((x) => x.kind === 'power').map((x) => x.sourceLabel)
    expect(fromItem).toEqual(expect.arrayContaining(['Staff of Ages', 'Helm of the Constellation']))
    expect(playHealingPotions(c).map((x) => x.name)).toContain('Potion of Healing')
    expect(names).not.toContain('Wand of Web')
  })
  it('Play hides Wand of Web; the Gear tab shows the counter and every attunable item', () => {
    const api: SheetApi = { c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'list' }, setSettings: () => {}, go: () => {} }
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text(renderToString(<PlayView api={api} />))).not.toContain('Wand of Web')
    const gear = text(renderToString(<InventoryView api={api} />))
    expect(gear).toContain('Attunement: 3/3')
    for (const n of ['Staff of Ages', 'Silent Amulet', 'Pearl of Power', 'Amulet of the Half-Closed Eye', 'Wand of Web', 'Ring of Feather Falling']) expect(gear).toContain(n)
  })
})

// Healing potions as counters next to Concentration, scrolls (and other potions) as their own group under the spells (Grav's real file).
describe.skipIf(!existsSync(GRAV_FILE))("owner's character: potions and scrolls", async () => {
  const { loadSrdSpells } = await import('../src/data/srd')
  const { scrollInfo, isScroll, isPotion, healingDice } = await import('../src/model/consumables')
  const { GameCard } = await import('../src/ui/GameCard')
  const srd = await loadSrdSpells()
  const text = existsSync(GRAV_FILE) ? readFileSync(GRAV_FILE, 'utf8') : '{}'
  const { character: c } = importCharacterJson(text)
  const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('the three healing potions are counters, not cards; dice from their descriptions', () => {
    expect(playHealingPotions(c).map((i) => [i.name, i.quantity])).toEqual([
      ['Potion of Healing', 1],
      ['Potion of Greater Healing', 8],
      ['Potion of Superior Healing', 2],
    ])
    expect(playCards(c, srd).some((x) => x.name.startsWith('Potion'))).toBe(false)
    expect(playHealingPotions(c).map((i) => healingDice(i))).toEqual(['2d4+2', '4d4+4', '8d4+8'])
    // Flask of spirits is not a potion
    expect(c.inventory.items.filter(isPotion).map((i) => i.name)).toEqual(['Potion of Healing', 'Potion of Greater Healing', 'Potion of Superior Healing'])
  })
  it('all six scrolls are scroll cards and every one finds its spell text', () => {
    const scrolls = c.inventory.items.filter(isScroll)
    expect(scrolls.map((i) => i.name)).toEqual(['Scroll of Scorching Ray', 'Scroll of Shatter', 'Scroll of Command', 'Scroll of Dispel Evil and Good', 'Scroll of Aid', 'Scroll of Knock'])
    const from = Object.fromEntries(scrolls.map((i) => [i.name, scrollInfo(c, i, srd).from]))
    // Command and Aid are in Grav's own spell list; the rest come from the SRD
    expect(from).toEqual({
      'Scroll of Scorching Ray': 'srd',
      'Scroll of Shatter': 'srd',
      'Scroll of Command': 'character',
      'Scroll of Dispel Evil and Good': 'srd',
      'Scroll of Aid': 'character',
      'Scroll of Knock': 'srd',
    })
    for (const i of scrolls) expect(scrollInfo(c, i, srd).description.length).toBeGreaterThan(20)
    expect(playCards(c, srd).filter((x) => x.kind === 'scroll')).toHaveLength(6)
  })
  it('a scroll card renders with level, count, Use, and highlighted spell text', async () => {
    const face = playCards(c, srd).find((x) => x.name === 'Scroll of Shatter')!
    for (const mode of ['cards', 'list'] as const) {
      const html = renderToString(<GameCard card={face} mode={mode} onOpen={() => {}} onUse={() => {}} useLabel="Use" />)
      expect(strip(html)).toContain('× 1')
      expect(strip(html)).toContain('Use')
    }
    // the zoomed scroll shows the full spell text through the same highlighting as spells
    const { RichText } = await import('../src/ui/common')
    const shatter = c.inventory.items.find((i) => i.name === 'Scroll of Shatter')!
    const zoom = renderToString(<RichText text={scrollInfo(c, shatter, srd).description} />)
    expect(zoom).toContain('dmg-thunder')
    expect(zoom).toContain('class="hl-save"')
  })
  const apiFor = (ch: Character): SheetApi => ({ c: ch, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'list' }, setSettings: () => {}, go: () => {} })
  // the Concentration panel: from its opening tag to the next section
  const concPanel = (html: string) => strip(html.slice(html.indexOf('in-play panel'), html.indexOf('<section', html.indexOf('in-play panel'))))
  // the panels as a computer shows them (900px and up); a phone folds them into the Resources block
  const onComputer = (render: () => string) => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }), localStorage: { getItem: () => null, setItem() {} } })
    try {
      return render()
    } finally {
      vi.unstubAllGlobals()
    }
  }
  it('a phone folds slots, concentration and potions into a short Resources summary: slots left, SP, the four potions in fixed places', () => {
    const html = renderToString(<PlayView api={apiFor(c)} />)
    const res = strip(html.slice(html.indexOf('class="res '), html.indexOf('<section', html.indexOf('class="res ') + 10)))
    expect(res).toContain('Resources')
    expect(res).toContain('SP')
    expect(res).toContain('No concentration')
    expect(res).toContain('Healing × 1')
    expect(res).toContain('Greater × 8')
    expect(res).toContain('Superior × 2')
    expect(res).toContain('Supreme × 0') // none left: still in its place, faded
    expect(html).toContain('aria-label="No Potion of Supreme Healing left"')
    expect(html).not.toContain('in-play panel')
    expect(html).toContain('aria-label="Level 1: ')
  })
  it('the healing potions sit in the Concentration panel; the scroll group is still "Scrolls"; the Gear tab still lists the potions', () => {
    const api = apiFor(c)
    const html = onComputer(() => renderToString(<PlayView api={api} />))
    const play = strip(html)
    const conc = concPanel(html)
    expect(conc).toContain('Concentration')
    expect(conc).toContain('Healing potions')
    expect(conc).toContain('Healing 2d4+2 × 1 +')
    expect(conc).toContain('Greater Healing 4d4+4 × 8 +')
    expect(conc).toContain('Superior Healing 8d4+8 × 2 +')
    // no separate potion bar any more
    expect(html).not.toContain('class="potions panel"')
    expect(play).toContain('Scrolls ( 6 )')
    expect(play).not.toContain('Scrolls &amp; Potions')
    expect(play).not.toContain('Potion of Greater Healing')
    const gear = strip(renderToString(<InventoryView api={api} />))
    expect(gear).toContain('Potion of Greater Healing')
  })
  it('Grav has no Supreme potion: the panel still shows Supreme Healing ×0, and nothing is added to his items', () => {
    const conc = concPanel(onComputer(() => renderToString(<PlayView api={apiFor(c)} />)))
    expect(conc).toContain('Supreme Healing 10d4+20 × 0 +')
    expect(c.inventory.items.some((i) => /supreme/i.test(i.name))).toBe(false)
  })
  it('a potion that is not for healing (Climbing) becomes a card in "Scrolls & Potions" with Use', () => {
    const climbing = { id: 'climb', name: 'Potion of Climbing', quantity: 1, description: 'You gain a Climb Speed equal to your Speed for 1 hour.' }
    const c2: Character = { ...c, inventory: { ...c.inventory, items: [...c.inventory.items, climbing] } }
    const html = renderToString(<PlayView api={apiFor(c2)} />)
    const play = strip(html)
    expect(play).toContain('Scrolls &amp; Potions ( 7 )')
    expect(play).toContain('Potion of Climbing')
    expect(concPanel(html)).not.toContain('Climbing')
    const face = playCards(c2, srd).find((x) => x.id === 'climb')!
    expect(face.kind).toBe('potion')
    expect(strip(renderToString(<GameCard card={face} mode="cards" onOpen={() => {}} onUse={() => {}} useLabel="Use" />))).toContain('Use')
  })
})

// Wave 2 on Grav's real file: item powers as cards, passive powers apart, tags on his spells.
describe.skipIf(!existsSync(GRAV_FILE))("owner's character: item powers and tags", async () => {
  const { setAttunement } = await import('../src/model/rules')
  const { playPassivePowers, spendPower } = await import('../src/model/play')
  const { CATEGORIES, spellTags } = await import('../src/model/tags')
  const { filterOptions, spellFilterable } = await import('../src/model/filter')
  const { FilterButton } = await import('../src/ui/filter')
  const { ItemEditor } = await import('../src/ui/editors')
  const { GameCard } = await import('../src/ui/GameCard')
  const { SpellsView } = await import('../src/ui/SpellsView')
  const text = existsSync(GRAV_FILE) ? readFileSync(GRAV_FILE, 'utf8') : '{}'
  const { character: c } = importCharacterJson(text)
  const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const apiFor = (ch: Character): SheetApi => ({ c: ch, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })
  const staff = c.inventory.items.find((i) => i.name === 'Staff of Ages')!

  it('is a version 2 file', () => {
    expect(JSON.parse(text).schemaVersion).toBe(2)
  })
  it('Staff of Ages: three active powers in their hands, sharing the 3 charges; no separate Staff card', () => {
    const cards = playCards(c).filter((x) => x.itemId === staff.id)
    expect(cards.map((x) => [x.name, x.zone, x.chargeCost])).toEqual([
      ['Temporal Echo', 'reaction', 'all'],
      ['Hourglass Ward', 'bonus', 1],
      ['Echo of Ages', 'other', 1],
    ])
    expect(cards.every((x) => x.uses?.max === 3 && x.uses.left === 3)).toBe(true)
    expect(playCards(c).some((x) => x.kind === 'item' && x.name === 'Staff of Ages')).toBe(false)
    const ward = cards.find((x) => x.name === 'Hourglass Ward')!
    let x = spendPower(c, ward.id)
    expect(x.inventory.items.find((i) => i.id === staff.id)!.charges!.used).toBe(1)
    x = spendPower(x, cards[0].id) // Temporal Echo takes the 2 left
    expect(x.inventory.items.find((i) => i.id === staff.id)!.charges!.used).toBe(3)
  })
  it('passive powers of usable items sit under "Always on"; the un-attuned Amulet stays hidden until attuned', () => {
    expect(playPassivePowers(c).map((p) => p.power.name)).toEqual(['+3 spell attack', '+1 spell save DC', 'Truesight 60 ft'])
    const amulet = c.inventory.items.find((i) => i.name === 'Amulet of the Half-Closed Eye')!
    expect(playCards(c).some((x) => x.itemId === amulet.id)).toBe(false)
    const pearl = c.inventory.items.find((i) => i.name === 'Pearl of Power')!
    const swapped = setAttunement(setAttunement(c, pearl.id, false).character, amulet.id, true)
    expect(swapped.ok).toBe(true)
    expect(playCards(swapped.character).filter((x) => x.itemId === amulet.id).map((x) => [x.name, x.zone])).toEqual([['Outline of the unseen', 'reaction']])
    expect(playPassivePowers(swapped.character).map((p) => p.power.name)).toEqual(expect.arrayContaining(['Keen sight', 'Steady mind']))
  })
  it('the Play screen shows the powers, their cost, the passive chips and the funnel filter', () => {
    const raw = renderToString(<PlayView api={apiFor(c)} />)
    const html = strip(raw)
    // (server render = phone width: only the Action hand is open)
    for (const s of ['Detect Thoughts', '1 ch.', 'Truesight 60 ft', '+3 spell attack']) expect(html).toContain(s)
    const echo = playCards(c).find((x) => x.name === 'Temporal Echo')!
    const card = strip(renderToString(<GameCard card={echo} mode="cards" onOpen={() => {}} onUse={() => {}} />))
    expect(card).toContain('all ch.')
    expect(card).toContain('Staff of Ages')
    // the phone's Action hand is an active filter: funnel with 1, and "Action ✕" in the row under it
    expect(raw).toMatch(/class="filter-badge">1</)
    expect(html).toContain('Action ✕')
    // the panel is closed: no category chips on the screen
    expect(raw).not.toContain('filter-panel')
    // opened: every group, Damage with its arrow, types folded
    const panel = strip(renderToString(<FilterButton groups={filterOptions(playCards(c), [])} selected={[]} onChange={() => {}} initiallyOpen />))
    for (const s of ['Action', 'Kind', 'Category', 'Properties']) expect(panel).toContain(s)
    expect(panel).toMatch(/Damage \d+ ▾ Healing \d+ Control \d+ Buff \d+ Defense \d+ Mobility \d+ Summon \d+ Utility \d+/)
    expect(panel).not.toMatch(/Radiant \d+/)
  })
  it('his spells and Staff powers: categories after the switch (own tags + read from the text)', () => {
    const cats = (tags: string[]) => tags.filter((x) => (CATEGORIES as readonly string[]).includes(x)).join(' ')
    const bySpell = Object.fromEntries(c.spells.map((s) => [s.name, cats(spellTags(s))]))
    expect(bySpell).toEqual({
      'Booming Blade': 'damage',
      'Green-Flame Blade': 'damage',
      'Fire Bolt': 'damage',
      'Toll the Dead': 'damage',
      Guidance: 'buff',
      'Shape Water': 'utility',
      'Cure Wounds': 'healing',
      Shield: 'defense',
      'Healing Word': 'healing',
      'Misty Step': 'mobility',
      'Spiritual Weapon': 'damage summon',
      'Spirit Guardians': 'damage control',
      Counterspell: 'defense',
      Revivify: 'healing',
      'Death Ward': 'defense',
      'Guardian of Faith': 'damage summon',
      'Synaptic Static': 'damage control',
      'Watery Sphere': 'control',
      'Control Weather': 'utility',
      Bane: 'control',
      "Hunter's Mark": 'damage buff',
      Command: 'control',
      'Cure Wounds (Paladin)': 'healing',
      'Detect Magic': 'utility',
      'Protection from Evil and Good': 'defense',
      'Shield of Faith': 'defense',
      'Thunderous Smite': 'damage control',
      'Hold Person': 'control',
      'Misty Step (Oath)': 'mobility',
      Aid: 'buff',
      'Lesser Restoration': 'healing',
    })
    // no old vocabulary left in his file; "revive" stays as his own free tag
    const own = c.spells.flatMap((s) => s.tags ?? [])
    for (const old of ['aoe', 'debuff', 'social', 'save', 'attack']) expect(own).not.toContain(old)
    expect(spellTags(c.spells.find((s) => s.name === 'Revivify')!)).toContain('revive')
    expect(playCards(c).filter((x) => x.itemId === staff.id).map((x) => [x.name, cats(x.tags!)])).toEqual([
      ['Temporal Echo', 'defense'],
      ['Hourglass Ward', 'defense'],
      ['Echo of Ages', 'buff'],
    ])
  })
  it('the Gear editor lists the Staff powers; the Spells tab has the funnel', () => {
    const ed = strip(renderToString(<ItemEditor api={apiFor(c)} initial={staff} onClose={() => {}} />))
    for (const s of ['Powers of this item', 'Temporal Echo', 'Hourglass Ward', 'Echo of Ages', 'Add power']) expect(ed).toContain(s)
    const raw = renderToString(<SpellsView api={apiFor(c)} />)
    expect(raw).toContain('filter-btn')
    expect(raw).not.toContain('filter-badge')
    expect(raw).not.toContain('active-filters')
    const tagged = c.spells.map(spellFilterable)
    const panel = strip(renderToString(<FilterButton groups={filterOptions(tagged, [])} selected={[]} onChange={() => {}} initiallyOpen />))
    expect(panel).toMatch(/Properties Concentration \d+/)
    expect(panel).toMatch(/Other tags revive 1/)
    // the Action group (by casting time) opens the panel; no Kind group for spells
    expect(panel).toMatch(/^ ?Filters ✕ Action Action 21 Bonus 7 Reaction 2 Free \/ Other 1 Category/)
    expect(panel).not.toContain('Kind')
  })
  it('wave 1 still holds: scrolls, healing potions and attunement', () => {
    expect(playCards(c).filter((x) => x.kind === 'scroll')).toHaveLength(6)
    expect(playHealingPotions(c).map((i) => i.name)).toEqual(['Potion of Healing', 'Potion of Greater Healing', 'Potion of Superior Healing'])
    expect(playCards(c).some((x) => x.name === 'Wand of Web')).toBe(false)
  })
})
