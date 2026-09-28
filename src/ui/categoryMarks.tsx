// Colour by category on the cards of spells, scrolls and item powers (a trial look): a band along the
// top of a card (the left edge of a list row) in the colour of its category, split in two halves when it
// has two, and a small icon per category so the colour is never the only sign (colour blindness).
// The colours themselves are the --cat-* variables at the top of index.css, one place for both themes.
import type { ReactNode } from 'react'
import { colourCategories, type Category } from '../model/tags'
import { tagLabel } from './tags'

/** The card kinds that get the category colour. Other items, attacks and features keep their frame. */
export const CATEGORY_COLOURED_KINDS: readonly string[] = ['spell', 'scroll', 'power']

/** The categories to colour a card with (none for kinds that are not coloured). */
export function cardCategories(card: { kind: string; tags?: string[] }): Category[] {
  return CATEGORY_COLOURED_KINDS.includes(card.kind) ? colourCategories(card.tags) : []
}

// simple shapes on a 16x16 grid, drawn in the category colour (currentColor)
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const ICONS: Record<Category, ReactNode> = {
  // a burst
  damage: <path d="M8 1l1.6 4.2L14 4l-2.6 3.6L15 10l-4.4.2L10 15l-2-3.8L6 15l-.6-4.8L1 10l3.6-2.4L2 4l4.4 1.2z" fill="currentColor" />,
  // a cross
  healing: <path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z" fill="currentColor" />,
  // a padlock: held in place
  control: (
    <>
      <path d="M5 7V5a3 3 0 0 1 6 0v2" {...stroke} />
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor" />
    </>
  ),
  // a shield
  defense: <path d="M8 1l6 2.2v4.3c0 3.6-2.5 6.1-6 7.5-3.5-1.4-6-3.9-6-7.5V3.2z" fill="currentColor" />,
  // two chevrons up: stronger
  buff: <path d="M3 8.5l5-5 5 5M3 13.5l5-5 5 5" {...stroke} strokeWidth={2.2} />,
  // two chevrons forward: movement
  mobility: <path d="M3 3l5 5-5 5M8.5 3l5 5-5 5" {...stroke} strokeWidth={2.2} />,
  // a figure appearing
  summon: (
    <>
      <circle cx="8" cy="4.5" r="3" fill="currentColor" />
      <path d="M2 15c0-3.6 2.7-6 6-6s6 2.4 6 6z" fill="currentColor" />
    </>
  ),
  // a cog
  utility: (
    <>
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="2.2 1.7" />
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
    </>
  ),
}

/** The band: one colour, or two halves. `aria-hidden`: the icons carry the names. */
export function CategoryBand({ cats }: { cats: Category[] }) {
  if (!cats.length) return null
  return (
    <span className="cat-band" aria-hidden="true">
      {cats.map((c) => (
        <span key={c} className={`cat-seg cat-${c}`} />
      ))}
    </span>
  )
}

/** The small icons, each with its category's name for screen readers and as a tooltip. */
export function CategoryIcons({ cats }: { cats: Category[] }) {
  if (!cats.length) return null
  return (
    <span className="cat-icons">
      {cats.map((c) => (
        <span key={c} className={`cat-icon cat-${c}`} role="img" aria-label={tagLabel(c)} title={tagLabel(c)}>
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            {ICONS[c]}
          </svg>
        </span>
      ))}
    </span>
  )
}
