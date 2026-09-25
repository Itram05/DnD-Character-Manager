import { useMemo, useState } from 'react'
import { SRD_CLASSES, srdClass } from '../data/srd'
import { t } from '../i18n'
import { applyLevelUp, hpForLevel, planLevelUp, type LevelUpChoices } from '../model/levelup'
import { totalLevel } from '../model/rules'
import { ACTIVATIONS, type Activation } from '../model/types'
import { Check, NumberField, RichText, Select, TextArea, TextField, fmtMod } from './common'
import type { SheetApi } from './Sheet'

type Extra = LevelUpChoices['extraFeatures'][number]

export function LevelUpView({ api }: { api: SheetApi }) {
  const { c } = api
  const [classId, setClassId] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')
  const [customDie, setCustomDie] = useState(8)

  if (totalLevel(c) >= 20 && c.classes.reduce((s, k) => s + k.level, 0) >= 20) return <p className="panel">{t('level.max')}</p>

  if (!classId)
    return (
      <div className="levelup">
        <section className="panel">
          <h3>{t('level.pickClass')}</h3>
          <div className="class-picks">
            {c.classes.map((k) => (
              <button key={k.id} className="btn btn-big" onClick={() => setClassId(k.id)} disabled={k.level >= 20}>
                {k.name} {k.level} → {k.level + 1}
              </button>
            ))}
          </div>
          <h3>{t('level.newClass')}</h3>
          <p className="hint">{t('level.newClassHint')}</p>
          <div className="class-picks">
            {SRD_CLASSES.filter((k) => !c.classes.some((x) => x.id === k.id)).map((k) => (
              <button key={k.id} className="btn" onClick={() => setClassId(k.id)}>
                {k.name}
              </button>
            ))}
          </div>
          <div className="grid-3 custom-class">
            <TextField label={t('level.customClass')} value={customName} placeholder="Artificer" onChange={setCustomName} />
            <NumberField label={t('level.hitDie')} value={customDie} min={4} max={12} step={2} onChange={setCustomDie} />
            <button
              className="btn"
              disabled={!customName.trim()}
              onClick={() => {
                const id = customName.trim().toLowerCase()
                if (!c.classes.some((k) => k.id === id)) {
                  // register the class at level 0 so the planner knows its hit die; applying makes it level 1
                  setClassId(`custom:${customName.trim()}:${customDie}`)
                } else setClassId(id)
              }}
            >
              {t('level.go')}
            </button>
          </div>
        </section>
      </div>
    )

  return <LevelUpPlanView api={api} classKey={classId} onBack={() => setClassId(null)} />
}

