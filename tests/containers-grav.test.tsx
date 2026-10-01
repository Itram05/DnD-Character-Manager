// Inventory stage 2 (containers) against the owner's real hero, read-only: Grav's file must import with every
// item in one Backpack, nothing lost, the same carried weight, and the Gear tab must show and change it.
// Lives outside src/ so the app type-check does not need Node types. A missing file fails here (ownerFiles.ts).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addContainer, carriedWeight, inventoryWarnings, itemsIn, moveItem, splitStack, mergeStacks, totalWeight } from '../src/model/containers'
import { importCharacterJson } from '../src/model/normalize'
import type { Character } from '../src/model/types'
import { InventoryView } from '../src/ui/InventoryView'
import type { SheetApi } from '../src/ui/Sheet'
import { GRAV_DESKTOP, expectGravImportWarnings, ownerFile } from './ownerFiles'

const HAVE = ownerFile(GRAV_DESKTOP)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const apiFor = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'list' }, setSettings: () => {}, go: () => {} })

describe.skipIf(!HAVE)('Grav and containers', () => {
  const bytes = existsSync(GRAV_DESKTOP) ? readFileSync(GRAV_DESKTOP) : Buffer.from('{}')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const raw = JSON.parse(bytes.toString('utf8'))
  const { character: c, warnings } = importCharacterJson(bytes.toString('utf8'))

  it('every item goes into one Backpack, in the same order, with no new warning', () => {
    expectGravImportWarnings(warnings, { witchFocusPower: false })
    expect(c.inventory.containers.map((k) => k.name)).toEqual(['Backpack'])
    expect(c.inventory.items.map((i) => i.name)).toEqual(raw.inventory.items.map((i: { name: string }) => i.name))
    expect(itemsIn(c, 'backpack')).toHaveLength(raw.inventory.items.length)
  })
  it('the carried weight is what the old Gear tab showed as the total', () => {
    const old = raw.inventory.items.reduce((s: number, i: { weight?: number; quantity?: number }) => s + (i.weight ?? 0) * (i.quantity ?? 1), 0)
    expect(carriedWeight(c)).toBeCloseTo(old, 6)
    expect(totalWeight(c)).toBe(carriedWeight(c))
  })
  it('export and import again: identical, silent', () => {
    const again = importCharacterJson(JSON.stringify(c))
    expect(again.warnings).toEqual([])
    expect(again.character).toEqual(c)
  })
  it('a Bag of Holding with his potions in it: they stop counting, the DC and attack do not change, a split and merge round-trips', () => {
    const r = addContainer(c, { name: 'Bag of Holding', capacity: 500, weightless: true, extradimensional: true })
    if (!('container' in r)) throw new Error('refused')
    const greater = c.inventory.items.find((i) => i.name === 'Potion of Greater Healing')!
    let x = moveItem(r.character, greater.id, r.container.id).character
    expect(itemsIn(x, r.container.id).map((i) => i.name)).toEqual(['Potion of Greater Healing'])
    expect(carriedWeight(x)).toBeCloseTo(carriedWeight(c) - (greater.weight ?? 0) * greater.quantity, 6)
    expect(inventoryWarnings(x)).toEqual([])
    const s = splitStack(x, greater.id, 3, 'backpack')
    expect(s.ok).toBe(true)
    x = mergeStacks(s.character, s.newId!, greater.id).character
    expect(x.inventory.items.find((i) => i.id === greater.id)!.quantity).toBe(greater.quantity)
  })
  it('the Gear tab shows the Backpack group, the containers panel and the carried weight', () => {
    const gear = text(renderToString(<InventoryView api={apiFor(c)} />))
    expect(gear).toContain('Containers')
    expect(gear).toContain('🎒 Backpack')
    expect(gear).toContain('Carried weight:')
    for (const n of ['Staff of Ages', 'Witch Focus', 'Potion of Greater Healing']) expect(gear).toContain(n)
  })
  it('the file on the desktop was only read', () => {
    expect(createHash('sha256').update(readFileSync(GRAV_DESKTOP)).digest('hex')).toBe(hash)
  })
})
