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
