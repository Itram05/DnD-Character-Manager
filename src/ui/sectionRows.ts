// Sections that stand side by side on the screen (the three smaller hands; the top row of panels on a
// wide screen) start at the same height, so separate entries for them would all jump to the same place.
// This joins them into one entry, by where they really are: the tops are measured in the page (SectionNav)
// and handed in here, so the rule itself is a plain function that tests can feed with made-up positions.
import type { NavSection } from './SectionNav'

/** Tops closer than this (in px) count as the same row. */
export const ROW_TOLERANCE = 4

/** A shown entry: one section, or several on one row. `id` is the first one's (where a tap jumps). */
export interface NavEntry extends NavSection {
  /** The ids of the sections joined in this entry, in list order (one for a lone section). */
  members: string[]
}

const sameRow = (a: number | undefined, b: number | undefined, tol: number) => a !== undefined && b !== undefined && Math.abs(a - b) <= tol

const sumN = (xs: NavSection[]) => (xs.some((x) => x.n !== undefined) ? xs.reduce((n, x) => n + (x.n ?? 0), 0) : undefined)

/**
 * Joins the sections that start on one row. `topOf` gives a section's top on the page (undefined when it
 * is not there, e.g. not measured yet: such a section stays on its own).
 *
 * - Top-level sections next to each other in the list with the same top become one entry,
 *   "Bonus · Reaction · Free / Other", with the cards counted together.
 * - A joined entry has no kinds under it (only the joined name and count): the kinds of hands side by
 *   side stand at about the same heights, so entries for them would only jump to the same place.
 * - A lone section and its kinds come out exactly as they went in (there the kinds really stand
 *   one under another).
 */
export function groupByRow(sections: NavSection[], topOf: (id: string) => number | undefined, tol = ROW_TOLERANCE): NavEntry[] {
  // a top-level section with the kinds under it
  const blocks: { head: NavSection; subs: NavSection[] }[] = []
  for (const s of sections) {
    const last = blocks[blocks.length - 1]
    if (s.sub && last) last.subs.push(s)
    else blocks.push({ head: s, subs: [] })
  }

  // blocks on one row, next to each other in the list
  const rows: (typeof blocks)[] = []
  for (const b of blocks) {
    const row = rows[rows.length - 1]
    if (row && sameRow(topOf(row[0].head.id), topOf(b.head.id), tol)) row.push(b)
    else rows.push([b])
  }

  const out: NavEntry[] = []
  for (const row of rows) {
    if (row.length === 1) {
      const { head, subs } = row[0]
      out.push({ ...head, members: [head.id] })
      for (const s of subs) out.push({ ...s, members: [s.id] })
      continue
    }
    const heads = row.map((b) => b.head)
    // one entry for the whole row and no kinds under it: the kinds of hands side by side stand at about
    // the same heights, so entries for them would only lead to the same place again
    out.push({ id: heads[0].id, label: heads.map((h) => h.label).join(' · '), n: sumN(heads), members: heads.map((h) => h.id) })
  }
  return out
}

/** A short key of how the entries are joined, to tell whether a new measurement changed anything. */
export const rowKey = (entries: NavEntry[]) => entries.map((e) => e.members.join('+')).join('|')
