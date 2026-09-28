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
