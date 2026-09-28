// The card filter behind the funnel button (Play screen, Spells tab). Pure logic, no React.
//
// A selection is a list of keys "group:value", e.g. ["zone:action", "cat:healing", "dmg:fire"].
// Groups and how they combine:
// - between groups: AND (an Action card that heals);
// - inside a group: OR (Action or Bonus; Healing or Buff), because most groups hold one value per
//   card (a card is in one hand, of one kind) and AND there would always give nothing;
// - Damage types refine Damage: with "dmg:fire" and "dmg:cold" selected, the category criterion
//   asks for Fire or Cold damage instead of any damage. They sit in the Category criterion, so
//   "Healing + Fire" means "heals or deals Fire damage", like "Healing + Damage" does.
import { DAMAGE_TYPES } from './highlight'
import { PLAY_KINDS, ZONES, kindGroup, type CardKind, type Zone } from './play'
import { CATEGORIES, PROPERTIES, tagGroup } from './tags'

export type FilterGroup = 'zone' | 'kind' | 'cat' | 'dmg' | 'prop' | 'other'
/** Display order of the groups (the panel and the active-filter row). */
export const FILTER_GROUPS: FilterGroup[] = ['zone', 'kind', 'cat', 'dmg', 'prop', 'other']

/** Anything the filter can look at: a Play card, or a spell with its tags. */
export interface Filterable {
  zone?: Zone
  kind?: CardKind | 'attack'
  tags?: readonly string[]
}

export const filterKey = (group: FilterGroup, value: string) => `${group}:${value}`
export function parseKey(key: string): { group: FilterGroup; value: string } {
  const i = key.indexOf(':')
  return { group: key.slice(0, i) as FilterGroup, value: key.slice(i + 1) }
}

/** The values a thing has in each group. */
export function facets(x: Filterable): Record<FilterGroup, string[]> {
  const out: Record<FilterGroup, string[]> = { zone: [], kind: [], cat: [], dmg: [], prop: [], other: [] }
  if (x.zone) out.zone.push(x.zone)
  if (x.kind) out.kind.push(kindGroup(x.kind))
  for (const t of x.tags ?? []) out[tagGroup(t)].push(t)
  return out
}

/** Criteria = groups, except that Category and Damage type are one criterion (types refine Damage). */
type Criterion = 'zone' | 'kind' | 'category' | 'prop' | 'other'
const criterionOf = (g: FilterGroup): Criterion => (g === 'cat' || g === 'dmg' ? 'category' : g)

function bySelection(selected: readonly string[]): Record<FilterGroup, string[]> {
  const out: Record<FilterGroup, string[]> = { zone: [], kind: [], cat: [], dmg: [], prop: [], other: [] }
  for (const k of selected) {
    const { group, value } = parseKey(k)
    if (group in out) out[group].push(value)
  }
  return out
}

/** Does `x` pass the selection? `skip` leaves one criterion out (used for the counts in the panel). */
export function matchesFilter(x: Filterable, selected: readonly string[], skip?: Criterion): boolean {
  if (selected.length === 0) return true
  const sel = bySelection(selected)
  const f = facets(x)
  const any = (have: string[], want: string[]) => want.some((w) => have.includes(w))
  if (skip !== 'zone' && sel.zone.length && !any(f.zone, sel.zone)) return false
  if (skip !== 'kind' && sel.kind.length && !any(f.kind, sel.kind)) return false
  if (skip !== 'prop' && sel.prop.length && !any(f.prop, sel.prop)) return false
  if (skip !== 'other' && sel.other.length && !any(f.other, sel.other)) return false
  if (skip !== 'category' && (sel.cat.length || sel.dmg.length)) {
    const cats = sel.cat.filter((c) => c !== 'damage')
    const damageOk = sel.dmg.length ? any(f.dmg, sel.dmg) : sel.cat.includes('damage') && f.cat.includes('damage')
    if (!any(f.cat, cats) && !damageOk) return false
  }
  return true
}

export interface FilterOption {
  key: string
  value: string
  /** Cards that would show with this option on, given the other groups' selection. */
  n: number
  on: boolean
}
export interface FilterGroupView {
  group: FilterGroup
  options: FilterOption[]
}

const FIXED_ORDER: Partial<Record<FilterGroup, readonly string[]>> = { zone: ZONES, kind: PLAY_KINDS, cat: CATEGORIES, dmg: DAMAGE_TYPES, prop: PROPERTIES }

/**
 * The panel's content: every group that has something to offer, with its options in a fixed order
 * (your own tags A-Z). An option is listed when some thing has it, or when it is selected (so a
 * selection can always be undone). The count is how many things would show with the option on.
 */
export function filterOptions(items: readonly Filterable[], selected: readonly string[], groups: readonly FilterGroup[] = FILTER_GROUPS): FilterGroupView[] {
  const all = items.map(facets)
  const sel = bySelection(selected)
  return groups
    .map((group) => {
      const present = new Set([...all.flatMap((f) => f[group]), ...sel[group]])
      const order = FIXED_ORDER[group]
      const values = order ? order.filter((v) => present.has(v)) : [...present].sort((a, b) => a.localeCompare(b))
      const crit = criterionOf(group)
      const pass = items.map((x) => matchesFilter(x, selected, crit))
      const options = values.map((value) => ({
        key: filterKey(group, value),
        value,
        n: all.filter((f, i) => pass[i] && f[group].includes(value)).length,
        on: sel[group].includes(value),
      }))
      return { group, options }
    })
    .filter((g) => g.options.length > 0)
}

/** The selection in display order: by group, then by option order. */
export function sortSelection(selected: readonly string[]): string[] {
  const rank = (k: string) => {
    const { group, value } = parseKey(k)
    const order = FIXED_ORDER[group]
    return FILTER_GROUPS.indexOf(group) * 1000 + (order ? order.indexOf(value) : 999)
  }
  return [...selected].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** Tap on an option. Damage and its types go through toggleDamage / toggleDamageType. */
export function toggleKey(selected: readonly string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
}

/** Damage is "on" when chosen as a whole or through any of its types. */
export const damageOn = (selected: readonly string[]) => selected.some((k) => k === 'cat:damage' || k.startsWith('dmg:'))

/** The Damage chip: on = any damage; tapping it while on (as a whole or by types) clears all of it. */
export function toggleDamage(selected: readonly string[]): string[] {
  return damageOn(selected) ? selected.filter((k) => k !== 'cat:damage' && !k.startsWith('dmg:')) : [...selected, 'cat:damage']
}

/** A damage type: toggles it; picking a type narrows "any damage" down to the chosen types. */
export function toggleDamageType(selected: readonly string[], type: string): string[] {
  const key = filterKey('dmg', type)
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected.filter((k) => k !== 'cat:damage'), key]
}

/** Only the zones the selection keeps (all of them when none is chosen). */
export function selectedZones(selected: readonly string[]): Zone[] {
  const z = bySelection(selected).zone
  return z.length ? ZONES.filter((x) => z.includes(x)) : ZONES
}
export const selectedKinds = (selected: readonly string[]) => bySelection(selected).kind
