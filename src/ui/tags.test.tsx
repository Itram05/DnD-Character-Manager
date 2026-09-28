import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TagFilter, TagInput, tagLabel } from './tags'

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('tag chips', () => {
  it('built-in tags get a label, own tags stay as written', () => {
    expect(tagLabel('save')).toBe('Saving throw')
    expect(tagLabel('fire')).toBe('Fire')
    expect(tagLabel('revive')).toBe('revive')
  })
  it('the filter hides tags without cards, keeps selected ones, and offers Clear', () => {
    const html = renderToString(<TagFilter tags={[{ tag: 'fire', n: 2 }, { tag: 'save', n: 0 }, { tag: 'buff', n: 1 }]} selected={['buff', 'gone']} onChange={() => {}} />)
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
  it('the editor shows automatic tags apart from own ones and suggests the rest', () => {
    const text = strip(renderToString(<TagInput value={['buff']} onChange={() => {}} auto={['fire', 'buff']} />))
    expect(text).toContain('Fire')
    expect(text).toContain('Buff ×')
    expect(text).toContain('+ Control')
    expect(text).not.toContain('+ Buff')
  })
})
