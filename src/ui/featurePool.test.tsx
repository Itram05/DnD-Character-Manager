// A feature that spends another feature's uses, on screen (server render, no browser): the option's card in
// Play, its zoomed card, the pool picker in the feature editor. The logic is in model/featurePool.test.ts.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import { featureCard } from '../model/play'
import type { Character } from '../model/types'
import { FeatureEditor } from './editors'
import { FeaturesView } from './FeaturesView'
import { CardZoom, PlayView } from './PlayView'
import type { SheetApi } from './Sheet'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings: { theme: 'dark', view: 'cards' }, setSettings: () => {}, go: () => {} })

const c = normalizeCharacter({
  schemaVersion: 3,
  name: 'Test',
  classes: [{ id: 'cleric', level: 6 }],
  features: [
    { id: 'cd', name: 'Channel Divinity', source: { type: 'class', name: 'Cleric 2' }, activation: 'special', description: 'The pool.', uses: { max: 'cleric.channel-divinity', used: 1, recharge: 'long', shortRestRegain: 1 } },
    { id: 'turn', name: 'Turn Undead', source: { type: 'class', name: 'Cleric 2' }, activation: 'action', description: 'Turn.', poolId: 'cd', cost: 1 },
    { id: 'plain', name: 'Plain Action', source: { type: 'class', name: 'Cleric 1' }, activation: 'action', description: 'No counter.' },
  ],
}).character
const [pool, turn, plain] = c.features

describe('the card of an option in Play', () => {
  const html = renderToString(<PlayView api={api(c)} />)
  // one card = from its name to the end of its foot
  const card = (name: string) => {
    const at = html.indexOf(`title="${name}"`)
    return html.slice(at, html.indexOf('class="card-slot"', at) === -1 ? undefined : html.indexOf('class="card-slot"', at))
  }
  it("shows the pool's counter (2 of 3 left) and a Use button", () => {
    const t = card('Turn Undead')
    expect(t).toContain('aria-label="2 of 3 left"')
    expect(t).toContain('aria-label="Use: Turn Undead"')
    expect(t.match(/pip-full/g)).toHaveLength(2)
  })
  it('says what a use takes, with the name of the pool in the tooltip', () => {
    const t = card('Turn Undead')
    expect(strip(t)).toContain('1 from pool')
    expect(t).toContain('title="Spends 1 use(s) of Channel Divinity"')
  })
  it('a feature without a counter or pool is as before: no counter, no Use', () => {
    const t = card('Plain Action')
    expect(t).not.toContain('Use: Plain Action')
    expect(t).not.toContain('from pool')
  })
})

describe('the zoomed card of an option', () => {
  const html = renderToString(<CardZoom api={api(c)} face={featureCard(c, turn)} onClose={() => {}} onUse={() => {}} />)
  it('names the pool: the cost line, and the counter is "Uses of Channel Divinity" with its recharge', () => {
    const text = strip(html)
    expect(text).toContain('Spends 1 use(s) of Channel Divinity.')
    expect(text).toContain('Uses of Channel Divinity')
    expect(text).toContain('Long Rest')
  })
  it('has Use and Undo one use, like any card with a counter', () => {
    expect(html).toMatch(/<button class="btn btn-primary"[^>]*>Use<\/button>/)
    expect(html).toMatch(/<button class="btn"[^>]*>Undo one use<\/button>/)
  })
})

describe('the feature editor', () => {
  it('an option: "Spends uses of" with the pool chosen, and the cost', () => {
    const html = renderToString(<FeatureEditor api={api(c)} initial={turn} onClose={() => {}} />)
    expect(strip(html)).toContain('Spends uses of')
    expect(html).toMatch(/<option value="cd" selected="">Channel Divinity<\/option>/)
    expect(strip(html)).toContain('Uses spent each time')
  })
  it('a feature without a pool: the picker offers the features with a counter, nothing chosen, no cost field', () => {
    const html = renderToString(<FeatureEditor api={api(c)} initial={plain} onClose={() => {}} />)
    expect(html).toContain('>Channel Divinity</option>')
    expect(strip(html)).not.toContain('Uses spent each time')
  })
  it('the pool: says who spends it; no picker when no other feature has a counter', () => {
    const html = renderToString(<FeatureEditor api={api(c)} initial={pool} onClose={() => {}} />)
    expect(strip(html)).toContain('Its uses are also spent by: Turn Undead.')
    expect(strip(html)).not.toContain('Spends uses of')
  })
  it('a link to a feature without a counter is shown as broken, not hidden', () => {
    const broken = { ...c, features: c.features.map((f) => (f.id === 'cd' ? { ...f, uses: undefined } : f)) }
    const html = renderToString(<FeatureEditor api={api(broken)} initial={turn} onClose={() => {}} />)
    expect(strip(html)).toContain('Channel Divinity (has no uses)')
    expect(strip(html)).toContain('this card spends nothing')
  })
})

describe('the Features tab', () => {
  it('an option says what it spends', () => {
    expect(strip(renderToString(<FeaturesView api={api(c)} />))).toContain('spends 1 of Channel Divinity')
  })
})
