// The long texts of the Story tab (roleplay.*) are drawn with the same RichText as a card's description:
// **bold**, _italic_, bullet lists and tables. Text typed by hand, with single line breaks, keeps its lines.
// Editing stays plain text: nothing is converted, the stored text is what was typed.
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { normalizeCharacter } from '../model/normalize'
import type { Character } from '../model/types'
import { RichText } from './common'
import { Sheet, type SheetApi } from './Sheet'
import { StoryView } from './StoryView'

const settings = { theme: 'dark', view: 'cards' } as const
const api = (c: Character): SheetApi => ({ c, update: () => {}, toast: () => {}, settings, setSettings: () => {}, go: () => {} })
const hero = (roleplay: Record<string, string>) => normalizeCharacter({ name: 'Borik', classes: [{ id: 'fighter', level: 15 }], roleplay }).character
const story = (roleplay: Record<string, string>) => renderToString(<StoryView api={api(hero(roleplay))} />)

const NOTES = [
  '**How to play him**',
  '| Situation | What you do |\n| A normal turn | You hit 3 times. |\n| A failed save | Indomitable. |',
  '**Open points**',
  '- AC: the sheet says 19.\n- Fighting Style: not on the sheet.',
].join('\n\n')

describe('Story: formatted text', () => {
  it('notes: bold, a table and a bullet list are drawn, no markup characters are left', () => {
    const html = story({ notes: NOTES })
    const block = html.slice(html.indexOf('story-notes'))
    expect(block).toContain('<strong>How to play him</strong>')
    expect(block).not.toContain('**')
    expect(block).toContain('<th>Situation</th>')
    expect(block).toContain('<td>You hit 3 times.</td>')
    expect(block.match(/<li>/g)).toHaveLength(2)
    expect(block).toContain('<li>AC: the sheet says 19.</li>')
    expect(block).not.toContain('- Fighting Style')
  })
  it('the other long texts go the same way', () => {
    const html = story({ backstory: '**Born** under the mountain.\n\n- one\n- two', personality: '_Stubborn._' })
    expect(html).toContain('<strong>Born</strong>')
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html).toContain('<em>Stubborn.</em>')
  })
  it('text typed by hand: a blank line is a new paragraph, a single line break stays a line break', () => {
    const html = story({ backstory: 'First line\nsecond line\n\nNext paragraph.' })
    const block = html.slice(html.indexOf('story-backstory'), html.indexOf('</section>', html.indexOf('story-backstory')))
    expect(block.match(/<p>/g)).toHaveLength(2)
    expect(block.match(/<br\/>/g)).toHaveLength(1)
    expect(block.replace(/<[^>]+>/g, '')).toContain('First linesecond lineNext paragraph.')
  })
  it('a dash inside a paragraph, and a list that follows a line of text, are left as text', () => {
    const html = story({ notes: 'Things to ask - soon:\n- the first\n- the second' })
    expect(html).not.toContain('<li>')
    expect(html).toContain('Things to ask - soon:')
    expect(html).toContain('- the first')
  })
  it('markup in the text is escaped', () => {
    const html = story({ notes: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img')
  })
  it('the stored text is untouched (the edit field shows it as it is), and the whole sheet draws it too', () => {
    // the Edit button is state inside StoryView: that the textarea holds the raw text is checked in a browser
    const c = hero({ notes: NOTES })
    expect(c.roleplay.notes).toBe(NOTES)
    const html = renderToString(<Sheet initial={c} tab="story" onTab={() => {}} onBack={() => {}} settings={settings} setSettings={() => {}} onRules={() => {}} />)
    expect(html).toContain('<strong>How to play him</strong>')
  })
})

describe('RichText tables', () => {
  it('a Markdown separator line is not drawn as a row of dashes', () => {
    const html = renderToString(<RichText text={'| Level | Damage |\n|---|:---:|\n| 5 | 2d8 |\n| 11 | - |'} />)
    expect(html.match(/<tr>/g)).toHaveLength(3) // the head, and the two real rows (a row holding one "-" is kept)
    expect(html).not.toContain('---')
    expect(html).toContain('<th>Level</th>')
  })
})
