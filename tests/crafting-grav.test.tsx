// Inventory stage 5 (crafting, counters in Play) against the owner's real hero, read-only: Grav's file must
// import with no recipes and no counters, nothing lost and no new warning; a recipe and a counter added in the
// app must survive export and import; the Gear tab must show them. A missing file fails here (ownerFiles.ts).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { countOf, craft, craftStatus, saveRecipe, togglePin } from '../src/model/crafting'
import { importCharacterJson } from '../src/model/normalize'
import type { Character } from '../src/model/types'
import { CountersSection } from '../src/ui/CountersSection'
import { InventoryView } from '../src/ui/InventoryView'
import type { SheetApi } from '../src/ui/Sheet'
import { GRAV_DESKTOP, expectGravImportWarnings, gravAfterImport, ownerFile } from './ownerFiles'

const HAVE = ownerFile(GRAV_DESKTOP)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const apiFor = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'list' }, setSettings: () => {}, go: () => {} })

describe.skipIf(!HAVE)('Grav and crafting', () => {
  const bytes = existsSync(GRAV_DESKTOP) ? readFileSync(GRAV_DESKTOP) : Buffer.from('{}')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const raw = JSON.parse(bytes.toString('utf8'))
  const { character: c, warnings } = importCharacterJson(bytes.toString('utf8'))

  it('imports with no recipes and no counters, loses nothing, no new warning', () => {
    expectGravImportWarnings(warnings, { witchFocusPower: false })
    expect(c.recipes).toEqual([])
    expect(c.playCounters).toEqual([])
    expect(JSON.parse(JSON.stringify(c))).toMatchObject(gravAfterImport(raw))
  })
  it('a recipe from his own things and a counter: crafted, then export and import again, identical and silent', () => {
    let x = saveRecipe(c, {
      id: 'r-spirits',
      name: 'Moonvine spirits',
      inputs: [{ name: 'Jar of moonvine seeds', quantity: 1 }],
      output: { name: 'Flask of spirits', quantity: 1 },
      time: '1 day',
    })
    x = togglePin(x, 'Potion of Greater Healing')
    expect(craftStatus(x, x.recipes[0]).max).toBe(1)
    const r = craft(x, 'r-spirits', 1)
    if (!r.ok) throw new Error(r.reason)
    expect(countOf(r.character, 'Jar of moonvine seeds')).toBe(0)
    expect(countOf(r.character, 'Flask of spirits')).toBe(2)
    // everything else in his inventory is as it was
    const others = (y: Character) => y.inventory.items.filter((i) => !['Jar of moonvine seeds', 'Flask of spirits'].includes(i.name))
    expect(others(r.character)).toEqual(others(c))
    const again = importCharacterJson(JSON.stringify(r.character))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(r.character)
  })
  it('Gear shows the crafting panel and the pin; Play shows his potions as a counter', () => {
    const x = togglePin(c, 'Potion of Greater Healing')
    const gear = text(renderToString(<InventoryView api={apiFor(x)} />))
    expect(gear).toContain('Crafting')
    expect(gear).toContain('Potion of Greater Healing × 8')
    expect(text(renderToString(<CountersSection api={apiFor(x)} id="play-counters" />))).toContain('Potion of Greater Healing 8')
  })
  it('the file on the desktop was only read', () => {
    expect(createHash('sha256').update(readFileSync(GRAV_DESKTOP)).digest('hex')).toBe(hash)
  })
})
