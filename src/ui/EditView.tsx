import { useState } from 'react'
import { SRD_BACKGROUNDS, SRD_CLASSES, SRD_SPECIES, srdClass } from '../data/srd'
import { t } from '../i18n'
import { evalFormula } from '../model/rules'
import { ABILITIES, type CasterType, type ClassEntry } from '../model/types'
import { Check, Confirm, NumberField, Select, TextField } from './common'
import type { SheetApi } from './Sheet'
import { downloadJson } from './Sheet'

const CASTER: (CasterType | '')[] = ['', 'full', 'half', 'third', 'pact', 'none']

export function EditView({ api }: { api: SheetApi }) {
  const { c, update } = api
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)
  const setClass = (i: number, patch: Partial<ClassEntry>) => update((x) => ({ ...x, classes: x.classes.map((k, j) => (j === i ? { ...k, ...patch } : k)) }))
  const acPreview = evalFormula(c, c.combat.unarmoredAc)

  return (
    <div className="edit-view">
      <section className="panel">
        <h3>{t('edit.identity')}</h3>
        <div className="grid-3">
          <TextField label={t('common.name')} value={c.name} onChange={(name) => update((x) => ({ ...x, name }))} />
          <TextField label={t('edit.player')} value={c.player} onChange={(player) => update((x) => ({ ...x, player }))} />
          <TextField
            label={t('edit.species')}
            value={c.species.name}
            list="srd-species"
            onChange={(name) => {
              const sp = SRD_SPECIES.find((s) => s.name.toLowerCase() === name.toLowerCase())
              update((x) => ({ ...x, species: { ...x.species, name }, combat: sp ? { ...x.combat, speed: sp.speed } : x.combat }))
            }}
          />
          <TextField label={t('edit.background')} value={c.background} list="srd-backgrounds" onChange={(background) => update((x) => ({ ...x, background }))} />
          <TextField label={t('edit.alignment')} value={c.alignment} onChange={(alignment) => update((x) => ({ ...x, alignment }))} />
          <NumberField label={t('edit.xp')} value={c.xp} min={0} onChange={(xp) => update((x) => ({ ...x, xp }))} />
        </div>
        <datalist id="srd-species">{SRD_SPECIES.map((s) => <option key={s.name} value={s.name} />)}</datalist>
        <datalist id="srd-backgrounds">{SRD_BACKGROUNDS.map((s) => <option key={s.name} value={s.name} />)}</datalist>
        <p className="hint">{t('edit.speciesHint')}</p>
      </section>

      <section className="panel">
        <h3>{t('edit.classes')}</h3>
        <p className="hint">{t('edit.classesHint')}</p>
        {c.classes.map((k, i) => {
          const srd = srdClass(k.id)
          return (
            <div key={i} className="class-row">
              <div className="grid-3">
                <Select
                  label={t('edit.class')}
                  value={srd ? srd.id : '__custom'}
                  options={[...SRD_CLASSES.map((s) => ({ value: s.id, label: s.name })), { value: '__custom', label: t('edit.customClass') }]}
                  onChange={(v) => {
                    if (v === '__custom') setClass(i, { id: 'custom', name: 'Custom', hitDie: 8 })
                    else setClass(i, { id: v, name: srdClass(v)!.name, hitDie: undefined, subclass: undefined })
                  }}
                />
                {!srd && <TextField label={t('edit.className')} value={k.name} onChange={(name) => setClass(i, { name, id: name.toLowerCase().replace(/\s+/g, '-') || 'custom' })} />}
                <NumberField label={t('edit.level')} value={k.level} min={1} max={20} onChange={(level) => setClass(i, { level: Math.max(1, Math.min(20, Math.round(level))) })} />
                <TextField label={t('edit.subclass')} value={k.subclass ?? ''} list={`subs-${i}`} onChange={(subclass) => setClass(i, { subclass: subclass || undefined })} />
                <datalist id={`subs-${i}`}>{srd?.subclasses.map((s) => <option key={s.id} value={s.name} />)}</datalist>
                {!srd && <NumberField label={t('level.hitDie')} value={k.hitDie ?? 8} min={4} max={12} step={2} onChange={(hitDie) => setClass(i, { hitDie })} />}
                <Select
                  label={t('edit.casterType')}
                  value={k.casterType ?? ''}
                  options={CASTER.map((x) => ({ value: x, label: x ? t(`caster.${x}`) : t('edit.casterAuto') }))}
                  onChange={(v) => setClass(i, { casterType: (v || undefined) as CasterType | undefined })}
                />
                {(k.casterType && k.casterType !== 'none') || (!srd && k.casterType) ? (
                  <Select label={t('edit.castingAbility')} value={k.spellcastingAbility ?? 'int'} options={ABILITIES.map((a) => ({ value: a, label: t(`ability.long.${a}`) }))} onChange={(spellcastingAbility) => setClass(i, { spellcastingAbility })} />
                ) : null}
              </div>
              {c.classes.length > 1 && (
                <button className="link-btn danger" onClick={() => setRemoveIdx(i)}>
                  {t('edit.removeClass')}
                </button>
              )}
            </div>
          )
        })}
        <button className="btn" onClick={() => api.go('level')}>
          {t('edit.addViaLevelUp')}
        </button>
      </section>

      <section className="panel">
        <h3>{t('stats.abilities')}</h3>
        <div className="grid-6">
          {ABILITIES.map((a) => (
            <NumberField key={a} label={t(`ability.${a}`)} value={c.abilities[a]} min={1} max={30} onChange={(n) => update((x) => ({ ...x, abilities: { ...x.abilities, [a]: Math.max(1, Math.min(30, Math.round(n))) } }))} />
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>{t('edit.combat')}</h3>
        <div className="grid-3">
          <NumberField label={t('edit.maxHp')} value={c.combat.hp.max} min={1} onChange={(max) => update((x) => ({ ...x, combat: { ...x.combat, hp: { ...x.combat.hp, max: Math.max(1, max), current: Math.min(x.combat.hp.current, Math.max(1, max)) } } }))} />
          <NumberField label={t('vitals.speed')} value={c.combat.speed} min={0} step={5} onChange={(speed) => update((x) => ({ ...x, combat: { ...x.combat, speed } }))} />
          <label className="field">
            <span>{t('edit.unarmoredAc')}</span>
            <input value={String(c.combat.unarmoredAc)} onChange={(e) => update((x) => ({ ...x, combat: { ...x.combat, unarmoredAc: e.target.value } }))} />
            <small className={acPreview.error || acPreview.unknown.length ? 'warn' : 'hint'}>{acPreview.error ?? t('uses.now', { n: acPreview.value })}</small>
          </label>
          <NumberField label={t('edit.acBonus')} value={c.combat.acBonus} onChange={(acBonus) => update((x) => ({ ...x, combat: { ...x.combat, acBonus } }))} />
          <NumberField label={t('edit.initBonus')} value={c.combat.initiativeBonus} onChange={(initiativeBonus) => update((x) => ({ ...x, combat: { ...x.combat, initiativeBonus } }))} />
        </div>
        <p className="hint">{t('edit.acHint')}</p>
      </section>

      <section className="panel">
        <h3>{t('stats.proficiencies')}</h3>
        <div className="grid-2">
          {(['armor', 'weapons', 'tools', 'languages'] as const).map((k) => (
            <TextField key={k} label={t(`prof.${k}`)} value={c.proficiencies[k]} onChange={(v) => update((x) => ({ ...x, proficiencies: { ...x.proficiencies, [k]: v } }))} />
          ))}
          <TextField
            label={t('prof.masteries')}
            value={c.proficiencies.weaponMasteries.join(', ')}
            onChange={(v) => update((x) => ({ ...x, proficiencies: { ...x.proficiencies, weaponMasteries: v.split(',').map((s) => s.trim()).filter(Boolean) } }))}
          />
        </div>
        <Check label={t('edit.joat')} checked={c.proficiencies.jackOfAllTrades} onChange={(jackOfAllTrades) => update((x) => ({ ...x, proficiencies: { ...x.proficiencies, jackOfAllTrades } }))} />
      </section>

      <section className="panel">
        <h3>{t('edit.file')}</h3>
        <button className="btn" onClick={() => downloadJson(c)}>
          {t('list.export')}
        </button>
        <p className="hint">{t('edit.fileHint')}</p>
      </section>

      {removeIdx !== null && (
        <Confirm
          title={t('edit.removeClass')}
          message={t('edit.removeClassConfirm', { name: c.classes[removeIdx].name })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setRemoveIdx(null)}
          onConfirm={() => {
            update((x) => ({ ...x, classes: x.classes.filter((_, j) => j !== removeIdx) }))
            setRemoveIdx(null)
          }}
        />
      )}
    </div>
  )
}
