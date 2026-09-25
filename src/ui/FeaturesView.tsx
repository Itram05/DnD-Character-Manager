import { useMemo, useState } from 'react'
import { SRD_BACKGROUNDS, SRD_CLASSES, SRD_FEATS, SRD_SPECIES, srdClass, srdSubclass } from '../data/srd'
import { guessActivation, presetFor } from '../data/srdPresets'
import { t } from '../i18n'
import { newId } from '../model/normalize'
import { usesMax } from '../model/rules'
import { SOURCE_TYPES, type Feature, type SourceType } from '../model/types'
import { Modal, RichText } from './common'
import { FeatureEditor, blankFeature } from './editors'
import { FRAME_GLYPH } from './GameCard'
import type { SheetApi } from './Sheet'

interface SrdPick {
  key: string
  group: string
  name: string
  text: string
  source: { type: SourceType; name: string }
  classId?: string
  subclassId?: string
}

function srdPicks(api: SheetApi): SrdPick[] {
  const out: SrdPick[] = []
  for (const k of api.c.classes) {
    const cls = srdClass(k.id)
    if (!cls) continue
    for (const f of cls.features.filter((x) => x.level <= k.level))
      out.push({ key: `c:${cls.id}:${f.name}:${f.level}`, group: cls.name, name: f.name, text: f.text, source: { type: 'class', name: `${cls.name} ${f.level}` }, classId: cls.id })
    const sub = srdSubclass(cls, k.subclass)
    if (sub)
      for (const f of sub.features.filter((x) => x.level <= k.level))
        out.push({ key: `s:${sub.id}:${f.name}`, group: sub.name, name: f.name, text: f.text, source: { type: 'subclass', name: `${sub.name} ${f.level}` }, classId: cls.id, subclassId: sub.id })
    for (const g of cls.optionGroups)
      for (const o of g.options) out.push({ key: `o:${g.name}:${o.name}`, group: g.name, name: o.name, text: o.text, source: { type: 'class', name: g.name.replace(/ Options$/, '') } })
  }
  for (const f of SRD_FEATS) out.push({ key: `f:${f.name}`, group: t('features.feats'), name: f.name, text: f.text, source: { type: 'feat', name: f.category } })
  for (const s of SRD_SPECIES)
    for (const tr of s.traits) out.push({ key: `sp:${s.name}:${tr.name}`, group: s.name, name: tr.name, text: tr.text, source: { type: 'species', name: s.name } })
  for (const b of SRD_BACKGROUNDS) out.push({ key: `b:${b.name}`, group: t('features.backgrounds'), name: b.name, text: b.text, source: { type: 'background', name: b.name } })
  return out
}

function toFeature(p: SrdPick): Feature {
  const preset = p.classId ? presetFor(p.classId, p.subclassId, p.name) : undefined
  return {
    id: newId(),
    name: p.name,
    source: p.source,
    activation: preset?.activation ?? guessActivation(p.text),
    description: p.text,
    ...(preset?.uses ? { uses: { ...preset.uses, used: 0 } } : {}),
  }
}

export function FeaturesView({ api }: { api: SheetApi }) {
  const { c } = api
  const [edit, setEdit] = useState<Feature | null>(null)
  const [picker, setPicker] = useState(false)

  const groups = SOURCE_TYPES.map((type) => ({ type, list: c.features.filter((f) => f.source.type === type) })).filter((g) => g.list.length)

  return (
    <div className="features-view">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setEdit(blankFeature())}>
          + {t('feature.add')}
        </button>
        <button className="btn" onClick={() => setPicker(true)}>
          {t('features.fromSrd')}
        </button>
      </div>
      <p className="hint">{t('features.hint')}</p>
      {groups.length === 0 && <p className="muted panel">{t('features.none')}</p>}
      {groups.map((g) => (
        <section key={g.type} className={`panel feature-group frame-${g.type}`}>
          <h3>
            <span className="glyph">{FRAME_GLYPH[g.type]}</span> {t(`source.${g.type}`)}
          </h3>
          <ul className="feature-rows">
            {g.list.map((f) => (
              <li key={f.id}>
                <button className="link-btn" onClick={() => setEdit(f)}>
                  {f.name}
                </button>
                <span className="muted">{f.source.name}</span>
                <span className={`gem gem-small gem-${f.activation === 'passive' ? 'passive' : f.activation}`}>{t(`act.${f.activation}`)}</span>
                {f.uses && (
                  <span className="muted">
                    {usesMax(c, f.uses.max) - Math.min(f.uses.used, usesMax(c, f.uses.max))}/{usesMax(c, f.uses.max)} · {t(`recharge.${f.uses.recharge}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {edit && <FeatureEditor api={api} initial={edit} onClose={() => setEdit(null)} />}
      {picker && <SrdPicker api={api} onClose={() => setPicker(false)} onPick={(f) => (setPicker(false), setEdit(f))} />}
    </div>
  )
}

function SrdPicker({ api, onClose, onPick }: { api: SheetApi; onClose: () => void; onPick: (f: Feature) => void }) {
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<SrdPick | null>(null)
  const all = useMemo(() => srdPicks(api), [api])
  const hits = q.trim().length < 2 ? all.slice(0, 40) : all.filter((p) => `${p.name} ${p.group}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60)
  return (
    <Modal title={t('features.fromSrd')} onClose={onClose} wide>
      <input type="search" autoFocus placeholder={t('features.search')} value={q} onChange={(e) => setQ(e.target.value)} className="full" aria-label={t('features.search')} />
      <p className="hint">{t('features.srdScope', { n: SRD_CLASSES.length })}</p>
      <ul className="search-results">
        {hits.map((p) => (
          <li key={p.key}>
            <button className="link-btn" onClick={() => setPreview(preview?.key === p.key ? null : p)}>
              <strong>{p.name}</strong> <span className="muted">· {p.group}</span>
            </button>
            <button className="btn btn-small" onClick={() => onPick(toFeature(p))}>
              + {t('common.add')}
            </button>
            {preview?.key === p.key && <RichText text={p.text} className="preview" />}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
