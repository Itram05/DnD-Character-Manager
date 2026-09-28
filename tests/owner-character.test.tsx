// Checks the owner's real character file against the Play screen logic of wave 1.
// Lives outside src/ so the app type-check does not need Node types.
import { existsSync, readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { importCharacterJson } from '../src/model/normalize'
import { manaRows, playCards, useCard } from '../src/model/play'
import { longRest } from '../src/model/rest'
import { pointsToSlot, slotToPoints, sorceryFeature, sorceryPoints } from '../src/model/sorcery'
import type { Character } from '../src/model/types'
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
    expect(JSON.parse(JSON.stringify(c))).toEqual(JSON.parse(text))
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
  it('potions and scrolls get a quantity counter', () => {
    const greater = playCards(c).find((x) => x.name === 'Potion of Greater Healing')!
    expect(greater.quantity).toBe(8)
    const after = useCard(c, greater, 1)
    expect(playCards(after).find((x) => x.name === 'Potion of Greater Healing')!.quantity).toBe(7)
    expect(playCards(c).filter((x) => x.kind === 'item' && x.quantity !== undefined).map((x) => x.name)).toContain('Scroll of Scorching Ray')
  })
  it('the Play screen renders with it (server render, no browser)', () => {
    const c2 = pointsToSlot(c, 5)!.character
    const api = (view: 'cards' | 'list'): SheetApi => ({ c: c2, update: () => {}, toast: () => {}, settings: { theme: 'dark', view }, setSettings: () => {}, go: () => {} })
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    for (const view of ['cards', 'list'] as const) {
      const t = text(renderToString(<PlayView api={api(view)} />))
      expect(t).toContain('Sorcery Points')
      expect(t).toContain('Potion of Greater Healing')
      expect(t).toContain('− × 8 +')
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
    expect(JSON.parse(JSON.stringify(c))).toMatchObject(JSON.parse(text))
    // and an export of it imports back identically
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('keeps its 3 attuned items and shows only usable items in Play', () => {
    expect(c.inventory.items.filter((i) => i.attuned).map((i) => i.name)).toEqual(['Staff of Ages', 'Silent Amulet', 'Pearl of Power'])
    const names = playCards(c).filter((x) => x.kind === 'item').map((x) => x.name)
    expect(names).toEqual(expect.arrayContaining(['Staff of Ages', 'Pearl of Power', 'Helm of the Constellation', 'Potion of Healing']))
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
