// The four SRD spells that carry a stat block have all of it (2026-10-11). The build script used to drop
// every "####" section that was not a spell: Find Steed, Giant Insect and Summon Dragon ended at "CR",
// without Traits and Actions, and Animate Objects had no block at all.
import { describe, expect, it } from 'vitest'
import spellsJson from './srd/spells.json'

const spells = spellsJson.data as { name: string; text: string }[]
const text = (name: string) => spells.find((s) => s.name === name)!.text

describe('SRD spells with a stat block', () => {
  it.each([
    ['Find Steed', 'Otherworldly Steed', ['Traits', 'Actions', 'Bonus Actions'], 'Otherworldly Slam.'],
    ['Giant Insect', 'Giant Insect', ['Traits', 'Actions', 'Bonus Actions'], 'Spider Climb.'],
    ['Summon Dragon', 'Draconic Spirit', ['Traits', 'Actions'], 'Multiattack.'],
    ['Animate Objects', 'Animated Object', ['Actions'], 'Slam.'],
  ])('%s: the block "%s" with its parts', (spell, block, parts, entry) => {
    const t = text(spell)
    expect(t).toContain(`\n\n**${block}**\n\n`)
    expect(t).toContain('**CR** None')
    for (const p of parts) expect(t).toContain(`\n\n**${p}**\n\n`)
    expect(t).toContain(entry)
    // the block comes after the spell's own text, the parts after the block, in order
    const at = [`**${block}**\n`, '**CR**', ...parts.map((p) => `**${p}**\n`)].map((x) => t.indexOf(x))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it('no heading marks or bold-italic marks are left in any spell text', () => {
    expect(spells.filter((s) => /^#{1,6} /m.test(s.text) || /\*\*_/.test(s.text)).map((s) => s.name)).toEqual([])
  })
  it('still 339 spells: a stat block is part of its spell, not a spell of its own', () => {
    expect(spells.some((s) => ['Animated Object', 'Traits', 'Actions', 'Bonus Actions'].includes(s.name))).toBe(false)
  })
})
