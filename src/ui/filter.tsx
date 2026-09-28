// The card filter: a funnel button with the number of active filters, a panel with the groups
// (a sheet from the bottom on a phone, a popover next to the button on a computer), and a row
// with only the active filters, each with its own ✕, so a filter never hides cards unnoticed.
// Logic (what matches, counts, the Damage refinement) is in model/filter.ts.
import { useEffect, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { damageClass, type DamageType } from '../model/highlight'
import { damageOn, parseKey, sortSelection, toggleDamage, toggleDamageType, toggleKey, type FilterGroupView, type FilterOption } from '../model/filter'
import { tagClass, tagLabel } from './tags'

/** Label of one selected key; `custom` overrides it (the Play screen names its kinds itself). */
export function filterLabel(key: string, custom?: (key: string) => string | undefined): string {
  const c = custom?.(key)
  if (c) return c
  const { group, value } = parseKey(key)
  if (group === 'zone') return t(`zone.${value}`)
  if (group === 'kind') return t(`kind.${value}`)
  if (group === 'dmg') return t('filter.damageType', { type: tagLabel(value) })
  return tagLabel(value)
}

function FunnelIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

interface FilterProps {
  groups: FilterGroupView[]
  selected: string[]
  onChange: (s: string[]) => void
  label?: (key: string) => string | undefined
}

/** The funnel button and its panel. `initiallyOpen` is for tests (server render has no clicks). */
export function FilterButton(props: FilterProps & { initiallyOpen?: boolean; initiallyOpenDamage?: boolean }) {
  const { selected } = props
  const [open, setOpen] = useState(props.initiallyOpen ?? false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (props.groups.length === 0 && selected.length === 0) return null
  const n = selected.length
  return (
    <div className="filter-anchor">
      <button
        className={`filter-btn ${n ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={n ? t('filter.buttonN', { n }) : t('filter.button')}
        title={t('filter.title')}
      >
        <FunnelIcon />
        {n > 0 && <span className="filter-badge">{n}</span>}
      </button>
      {open && (
        <>
          <div className="filter-backdrop" onMouseDown={() => setOpen(false)} />
          <FilterPanel {...props} onClose={() => setOpen(false)} />
        </>
      )}
    </div>
  )
}

function Chip({ o, label, onClick, className = '' }: { o: FilterOption; label: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button className={`tag-chip ${className} ${o.on ? 'on' : ''} ${o.n === 0 && !o.on ? 'zero' : ''}`} aria-pressed={o.on} onClick={onClick}>
      {label}
      <span className="count">{o.n}</span>
    </button>
  )
}

function FilterPanel({ groups, selected, onChange, label, onClose, initiallyOpenDamage }: FilterProps & { onClose: () => void; initiallyOpenDamage?: boolean }) {
  const dmgTypes = groups.find((g) => g.group === 'dmg')?.options ?? []
  // the types stay folded unless one of them is chosen: then the choice is in sight
  const [typesOpen, setTypesOpen] = useState(initiallyOpenDamage ?? dmgTypes.some((o) => o.on))
  return (
    <div className="filter-panel" role="dialog" aria-label={t('filter.title')}>
      <header className="filter-head">
        <h3>{t('filter.title')}</h3>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
          ✕
        </button>
      </header>
      <div className="filter-body">
        {groups
          .filter((g) => g.group !== 'dmg')
          .map((g) => (
            <section key={g.group} className={`filter-group filter-${g.group}`}>
              <h4>{t(`filter.group.${g.group}`)}</h4>
              <div className="filter-chips">
                {g.options.map((o) =>
                  g.group === 'cat' && o.value === 'damage' ? (
                    <span key={o.key} className="chip-split">
                      <Chip o={{ ...o, on: damageOn(selected) }} label={tagLabel('damage')} className="tag-cat" onClick={() => onChange(toggleDamage(selected))} />
                      {dmgTypes.length > 0 && (
                        <button className={`chip-arrow ${typesOpen ? 'open' : ''}`} aria-expanded={typesOpen} aria-label={t('filter.damageTypes')} title={t('filter.damageTypes')} onClick={() => setTypesOpen(!typesOpen)}>
                          {typesOpen ? '▴' : '▾'}
                        </button>
                      )}
                    </span>
                  ) : (
                    <Chip key={o.key} o={o} label={filterLabel(o.key, label)} className={g.group === 'cat' || g.group === 'prop' ? `tag-${g.group}` : g.group === 'other' ? 'tag-own' : ''} onClick={() => onChange(toggleKey(selected, o.key))} />
                  ),
                )}
              </div>
              {g.group === 'cat' && typesOpen && dmgTypes.length > 0 && (
                <div className="filter-chips filter-dmg" role="group" aria-label={t('filter.damageTypes')}>
                  {dmgTypes.map((o) => (
                    <Chip key={o.key} o={o} label={tagLabel(o.value)} className={`tag-dmg ${damageClass(o.value as DamageType)}`} onClick={() => onChange(toggleDamageType(selected, o.value))} />
                  ))}
                </div>
              )}
            </section>
          ))}
      </div>
      <footer className="filter-foot">
        <button className="btn" disabled={selected.length === 0} onClick={() => onChange([])}>
          {t('filter.clearAll')}
        </button>
        <button className="btn btn-primary" onClick={onClose}>
          {t('filter.done')}
        </button>
      </footer>
    </div>
  )
}

/** Only the active filters, each with ✕. Nothing at all when no filter is on. */
export function ActiveFilters({ selected, onChange, label }: Omit<FilterProps, 'groups'>) {
  if (selected.length === 0) return null
  return (
    <div className="active-filters" role="group" aria-label={t('filter.active')}>
      {sortSelection(selected).map((k) => {
        const { group, value } = parseKey(k)
        const cls = group === 'dmg' ? `tag-dmg ${damageClass(value as DamageType)}` : group === 'zone' || group === 'kind' ? '' : tagClass(value)
        return (
          <button key={k} className={`tag-chip on ${cls}`} onClick={() => onChange(selected.filter((x) => x !== k))} aria-label={t('filter.remove', { name: filterLabel(k, label) })}>
            {filterLabel(k, label)} <span aria-hidden="true">✕</span>
          </button>
        )
      })}
      {selected.length > 1 && (
        <button className="tag-chip tag-clear" onClick={() => onChange([])}>
          {t('filter.clearAll')}
        </button>
      )}
    </div>
  )
}
