// The owner's real character files live outside the repo (read-only here). On the owner's machine a
// missing file is a FAILED test with a message, not a silent skip: until 2026-09-29 the main owner test
// looked for a file that had been renamed and was skipped for days without anyone noticing.
// In CI (GitHub Actions sets CI=true) the files do not exist and the tests are skipped.
// To skip them on purpose elsewhere: OWNER_FILES=skip npm test
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Grav's current file: the one the owner imports into the app (Paladin 5 / Sorcerer 9, schema 2). */
export const GRAV_DESKTOP = 'C:/Users/User/Desktop/grav-srashtite-lv14.json'
/** Itram's copy of the same hero, kept in the Itram repo. */
export const GRAV_ITRAM = 'F:/Claude/Itram/geroi/grav-srashtite.json'

const skipAll = !!process.env.CI || process.env.OWNER_FILES === 'skip'

/** True when the file is there. When it is not, and this is not CI, registers a failing test that says so. */
export function ownerFile(path: string): boolean {
  if (existsSync(path)) return true
  if (!skipAll)
    describe(`owner file ${path}`, () => {
      it('exists (moved or renamed? fix the path in tests/ownerFiles.ts; OWNER_FILES=skip to skip on purpose)', () => {
        throw new Error(`Missing owner file: ${path}`)
      })
    })
  return false
}

type Obj = Record<string, unknown>

/**
 * What Grav's raw file must look like after import, field by field: exactly the raw file, except the
 * one conversion of 2026-09-29 (item bonuses to spells from powers to fields). Written out by hand on
 * purpose, so any other change the importer makes to his file fails the "loses nothing" check.
 */
export function gravAfterImport(raw: Obj): Obj {
  const copy = JSON.parse(JSON.stringify(raw)) as Obj & { inventory: { items: Obj[] } }
  for (const item of copy.inventory.items) {
    const powers = (item.powers ?? []) as { name: string; description: string }[]
    const bonus = powers.find((p) => p.name === '+1 spell save DC' || p.name === '+3 spell attack')
    if (!bonus) continue
    if (bonus.name === '+1 spell save DC') {
      item.spellDcBonus = 1
      item.equipped = true
    } else item.spellAttackBonus = 3
    item.description = [item.description as string, bonus.description].filter((s) => s?.trim()).join('\n\n')
    item.powers = powers.filter((p) => p !== bonus)
  }
  return { ...copy, schemaVersion: 3 }
}

/** The warnings the conversion gives on Grav's file: two powers moved, Witch Focus equipped. Nothing else. */
export function expectGravImportWarnings(warnings: string[]) {
  expect(warnings).toHaveLength(3)
  expect(warnings[0]).toMatch(/: the power "\+3 spell attack" is now the item's spellAttackBonus \(3\); its text was added to the item description\.$/)
  expect(warnings[1]).toMatch(/: the power "\+1 spell save DC" is now the item's spellDcBonus \(1\); its text was added to the item description\.$/)
  expect(warnings[2]).toMatch(/: "Witch Focus" is now equipped: /)
}
