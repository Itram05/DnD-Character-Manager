// The phone's Resources block: folded, what is left is readable without opening it, the potions' "−" and
// the end of concentration are there straight away; unfolded, the full panels; the choice is remembered.
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HealingRow, ManaRow } from '../model/play'
import { loadResourcesOpen, saveResourcesOpen } from '../model/storage'
import { ResourcesBlock } from './ResourcesBlock'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const mana: ManaRow[] = [
  { kind: 'slot', level: 1, max: 4, used: 1, bonus: 0 },
  { kind: 'slot', level: 2, max: 3, used: 3, bonus: 0 },
  { kind: 'pact', level: 3, max: 2, used: 0, bonus: 0 },
]
const potions: HealingRow[] = [
  { tier: 'healing', item: { id: 'p1', name: 'Potion of Healing', quantity: 2 } as HealingRow['item'], name: 'Potion of Healing', quantity: 2 },
  { tier: 'greater', item: { id: 'p2', name: 'Potion of Greater Healing', quantity: 0 } as HealingRow['item'], name: 'Potion of Greater Healing', quantity: 0 },
  { tier: 'superior', name: 'Potion of Superior Healing', quantity: 0 },
]
const block = (over: { conc?: string; open?: boolean } = {}) =>
  renderToString(
    <ResourcesBlock id="play-res" mana={mana} sp={{ left: 5, max: 9 }} conc={over.conc ?? ''} onEndConcentration={() => {}} potions={potions} onDrink={() => {}} initiallyOpen={over.open ?? false}>
      <div className="full-panels">FULL</div>
    </ResourcesBlock>,
  )

describe('phone Resources block', () => {
  it('folded: slots left per level, pact, SP; not the full panels', () => {
    const html = block()
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="Level 1: 3 of 4 slots left"')
    expect(html).toContain('aria-label="Level 2: 0 of 3 slots left"')
    expect(html).toMatch(/res-chip res-slot none/) // level 2 is spent
    expect(html).toContain('aria-label="Pact slots (level 3): 2 of 2 left"')
    expect(html).toContain('aria-label="5 of 9 Sorcery Points left"')
    expect(html).not.toContain('FULL')
  })
  it('folded: a potion you have is one tap to drink; empty kinds are not listed', () => {
    const t = text(block())
    expect(t).toContain('− Healing × 2')
    expect(t).not.toContain('Greater')
    expect(t).not.toContain('Superior')
    expect(block()).toContain('aria-label="Drink one Potion of Healing (2 left)"')
  })
  it('folded: concentration with its end button, or "No concentration"', () => {
    expect(text(block())).toContain('No concentration')
    const on = block({ conc: 'Spirit Guardians' })
    expect(on).toContain('conc-on')
    expect(on).toContain('aria-label="End concentration on Spirit Guardians"')
  })
  it('unfolded: the full panels instead of the summary', () => {
    const html = block({ open: true })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('FULL')
    expect(html).not.toContain('res-summary')
  })
})

describe('phone Resources block: remembered', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('folded unless saved open; the saved choice comes back', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } })
    expect(loadResourcesOpen()).toBe(false)
    saveResourcesOpen(true)
    expect(loadResourcesOpen()).toBe(true)
    saveResourcesOpen(false)
    expect(loadResourcesOpen()).toBe(false)
  })
})
