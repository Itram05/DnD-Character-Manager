import { useMemo, useState } from 'react'
import { srdClass } from '../data/srd'
import { t } from '../i18n'
import { casterType, castingStats, classColumnValue } from '../model/rules'
import { matchesTags, spellTags, tagCounts } from '../model/tags'
import type { Spell } from '../model/types'
import { Check, fmtMod } from './common'
import { SpellEditor, blankSpell, fromSrdSpell, useSrdSpells } from './editors'
import type { SheetApi } from './Sheet'
import { TagFilter, tagLabel } from './tags'

export function SpellsView({ api }: { api: SheetApi }) {
  const { c, update, toast } = api
  const [edit, setEdit] = useState<Spell | null>(null)
  const [query, setQuery] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)
  const [tags, setTags] = useState<string[]>([])
  const srd = useSrdSpells()
  const casters = c.classes.filter((k) => casterType(k) !== 'none')
  const myClassNames = c.classes.map((k) => srdClass(k.id)?.name).filter(Boolean) as string[]

  const tagChips = useMemo(() => tagCounts(c.spells.map(spellTags)), [c.spells])
  const byLevel = useMemo(() => {
    const m = new Map<number, Spell[]>()
    for (const s of [...c.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))) {
      if (!matchesTags(spellTags(s), tags)) continue
      m.set(s.level, [...(m.get(s.level) ?? []), s])
    }
    return [...m.entries()]
  }, [c.spells, tags])

  const results = useMemo(() => {
    if (!srd || query.trim().length < 2) return []
    const q = query.toLowerCase()
    return srd
      .filter((s) => s.name.toLowerCase().includes(q))
      .filter((s) => !onlyMine || myClassNames.length === 0 || s.classes.some((k) => myClassNames.includes(k)))
      .slice(0, 12)
  }, [srd, query, onlyMine, myClassNames])

  const setSpell = (id: string, patch: Partial<Spell>) => update((x) => ({ ...x, spells: x.spells.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))

  return (
    <div className="spells-view">
      {casters.length > 0 && (
        <section className="panel prepared-summary">
          <h3>{t('spells.limits')}</h3>
          <div className="limits">
            {casters.map((k) => {
              const stats = castingStats(c).find((s) => s.classId === k.id)
              const maxPrep = classColumnValue(k.id, 'prepared-spells', k.level)
              const maxCantrips = classColumnValue(k.id, 'cantrips', k.level)
              const mine = c.spells.filter((s) => s.source === k.id)
              const prep = mine.filter((s) => s.level > 0 && s.prepared && !s.alwaysPrepared).length
              const cantrips = mine.filter((s) => s.level === 0).length
              return (
                <div key={k.id} className="limit">
                  <strong>{k.name}</strong>
                  {stats && (
                    <span className="muted">
                      {t('stats.saveDc')} {stats.saveDc} · {t('stats.spellAttack')} {fmtMod(stats.attack)}
                    </span>
                  )}
                  {maxCantrips !== undefined && maxCantrips > 0 && (
                    <span className={cantrips > maxCantrips ? 'warn' : ''}>{t('spells.cantripsCount', { n: cantrips, max: maxCantrips })}</span>
                  )}
                  {maxPrep !== undefined && <span className={prep > maxPrep ? 'warn' : ''}>{t('spells.preparedCount', { n: prep, max: maxPrep })}</span>}
                </div>
              )
            })}
          </div>
          <p className="hint">{t('spells.limitsHint')}</p>
        </section>
      )}

      <section className="panel srd-search">
        <h3>{t('spells.addFromSrd')}</h3>
        <div className="search-row">
          <input type="search" placeholder={t('spells.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('spells.addFromSrd')} />
          <Check label={t('spells.onlyMyClasses')} checked={onlyMine} onChange={setOnlyMine} />
          <button className="btn" onClick={() => setEdit(blankSpell())}>
            + {t('spells.custom')}
          </button>
        </div>
        {!srd && query.length >= 2 && <p className="muted">{t('common.loading')}</p>}
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((s) => {
              const have = c.spells.some((x) => x.name === s.name)
              const guess = c.classes.find((k) => s.classes.includes(srdClass(k.id)?.name ?? ''))?.id
              return (
                <li key={s.name}>
                  <span>
                    <strong>{s.name}</strong>{' '}
                    <span className="muted">
                      {s.level === 0 ? t('card.cantrip') : t('card.spellLevel', { n: s.level })} · {s.school} · {s.classes.join(', ')}
                    </span>
                  </span>
                  <button
                    className="btn btn-small"
                    disabled={have}
                    onClick={() => {
                      update((x) => ({ ...x, spells: [...x.spells, fromSrdSpell(s, guess)] }))
                      toast({ title: t('spells.added', { name: s.name }) })
                    }}
                  >
                    {have ? t('spells.have') : `+ ${t('common.add')}`}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {c.spells.length > 0 && <TagFilter tags={tagChips} selected={tags} onChange={setTags} />}
      {byLevel.length === 0 && <p className="muted panel">{tags.length ? t('tags.noMatch') : t('spells.none')}</p>}
      {byLevel.map(([lvl, list]) => (
        <section key={lvl} className="panel spell-level">
          <h3>{lvl === 0 ? t('spells.cantrips') : t('spells.levelN', { n: lvl })}</h3>
          <ul className="spell-rows">
            {list.map((s) => (
              <li key={s.id} className={s.level > 0 && !s.prepared && !s.alwaysPrepared ? 'unprepared' : ''}>
                {s.level > 0 ? (
                  <label className="prep-toggle" title={t('spell.prepared')}>
                    <input type="checkbox" checked={s.prepared || s.alwaysPrepared} disabled={s.alwaysPrepared} onChange={(e) => setSpell(s.id, { prepared: e.target.checked })} />
                  </label>
                ) : (
                  <span className="prep-toggle" />
                )}
                <button className="spell-name link-btn" onClick={() => setEdit(s)}>
                  {s.name}
                </button>
                <span className="tags">
                  {s.alwaysPrepared && <span className="tag" title={t('spell.alwaysPrepared')}>★</span>}
                  {s.concentration && <span className="tag" title={t('spell.concentration')}>C</span>}
                  {s.ritual && <span className="tag" title={t('spell.ritual')}>R</span>}
                  {s.tags?.map((tg) => (
                    <span key={tg} className="tag tag-mini">
                      {tagLabel(tg)}
                    </span>
                  ))}
                </span>
                <span className="muted spell-src">{s.source ?? ''}</span>
                <span className="muted spell-time">{s.castingTime}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {edit && <SpellEditor api={api} initial={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
