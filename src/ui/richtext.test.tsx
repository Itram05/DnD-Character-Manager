import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Highlighted, RichText } from './common'

describe('RichText with highlighting', () => {
  it('keeps hand-written **bold** and _italic_ working, and highlights inside and around them', () => {
    const html = renderToString(<RichText text={'**Burn.** Takes 2d6 Fire damage. _Using a Higher-Level Spell Slot._ +1d6'} />)
    expect(html).toContain('<strong>Burn.</strong>')
    expect(html).toContain('<strong class="hl-dmg dmg-fire">2d6 Fire damage</strong>')
    expect(html).toContain('<em>Using a Higher-Level Spell Slot.</em>')
    expect(html).toContain('<strong class="hl-dice">1d6</strong>')
  })
  it('never passes markup through: text is escaped', () => {
    const html = renderToString(<RichText text={'<img src=x onerror=alert(1)> 1d8 Cold damage'} />)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('dmg-cold')
  })
  it('card-face helper renders plain strings the same way', () => {
    const html = renderToString(<div><Highlighted text="Wisdom saving throw or be Frightened" /></div>)
    expect(html).toContain('<strong class="hl-save">Wisdom saving throw</strong>')
    expect(html).toContain('<strong class="hl-cond">Frightened</strong>')
  })
})

// 2026-10-11: a cell was drawn without the inline marks, so "**Longsword**" kept its asterisks.
describe('RichText: bold and italic inside a table', () => {
  const html = renderToString(<RichText text={'| **Weapon** | Damage |\n|---|---|\n| **Longsword** | 1d8 Slashing damage |\n| _Versatile_ | **1d10** |'} />)
  it('a cell draws **bold** and _italic_, with no marks left', () => {
    expect(html).toContain('<td><strong>Longsword</strong></td>')
    expect(html).toContain('<td><em>Versatile</em></td>')
    expect(html).not.toContain('**')
    expect(html).not.toContain('_Versatile_')
  })
  it('the header too', () => {
    expect(html).toContain('<th><strong>Weapon</strong></th>')
  })
  it('dice and damage are still picked out, inside bold as well', () => {
    expect(html).toContain('1d8 Slashing damage</strong></td>')
    expect(html).toContain('class="hl-dmg ')
    expect(html).toContain('<strong><strong class="hl-dice">1d10</strong></strong>')
  })
})
