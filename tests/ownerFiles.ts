// Tests against the owner's real character files. The files are not in the repo, and their paths are not in
// the code either: each comes from an environment variable. Without it the tests are SKIPPED with a message,
// so anyone can clone the repo and run `npm test` with nothing to set up.
// On the owner's machine the variables live in `.env.test.local` (git-ignored, read by vite.config.ts):
//   OWNER_GRAV_FILE=<path to Grav's current file>
//   OWNER_GRAV_COPY_FILE=<path to the older copy of Grav>
// A variable that IS set but points to a missing file is a FAILED test with a message, not a silent skip:
// until 2026-09-29 the main owner test looked for a file that had been renamed and was skipped for days
// without anyone noticing.
// To skip them on purpose even with the variables set: OWNER_FILES=skip npm test
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

export interface OwnerFile {
  /** the environment variable that holds the path */
  env: string
  /** the path from it, '' when it is not set */
  path: string
}

const fromEnv = (env: string): OwnerFile => ({ env, path: process.env[env]?.trim() ?? '' })

/** Grav's current file: the one the owner imports into the app (Paladin 5 / Sorcerer 9, schema 2). Witch Focus needs attunement and is not attuned (DC 18). */
export const GRAV_FILE = fromEnv('OWNER_GRAV_FILE')
/** An older copy of the same hero (Witch Focus still has its "+1 spell save DC" power; 3 attuned items). */
export const GRAV_COPY_FILE = fromEnv('OWNER_GRAV_COPY_FILE')

const skipAll = process.env.OWNER_FILES === 'skip'

/**
 * True when the file is there. Otherwise registers one test that says why the owner tests do not run:
 * skipped when the variable is not set (or OWNER_FILES=skip), FAILED when it is set and the file is missing.
 */
export function ownerFile(f: OwnerFile): boolean {
  if (skipAll) {
    describe(`owner file ${f.env}`, () => it.skip('skipped on purpose (OWNER_FILES=skip)'))
    return false
  }
  if (!f.path) {
    describe(`owner file ${f.env}`, () =>
      it.skip(`skipped: ${f.env} is not set (the owner's own file; set it in .env.test.local to run these tests)`),
    )
    return false
  }
  if (existsSync(f.path)) return true
  describe(`owner file ${f.env}`, () => {
    it(`exists (moved or renamed? fix ${f.env} in .env.test.local; OWNER_FILES=skip to skip on purpose)`, () => {
      throw new Error(`Missing owner file: ${f.path} (from ${f.env})`)
    })
  })
  return false
}

type Obj = Record<string, unknown>

/**
 * What Grav's raw file must look like after import, field by field: exactly the raw file, except the
 * two conversions of 2026-09-29 (item bonuses to spells from powers to fields; attacks linked to their
 * items by name). Written out by hand on purpose, so any other change the importer makes to his file
 * fails the "loses nothing" check.
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
  // his attacks and the item each is made with (null: none); every name here is the item's exact name
  const attacks = copy.attacks as Obj[]
  for (const a of attacks) {
    if ('itemId' in a) continue
    const itemName = GRAV_ATTACK_ITEMS[a.name as string]
    if (itemName === undefined) throw new Error(`gravAfterImport: unexpected attack ${String(a.name)}, add it to GRAV_ATTACK_ITEMS`)
    a.itemId = itemName === null ? null : (copy.inventory.items.find((i) => i.name === itemName)!.id as string)
  }
  return { ...copy, schemaVersion: 3 }
}

/** Grav's attacks and the item the import links each one to (2026-09-29). */
export const GRAV_ATTACK_ITEMS: Record<string, string | null> = {
  'Staff of Ages (+3)': 'Staff of Ages',
  '"Not for a Crown" (+2 longsword)': '"Not for a Crown" (+2 longsword)',
  'Chain hook': 'Chain hook',
  'Everfrost Trident': 'Everfrost Trident',
  'Fire Bolt': null,
}

/**
 * The warnings the conversions give on Grav's file. Nothing else.
 * The older copy (OWNER_GRAV_COPY_FILE) still has Witch Focus's old "+1 spell save DC" power: two powers moved,
 * Witch Focus equipped. The current file (OWNER_GRAV_FILE) was fixed by hand on 2026-09-29 (Witch Focus needs attunement; spellDcBonus is already
 * a field): only the Staff's "+3 spell attack" moves.
 */
export function expectGravImportWarnings(warnings: string[], { witchFocusPower }: { witchFocusPower: boolean }) {
  const bonus = witchFocusPower ? 3 : 1
  expect(warnings).toHaveLength(bonus + 4)
  expect(warnings[0]).toMatch(/: the power "\+3 spell attack" is now the item's spellAttackBonus \(3\); its text was added to the item description\.$/)
  if (witchFocusPower) {
    expect(warnings[1]).toMatch(/: the power "\+1 spell save DC" is now the item's spellDcBonus \(1\); its text was added to the item description\.$/)
    expect(warnings[2]).toMatch(/: "Witch Focus" is now equipped: /)
  }
  // then the four attacks linked to their items by name (Fire Bolt has none and gets null, silently)
  expect(warnings.slice(bonus)).toEqual(
    Object.entries(GRAV_ATTACK_ITEMS)
      .filter(([, item]) => item !== null)
      .map(([attack, item], i) => `attacks[${i}]: "${attack}" is now linked to the item "${item}" (by name); change it in the attack's editor.`),
  )
}
