import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TagFilter, TagInput, tagFilterRow, tagLabel } from './tags'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('tag chips', () => {
  it('built-in tags get a label, own tags stay as written', () => {
    expect(tagLabel('save')).toBe('Saving throw')
    expect(tagLabel('fire')).toBe('Fire')
    expect(tagLabel('revive')).toBe('revive')
  })
  it('the filter hides tags without cards, keeps selected ones, and offers Clear', () => {
    const html = renderToString(<TagFilter tags={[{ tag: 'fire', n: 2 }, { tag: 'save', n: 0 }, { tag: 'buff', n: 1 }]} selected={['buff', 'gone']} onChange={() => {}} initiallyOpen />)
    const text = strip(html)
    expect(text).toContain('Fire 2')
    expect(text).not.toContain('Saving throw')
    expect(text).toContain('Clear')
    expect(text).toContain('gone 0')
    expect(html).toMatch(/tag-dmg dmg-fire/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Buff/)
  })
  it('nothing to filter: no row at all', () => {
    expect(renderToString(<TagFilter tags={[]} selected={[]} onChange={() => {}} />)).toBe('')
  })
  it('damage types fold under one Damage chip, closed by default', () => {
    const tags = [{ tag: 'healing', n: 1 }, { tag: 'damage', n: 5 }, { tag: 'fire', n: 2 }, { tag: 'psychic', n: 1 }, { tag: 'save', n: 3 }]
    const html = renderToString(<TagFilter tags={tags} selected={[]} onChange={() => {}} />)
    const text = strip(html)
    expect(text).toContain('Damage 5')
    expect(html).toMatch(/aria-expanded="false"/)
    expect(text).not.toContain('Fire')
    expect(text).not.toContain('Psychic')
    expect(text.indexOf('Healing')).toBeLessThan(text.indexOf('Damage'))
    expect(text.indexOf('Damage')).toBeLessThan(text.indexOf('Saving throw'))
    // open: Any damage and every type, right after the Damage chip
    const open = strip(renderToString(<TagFilter tags={tags} selected={[]} onChange={() => {}} initiallyOpen />))
    expect(open).toMatch(/Damage 5 ▾ Any damage 5 Fire 2 Psychic 1 Saving throw/)
  })
  it('a selected damage type stays visible (and on) while the fold is closed', () => {
    const tags = [{ tag: 'damage', n: 5 }, { tag: 'fire', n: 2 }, { tag: 'psychic', n: 1 }]
    expect(tagFilterRow(tags, ['psychic'], false)).toEqual([{ kind: 'damage', n: 5, open: false, types: 2 }, { kind: 'chip', tag: 'psychic', n: 1 }])
    expect(tagFilterRow(tags, ['damage'], false)).toEqual([{ kind: 'damage', n: 5, open: false, types: 2 }, { kind: 'chip', tag: 'damage', n: 5 }])
    const html = renderToString(<TagFilter tags={tags} selected={['psychic']} onChange={() => {}} />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Psychic/)
    expect(strip(html)).not.toContain('Fire')
  })
  it('only damage with no type: a plain chip, nothing to fold', () => {
    expect(tagFilterRow([{ tag: 'damage', n: 2 }, { tag: 'save', n: 1 }], [], false)).toEqual([{ kind: 'chip', tag: 'damage', n: 2 }, { kind: 'chip', tag: 'save', n: 1 }])
  })
  it('the editor shows automatic tags apart from own ones and suggests the rest', () => {
    const text = strip(renderToString(<TagInput value={['buff']} onChange={() => {}} auto={['fire', 'buff']} />))
    expect(text).toContain('Fire')
    expect(text).toContain('Buff ×')
    expect(text).toContain('+ Control')
    expect(text).not.toContain('+ Buff')
  })
})
