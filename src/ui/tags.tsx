// Tag chips: read-only lists (the zoomed card) and the tag editor used by every editor.
// The filter itself (funnel button and panel) is in filter.tsx.
import { useId, useState } from 'react'
import { t } from '../i18n'
import { damageClass, type DamageType } from '../model/highlight'
import { normalizeTag } from '../model/normalize'
import { MANUAL_CATEGORIES, sortTags, tagGroup } from '../model/tags'

/** Built-in tags have a label ("mobility" -> "Mobility"); your own tags are shown as written. */
export function tagLabel(tag: string): string {
  const key = `tag.${tag}`
  const s = t(key)
  return s === key ? tag : s
}

/** Colour by group: damage types in their colour, categories and properties muted, own tags plain. */
export function tagClass(tag: string): string {
  const g = tagGroup(tag)
  return g === 'dmg' ? `tag-dmg ${damageClass(tag as DamageType)}` : g === 'other' ? 'tag-own' : `tag-${g}`
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
 * suggestion to add it; × removes. `auto` shows the automatic tags, which cannot be removed here
 * (see autoPart in model/tags: Utility disappears as soon as you add a category yourself).
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
  const suggestions = sortTags([...new Set([...MANUAL_CATEGORIES, ...(props.known ?? [])])]).filter((x) => !own.includes(x) && !auto.includes(x))
  const listId = `tag-suggest${useId().replace(/:/g, '')}`
  return (
    <fieldset className="tag-input">
      <legend>{t('tags.title')}</legend>
      <div className="tag-chips">
        {auto.map((tag) => (
          <span key={tag} className={`tag-chip static ${tagClass(tag)} auto`} title={t('tags.autoHint')}>
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
      <small className="hint">{t('tags.autoHint')}</small>
    </fieldset>
  )
}