function LevelUpPlanView({ api, classKey, onBack }: { api: SheetApi; classKey: string; onBack: () => void }) {
  const { c, update, toast, go } = api
  const custom = classKey.startsWith('custom:') ? classKey.split(':') : null
  const classId = custom ? custom[1].toLowerCase() : classKey
  // a custom class is planned against a character that already lists it at level 0
  const base = useMemo(
    () => (custom && !c.classes.some((k) => k.id === classId) ? { ...c, classes: [...c.classes, { id: classId, name: custom[1], level: 0, hitDie: Number(custom[2]) }] } : c),
    [c, classId, custom],
  )
  const [subclass, setSubclass] = useState('')
  const [subOther, setSubOther] = useState(false)
  const plan = useMemo(() => planLevelUp(base, classId, subclass || undefined), [base, classId, subclass])
  const [hpMode, setHpMode] = useState<'fixed' | 'roll'>('fixed')
  const [roll, setRoll] = useState(0)
  const [selected, setSelected] = useState<string[] | null>(null)
  const [done, setDone] = useState<string[]>([])
  const [extras, setExtras] = useState<Extra[]>([])
  const [openText, setOpenText] = useState<string | null>(null)

  const sel = selected ?? plan.features.filter((f) => !f.alreadyHave).map((f) => f.key)
  const firstEver = c.classes.reduce((s, k) => s + k.level, 0) === 0
  const hpGain = firstEver ? plan.hitDie + plan.conMod : hpForLevel(hpMode === 'fixed' ? plan.fixedHp : roll, plan.conMod)
  const srd = srdClass(classId)
  const slotsChanged = plan.slotsBefore.join() !== plan.slotsAfter.join()
  const pactChanged = plan.pactBefore.slots !== plan.pactAfter.slots || plan.pactBefore.level !== plan.pactAfter.level
  const needsManual = plan.noClassData || plan.subclassHasData === false

  const apply = () => {
    const next = applyLevelUp(base, plan, { hpGain, subclass: subclass || undefined, selected: sel, extraFeatures: extras })
    // a custom class carries its hit die
    const fixed = custom ? { ...next, classes: next.classes.map((k) => (k.id === classId ? { ...k, hitDie: Number(custom[2]) } : k)) } : next
    update(() => fixed)
    toast({ title: t('level.applied', { name: plan.className, n: plan.toLevel }), lines: [t('level.hpGained', { n: hpGain })], tone: 'good' })
    go('play')
  }

  return (
    <div className="levelup">
      <button className="link-btn" onClick={onBack}>
        ‹ {t('level.otherClass')}
      </button>
      <section className="panel level-head">
        <h2>
          {plan.className} {plan.fromLevel} → {plan.toLevel}
        </h2>
        <p className="muted">{t('level.charLevel', { a: plan.newTotalLevel - 1, b: plan.newTotalLevel })}</p>
        {plan.pbAfter !== plan.pbBefore && <p className="good">{t('level.pbUp', { a: fmtMod(plan.pbBefore), b: fmtMod(plan.pbAfter) })}</p>}
      </section>

      {plan.multiclass && (
        <section className={`panel ${plan.multiclass.prerequisitesMet ? '' : 'warn-panel'}`}>
          <h3>{t('level.multiclass')}</h3>
          <p className={plan.multiclass.prerequisitesMet ? 'good' : 'warn'}>{plan.multiclass.prerequisitesMet ? t('level.prereqOk') : t('level.prereqFail')}</p>
          <p className="muted">{plan.multiclass.requirement}</p>
          <RichText text={plan.multiclass.gains} />
        </section>
      )}

      {plan.needsSubclass && srd && (
        <section className="panel">
          <h3>{t('level.subclass')}</h3>
          <p className="hint">{t('level.subclassHint')}</p>
          <div className="class-picks">
            {srd.subclasses.map((s) => (
              <button key={s.id} className={`btn ${subclass === s.name ? 'btn-primary' : ''}`} onClick={() => (setSubOther(false), setSubclass(s.name), setSelected(null))}>
                {s.name} <small>(SRD)</small>
              </button>
            ))}
            <button className={`btn ${subOther ? 'btn-primary' : ''}`} onClick={() => (setSubOther(true), setSubclass(''), setSelected(null))}>
              {t('level.otherSubclass')}
            </button>
          </div>
          {subOther && <TextField label={t('level.subclassName')} value={subclass} placeholder="Eldritch Knight" onChange={(v) => (setSubclass(v), setSelected(null))} />}
          {subclass && srd.subclasses.find((s) => s.name === subclass) && <RichText text={srd.subclasses.find((s) => s.name === subclass)!.description} className="muted" />}
        </section>
      )}

      <section className="panel">
        <h3>{t('level.hp')}</h3>
        {firstEver ? (
          <p>{t('level.hpFirst', { die: plan.hitDie, con: fmtMod(plan.conMod), n: hpGain })}</p>
        ) : (
          <>
            <div className="radio-row">
              <label className="check">
                <input type="radio" checked={hpMode === 'fixed'} onChange={() => setHpMode('fixed')} />
                <span>{t('level.hpFixed', { n: plan.fixedHp, con: fmtMod(plan.conMod) })}</span>
              </label>
              <label className="check">
                <input type="radio" checked={hpMode === 'roll'} onChange={() => setHpMode('roll')} />
                <span>{t('level.hpRoll', { die: plan.hitDie })}</span>
              </label>
              {hpMode === 'roll' && (
                <input type="number" inputMode="numeric" min={1} max={plan.hitDie} value={roll || ''} onChange={(e) => setRoll(Number(e.target.value))} aria-label={t('level.hpRoll', { die: plan.hitDie })} className="small-input" />
              )}
            </div>
            <p>
              {t('level.hpResult', { n: hpGain, a: c.combat.hp.max, b: c.combat.hp.max + hpGain })}
            </p>
            <p className="hint">{t('level.hpHint')}</p>
          </>
        )}
      </section>

      {(slotsChanged || pactChanged || plan.columnChanges.length > 0) && (
        <section className="panel">
          <h3>{t('level.numbers')}</h3>
          <ul className="changes">
            {plan.columnChanges.map((ch) => (
              <li key={ch.label}>
                {ch.label}: <s>{ch.before}</s> → <b>{ch.after}</b>
              </li>
            ))}
            {slotsChanged && (
              <li>
                {t('level.slots')}: <s>{fmtSlots(plan.slotsBefore)}</s> → <b>{fmtSlots(plan.slotsAfter)}</b>
              </li>
            )}
            {pactChanged && (
              <li>
                {t('level.pact')}: <s>{t('level.pactFmt', plan.pactBefore)}</s> → <b>{t('level.pactFmt', plan.pactAfter)}</b>
              </li>
            )}
          </ul>
        </section>
      )}

      {plan.features.length > 0 && (
        <section className="panel">
          <h3>{t('level.features')}</h3>
          <p className="hint">{t('level.featuresHint')}</p>
          <ul className="lvl-features">
            {plan.features.map((f) => (
              <li key={f.key}>
                <Check
                  label={
                    <>
                      <strong>{f.name}</strong> <span className="muted">· {t(`level.origin.${f.origin}`)} · {t(`act.${f.activation}`)}</span>
                      {f.alreadyHave && <span className="tag">{t('level.have')}</span>}
                    </>
                  }
                  checked={sel.includes(f.key)}
                  onChange={(on) => setSelected(on ? [...sel, f.key] : sel.filter((k) => k !== f.key))}
                />
                <button className="link-btn" onClick={() => setOpenText(openText === f.key ? null : f.key)}>
                  {openText === f.key ? t('common.hide') : t('common.read')}
                </button>
                {openText === f.key && <RichText text={f.text} className="preview" />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {needsManual && (
        <section className="panel">
          <h3>{t('level.manual')}</h3>
          <p className="hint">{plan.noClassData ? t('level.noClassData') : t('level.noSubclassData', { name: plan.subclassName ?? '' })}</p>
          {extras.map((e, i) => (
            <div key={i} className="extra-feature">
              <div className="grid-2">
                <TextField label={t('common.name')} value={e.name} onChange={(name) => setExtras(extras.map((x, j) => (j === i ? { ...x, name } : x)))} />
                <Select<Activation> label={t('feature.activation')} value={e.activation} options={ACTIVATIONS.map((a) => ({ value: a, label: t(`act.${a}`) }))} onChange={(activation) => setExtras(extras.map((x, j) => (j === i ? { ...x, activation } : x)))} />
              </div>
              <TextArea label={t('common.description')} rows={3} value={e.description} onChange={(description) => setExtras(extras.map((x, j) => (j === i ? { ...x, description } : x)))} />
            </div>
          ))}
          <button className="btn" onClick={() => setExtras([...extras, { name: '', activation: 'passive', description: '' }])}>
            + {t('level.addManual')}
          </button>
        </section>
      )}

      {plan.decisions.length > 0 && (
        <section className="panel decisions">
          <h3>{t('level.decisions')}</h3>
          <ul>
            {plan.decisions.map((d) => (
              <li key={d}>
                <Check label={d} checked={done.includes(d)} onChange={(on) => setDone(on ? [...done, d] : done.filter((x) => x !== d))} />
              </li>
            ))}
          </ul>
          <p className="hint">{t('level.decisionsHint')}</p>
        </section>
      )}

      <div className="apply-row">
        <button className="btn btn-primary btn-big" onClick={apply} disabled={hpMode === 'roll' && !firstEver && !roll}>
          {t('level.apply', { name: plan.className, n: plan.toLevel })}
        </button>
      </div>
    </div>
  )
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
function fmtSlots(s: number[]) {
  const parts = s.map((n, i) => (n ? `${ORD[i]}×${n}` : '')).filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}
