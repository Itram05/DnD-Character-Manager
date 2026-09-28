// Tag chips: the filter row (Play, Spells) and the tag editor used by every editor.
import { useId, useState } from 'react'
import { t } from '../i18n'
import { DAMAGE_TYPES, damageClass, type DamageType } from '../model/highlight'
import { normalizeTag } from '../model/normalize'
import { SUGGESTED_TAGS, isAutoTag, sortTags } from '../model/tags'

/** Built-in tags have a label ("save" -> "Saving throw"); your own tags are shown as written. */
export function tagLabel(tag: string): string {
  const key = `tag.${tag}`
  const s = t(key)
  return s === key ? tag : s
}

const tagClass = (tag: string) => ((DAMAGE_TYPES as readonly string[]).includes(tag) ? `tag-dmg ${damageClass(tag as DamageType)}` : isAutoTag(tag) ? 'tag-auto' : 'tag-own')

const isDamageTag = (tag: string) => tag === 'damage' || (DAMAGE_TYPES as readonly string[]).includes(tag)

export type TagFilterItem = { kind: 'chip'; tag: string; n: number } | { kind: 'damage'; n: number; open: boolean; types: number }

/**
 * What the filter row shows, in order. Damage and its types (up to 13 chips) fold under one
 * "Damage" chip that opens on tap; open, it is followed by "Any damage" and the types. Folded,
 * the selected ones stay in the row next to it, so an active filter is never hidden.
 * Tags with no matching card are hidden unless selected (so a selection can always be undone).
 */
export function tagFilterRow(tags: { tag: string; n: number }[], selected: string[], open: boolean): TagFilterItem[] {
  const shown = [...tags.filter((x) => x.n > 0 || selected.includes(x.tag)), ...selected.filter((s) => !tags.some((x) => x.tag === s)).map((tag) => ({ tag, n: 0 }))]
  const dmg = shown.filter((x) => isDamageTag(x.tag))
  const types = dmg.filter((x) => x.tag !== 'damage').length
  // only "damage" with no type: nothing to fold
  if (types === 0) return shown.map((x) => ({ kind: 'chip', ...x }))
  const out: TagFilterItem[] = []
  for (const x of shown) {
    if (!isDamageTag(x.tag)) out.push({ kind: 'chip', ...x })
    else if (x === dmg[0]) {
      out.push({ kind: 'damage', n: tags.find((y) => y.tag === 'damage')?.n ?? 0, open, types })
      for (const d of dmg) if (open || selected.includes(d.tag)) out.push({ kind: 'chip', ...d })
    }
  }
  return out
}

/**
 * One row of toggle chips, scrolling sideways on a phone. A card must have every selected tag.
 * The same row on Play and on the Spells tab; the Damage fold starts closed.
 */
export function TagFilter(props: { tags: { tag: string; n: number }[]; selected: string[]; onChange: (s: string[]) => void; initiallyOpen?: boolean }) {
  const { tags, selected, onChange } = props
  const [open, setOpen] = useState(props.initiallyOpen ?? false)
  const row = tagFilterRow(tags, selected, open)
  if (row.length === 0) return null
  const toggle = (tag: string) => onChange(selected.includes(tag) ? selected.filter((x) => x !== tag) : [...selected, tag])
  return (
    <div className="tag-filter" role="group" aria-label={t('tags.filter')}>
      <span className="tag-filter-label" aria-hidden="true">
        #
      </span>
      {selected.length > 0 && (
        <button className="tag-chip tag-clear" onClick={() => onChange([])} aria-label={t('tags.clear')}>
          ✕ {t('tags.clear')}
        </button>
      )}
      {row.map((x) =>
        x.kind === 'damage' ? (
          <button key="#damage" className={`tag-chip tag-group ${x.open ? 'open' : ''}`} aria-expanded={x.open} title={t('tags.damageTypes')} onClick={() => setOpen(!x.open)}>
            {tagLabel('damage')}
            <span className="count">{x.n}</span>
            <span className="tag-caret" aria-hidden="true">
              {x.open ? '▾' : '▸'}
            </span>
          </button>
        ) : (
          <button key={x.tag} className={`tag-chip ${tagClass(x.tag)} ${selected.includes(x.tag) ? 'on' : ''}`} aria-pressed={selected.includes(x.tag)} onClick={() => toggle(x.tag)}>
            {x.tag === 'damage' && row.some((y) => y.kind === 'damage') ? t('tags.anyDamage') : tagLabel(x.tag)}
            <span className="count">{x.n}</span>
          </button>
        ),
      )}
    </div>
  )
}

/** Read-only chips, e.g. in the zoomed card. */
export function TagList({ tags }: { tags: string[] | undefined }) {
  if (!tags?.length) return null
  return (
    <p className="tag-list" aria-label={t('tags.title')}>
      {tags.map((tag) => (
        <span key={tag} className={`tag-chip static ${tagClass(tag)}`}>
          {tagLabel(tag)}
        </span>
      ))}
    </p>
  )
}

/**
 * Your own tags on a spell / feature / item / power. Type and press Enter (or a comma); tap a
 * suggestion to add it; × removes. `auto` shows the automatic tags, which cannot be removed here.
 */
export function TagInput(props: { value: string[] | undefined; onChange: (tags: string[] | undefined) => void; auto?: string[]; known?: string[] }) {
  const [text, setText] = useState('')
  const own = props.value ?? []
  const set = (list: string[]) => props.onChange(list.length ? [...new Set(list)] : undefined)
  const add = (raw: string) => {
    const parts = raw.split(',').map(normalizeTag).filter(Boolean)
    if (parts.length) set([...own, ...parts])
    setText('')
  }
  const auto = (props.auto ?? []).filter((x) => !own.includes(x))
  const suggestions = sortTags([...new Set([...SUGGESTED_TAGS, ...(props.known ?? [])])]).filter((x) => !own.includes(x) && !auto.includes(x))
  const listId = `tag-suggest${useId().replace(/:/g, '')}`
  return (
    <fieldset className="tag-input">
      <legend>{t('tags.title')}</legend>
      <div className="tag-chips">
        {auto.map((tag) => (
          <span key={tag} className={`tag-chip static ${tagClass(tag)}`} title={t('tags.autoHint')}>
            {tagLabel(tag)}
          </span>
        ))}
        {own.map((tag) => (
          <span key={tag} className={`tag-chip static ${tagClass(tag)} mine`}>
            {tagLabel(tag)}
            <button type="button" className="tag-remove" onClick={() => set(own.filter((x) => x !== tag))} aria-label={t('tags.remove', { tag })}>
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={text}
        list={listId}
        placeholder={t('tags.placeholder')}
        aria-label={t('tags.add')}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(text)
          }
        }}
        onBlur={() => text.trim() && add(text)}
      />
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      {suggestions.length > 0 && (
        <div className="tag-suggestions">
          {suggestions.slice(0, 12).map((s) => (
            <button key={s} type="button" className="tag-chip tag-suggest" onClick={() => set([...own, s])}>
              + {tagLabel(s)}
            </button>
          ))}
        </div>
      )}
      {auto.length > 0 && <small className="hint">{t('tags.autoHint')}</small>}
    </fieldset>
  )
}
