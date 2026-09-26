// "New character" screen: quick creation of a level 1 hero.
// The logic lives in model/create.ts (buildCharacter); this file is only the form.
import { useState } from 'react'
import { SRD_BACKGROUNDS, SRD_CLASSES, SRD_SPECIES, srdClass } from '../data/srd'
import { POINT_BUY_TOTAL, POINT_COST, STANDARD_ARRAY, backgroundInfo, speciesChoice, speciesSizes, suggestedArray } from '../data/srdOrigins'
import { t } from '../i18n'
import { CUSTOM, bonusAbilities, buildCharacter, finalScores, pointBuyCost, validateChoices, type CreateChoices, type ScoreMethod } from '../model/create'
import { abilityMod, armorClass } from '../model/rules'
import { saveCharacter } from '../model/storage'
import { ABILITIES, type Ability } from '../model/types'
import { NumberField, RichText, TextArea, TextField, fmtMod } from './common'

type BonusMode = 'twoOne' | 'three'

const DEFAULT_SCORES = Object.fromEntries(ABILITIES.map((a, i) => [a, STANDARD_ARRAY[i]])) as Record<Ability, number>
const abilityList = (xs: Ability[]) => xs.map((a) => t(`ability.long.${a}`)).join(', ')

export function CreateView(props: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [classId, setClassId] = useState('')
  const [customClass, setCustomClass] = useState({ name: '', hitDie: 8, text: '' })
  const [background, setBackground] = useState('')
  const [customBackground, setCustomBackground] = useState({ name: '', text: '' })
  const [species, setSpecies] = useState('')
  const [customSpecies, setCustomSpecies] = useState({ name: '', size: 'Medium', speed: 30, text: '' })
  const [speciesOption, setSpeciesOption] = useState('')
  const [size, setSize] = useState('')
  const [method, setMethod] = useState<ScoreMethod>('standard')
  const [scores, setScores] = useState<Record<Ability, number>>(DEFAULT_SCORES)
  const [scoresTouched, setScoresTouched] = useState(false)
  const [bonusMode, setBonusMode] = useState<BonusMode>('twoOne')
  const [plus2, setPlus2] = useState<Ability | ''>('')
  const [plus1, setPlus1] = useState<Ability | ''>('')
  const [threeSet, setThreeSet] = useState<Ability[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  const cls = classId && classId !== CUSTOM ? srdClass(classId) : undefined
  const bg = background && background !== CUSTOM ? backgroundInfo(background) : undefined
  const sp = SRD_SPECIES.find((s) => s.name === species)
  const choice = sp ? speciesChoice(sp.name) : undefined
  const sizes = sp ? speciesSizes(sp.name) : []
  const allowed = background ? bonusAbilities({ background }) : []

  const bonus: Partial<Record<Ability, number>> = {}
  if (bonusMode === 'twoOne') {
    if (plus2) bonus[plus2] = 2
    if (plus1 && plus1 !== plus2) bonus[plus1] = 1
  } else for (const a of background === CUSTOM ? threeSet : allowed) bonus[a] = 1

  const choices: CreateChoices = {
    name,
    classId,
    customClass,
    background,
    customBackground,
    species,
    customSpecies,
    speciesOption: speciesOption || undefined,
    size: size || undefined,
    method,
    scores,
    bonus,
  }
  const errors = validateChoices(choices)
  // cheap enough to rebuild on every change; the summary shows exactly what Create will save
  const built = errors.length ? null : buildCharacter(choices, t('list.newHeroName'))
  const final = finalScores({ scores, bonus })

  // ----- handlers -----
  const pickClass = (id: string) => {
    setClassId(id)
    const s = suggestedArray(id)
    if (s && method === 'standard' && !scoresTouched) setScores(s)
  }
  const pickBackground = (name: string) => {
    setBackground(name)
    setThreeSet([])
    // default: +2 to the best allowed score, +1 to the next; the player can change it
    const al = name === CUSTOM ? [...ABILITIES] : (backgroundInfo(name)?.abilities ?? [])
    const sorted = [...al].sort((a, b) => scores[b] - scores[a])
    setPlus2(sorted[0] ?? '')
    setPlus1(sorted[1] ?? '')
  }
  const pickSpecies = (name: string) => {
    setSpecies(name)
    setSpeciesOption('')
    setSize(name !== CUSTOM ? (speciesSizes(name)[0] ?? '') : '')
  }
  const changeMethod = (m: ScoreMethod) => {
    setMethod(m)
    setScoresTouched(false)
    if (m === 'standard') setScores(suggestedArray(cls?.id) ?? DEFAULT_SCORES)
    if (m === 'pointBuy') setScores(Object.fromEntries(ABILITIES.map((a) => [a, 8])) as Record<Ability, number>)
  }
  /** Standard array: picking a value another ability has swaps the two, so the six values stay a valid set. */
  const setArrayValue = (a: Ability, v: number) => {
    setScoresTouched(true)
    setScores((s) => {
      const other = ABILITIES.find((x) => x !== a && s[x] === v)
      return other ? { ...s, [a]: v, [other]: s[a] } : { ...s, [a]: v }
    })
  }
  const setScore = (a: Ability, v: number) => {
    setScoresTouched(true)
    setScores((s) => ({ ...s, [a]: v }))
  }

  const create = () => {
    setTried(true)
    if (!built) return
    const st = saveCharacter(built.character)
    if (!st.ok) return setError(st.error ?? '')
    props.onCreated(built.character.id)
  }

  const spent = pointBuyCost(scores)
  const conMod = abilityMod(final.con)
  const hitDie = cls?.hitDie ?? (classId === CUSTOM ? customClass.hitDie : undefined)

  return (
    <div className="list-page create-page">
      <button className="link-btn" onClick={props.onCancel}>
        ‹ {t('nav.allCharacters')}
      </button>
      <h1 className="create-title">{t('create.title')}</h1>
      <p className="hint">{t('create.intro')}</p>

      {/* 1. name */}
      <section className="panel">
        <TextField label={t('common.name')} value={name} placeholder={t('list.newHeroName')} onChange={setName} />
      </section>

      {/* 2. class */}
      <section className="panel">
        <h3>
          <span className="step">1</span> {t('create.class')}
        </h3>
        <div className="pick-grid">
          {SRD_CLASSES.map((k) => (
            <button key={k.id} className={`pick ${classId === k.id ? 'active' : ''}`} aria-pressed={classId === k.id} onClick={() => pickClass(k.id)}>
              {k.name}
            </button>
          ))}
          <button className={`pick ${classId === CUSTOM ? 'active' : ''}`} aria-pressed={classId === CUSTOM} onClick={() => setClassId(CUSTOM)}>
            {t('create.custom')}
          </button>
        </div>
        {cls && (
          <dl className="pick-info">
            <dt>{t('create.hitDie')}</dt>
            <dd>d{cls.hitDie}</dd>
            <dt>{t('create.primary')}</dt>
            <dd>{cls.primaryAbilityText}</dd>
            <dt>{t('stats.saves')}</dt>
            <dd>{abilityList(cls.savingThrows)}</dd>
            <dt>{t('create.armor')}</dt>
            <dd>{cls.armorTraining}</dd>
            <dt>{t('create.level1')}</dt>
            <dd>{cls.table[0]?.features.join(', ')}</dd>
          </dl>
        )}
        {classId === CUSTOM && (
          <div className="custom-box">
            <p className="hint">{t('create.customHint')}</p>
            <div className="grid-2">
              <TextField label={t('create.customClassName')} value={customClass.name} placeholder="Artificer" onChange={(v) => setCustomClass({ ...customClass, name: v })} />
              <label className="field">
                <span>{t('create.hitDie')}</span>
                <select value={customClass.hitDie} onChange={(e) => setCustomClass({ ...customClass, hitDie: Number(e.target.value) })}>
                  {[6, 8, 10, 12].map((d) => (
                    <option key={d} value={d}>
                      d{d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <TextArea label={t('create.customText')} value={customClass.text} rows={3} onChange={(v) => setCustomClass({ ...customClass, text: v })} />
          </div>
        )}
      </section>

      {/* 3. background */}
      <section className="panel">
        <h3>
          <span className="step">2</span> {t('create.background')}
        </h3>
        <p className="hint">{t('create.backgroundHint')}</p>
        <div className="pick-grid">
          {SRD_BACKGROUNDS.map((b) => (
            <button key={b.name} className={`pick ${background === b.name ? 'active' : ''}`} aria-pressed={background === b.name} onClick={() => pickBackground(b.name)}>
              {b.name}
            </button>
          ))}
          <button className={`pick ${background === CUSTOM ? 'active' : ''}`} aria-pressed={background === CUSTOM} onClick={() => pickBackground(CUSTOM)}>
            {t('create.custom')}
          </button>
        </div>
        {bg && (
          <dl className="pick-info">
            <dt>{t('create.bgAbilities')}</dt>
            <dd>{abilityList(bg.abilities)}</dd>
            <dt>{t('create.feat')}</dt>
            <dd>{bg.feat}</dd>
            <dt>{t('stats.skills')}</dt>
            <dd>{bg.skills.join(', ')}</dd>
            <dt>{t('create.tool')}</dt>
            <dd>{bg.tool}</dd>
          </dl>
        )}
        {background === CUSTOM && (
          <div className="custom-box">
            <p className="hint">{t('create.customHint')}</p>
            <TextField label={t('create.customBackgroundName')} value={customBackground.name} placeholder="Guild Artisan" onChange={(v) => setCustomBackground({ ...customBackground, name: v })} />
            <TextArea label={t('create.customText')} value={customBackground.text} rows={3} onChange={(v) => setCustomBackground({ ...customBackground, text: v })} />
          </div>
        )}
      </section>

      {/* 4. species */}
      <section className="panel">
        <h3>
          <span className="step">3</span> {t('create.species')}
        </h3>
        <p className="hint">{t('create.speciesHint')}</p>
        <div className="pick-grid">
          {SRD_SPECIES.map((s) => (
            <button key={s.name} className={`pick ${species === s.name ? 'active' : ''}`} aria-pressed={species === s.name} onClick={() => pickSpecies(s.name)}>
              {s.name}
            </button>
          ))}
          <button className={`pick ${species === CUSTOM ? 'active' : ''}`} aria-pressed={species === CUSTOM} onClick={() => pickSpecies(CUSTOM)}>
            {t('create.custom')}
          </button>
        </div>
        {sp && (
          <>
            <dl className="pick-info">
              <dt>{t('create.size')}</dt>
              <dd>{sizes.join(' / ')}</dd>
              <dt>{t('vitals.speed')}</dt>
              <dd>{t('create.feet', { n: sp.speed })}</dd>
              <dt>{t('create.traits')}</dt>
              <dd>{sp.traits.map((x) => x.name).join(', ')}</dd>
            </dl>
            {sizes.length > 1 && (
              <div className="sub-choice">
                <span className="sub-label">{t('create.size')}</span>
                <div className="segmented">
                  {sizes.map((z) => (
                    <button key={z} className={size === z ? 'active' : ''} aria-pressed={size === z} onClick={() => setSize(z)}>
                      {z}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {choice && (
              <div className="sub-choice">
                <span className="sub-label">
                  {choice.trait} <small className="muted">({t(`create.kind.${choice.kind}`)})</small>
                </span>
                <div className="chip-row">
                  {choice.options.map((o) => (
                    <button key={o.name} className={`toggle ${speciesOption === o.name ? 'on' : ''}`} aria-pressed={speciesOption === o.name} onClick={() => setSpeciesOption(o.name)}>
                      {o.name}
                    </button>
                  ))}
                </div>
                {speciesOption && <RichText className="muted option-text" text={choice.options.find((o) => o.name === speciesOption)?.text ?? ''} />}
              </div>
            )}
          </>
        )}
        {species === CUSTOM && (
          <div className="custom-box">
            <p className="hint">{t('create.customHint')}</p>
            <TextField label={t('create.customSpeciesName')} value={customSpecies.name} placeholder="Warforged" onChange={(v) => setCustomSpecies({ ...customSpecies, name: v })} />
            <div className="grid-2">
              <label className="field">
                <span>{t('create.size')}</span>
                <select value={customSpecies.size} onChange={(e) => setCustomSpecies({ ...customSpecies, size: e.target.value })}>
                  {['Small', 'Medium'].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
              <NumberField label={t('vitals.speed')} value={customSpecies.speed} min={0} step={5} onChange={(n) => setCustomSpecies({ ...customSpecies, speed: n })} />
            </div>
            <TextArea label={t('create.customText')} value={customSpecies.text} rows={3} onChange={(v) => setCustomSpecies({ ...customSpecies, text: v })} />
          </div>
        )}
      </section>

      {/* 5. ability scores */}
      <section className="panel">
        <h3>
          <span className="step">4</span> {t('create.scores')}
        </h3>
        <div className="segmented" role="tablist" aria-label={t('create.scores')}>
          {(['standard', 'pointBuy', 'manual'] as ScoreMethod[]).map((m) => (
            <button key={m} role="tab" aria-selected={method === m} className={method === m ? 'active' : ''} onClick={() => changeMethod(m)}>
              {t(`create.method.${m}`)}
            </button>
          ))}
        </div>
        <p className="hint method-hint">
          {method === 'standard' && t('create.standardHint')}
          {method === 'pointBuy' && t('create.pointBuyHint')}
          {method === 'manual' && t('create.manualHint')}
        </p>
        {method === 'standard' && cls && (
          <button className="btn btn-small" onClick={() => {
              setScores(suggestedArray(cls.id)!)
              setScoresTouched(false)
            }}>
            {t('create.useSuggestion', { cls: cls.name })}
          </button>
        )}
        {method === 'pointBuy' && (
          <p className={Number.isFinite(spent) && spent <= POINT_BUY_TOTAL ? 'points' : 'points warn'}>
            {t('create.pointsLeft', { n: Number.isFinite(spent) ? POINT_BUY_TOTAL - spent : '?', total: POINT_BUY_TOTAL })}
          </p>
        )}

        <div className="ability-rows" role="table">
          <div className="ability-row head" role="row">
            <span role="columnheader" />
            <span role="columnheader">{t('create.base')}</span>
            <span role="columnheader">{t('create.bonus')}</span>
            <span role="columnheader">{t('create.final')}</span>
          </div>
          {ABILITIES.map((a) => {
            const primary = cls?.primaryAbility.includes(a)
            return (
              <div className="ability-row" role="row" key={a}>
                <span className="ab-name" role="rowheader" title={t(`ability.long.${a}`)}>
                  {t(`ability.${a}`)}
                  {primary && <span className="tag">{t('create.primaryTag')}</span>}
                </span>
                <span role="cell">
                  {method === 'standard' && (
                    <select className="small-input" value={scores[a]} aria-label={t(`ability.long.${a}`)} onChange={(e) => setArrayValue(a, Number(e.target.value))}>
                      {STANDARD_ARRAY.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}
                  {method === 'pointBuy' && (
                    <span className="stepper">
                      <button className="mini-btn" aria-label={t('create.lower', { ab: t(`ability.long.${a}`) })} disabled={scores[a] <= 8} onClick={() => setScore(a, scores[a] - 1)}>
                        −
                      </button>
                      <b>{scores[a]}</b>
                      <button
                        className="mini-btn"
                        aria-label={t('create.raise', { ab: t(`ability.long.${a}`) })}
                        disabled={scores[a] >= 15 || spent - POINT_COST[scores[a]] + POINT_COST[scores[a] + 1] > POINT_BUY_TOTAL}
                        onClick={() => setScore(a, scores[a] + 1)}
                      >
                        +
                      </button>
                    </span>
                  )}
                  {method === 'manual' && (
                    <input
                      className="small-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      value={Number.isFinite(scores[a]) ? scores[a] : ''}
                      aria-label={t(`ability.long.${a}`)}
                      onChange={(e) => setScore(a, e.target.value === '' ? NaN : Number(e.target.value))}
                    />
                  )}
                </span>
                <span role="cell" className="ab-bonus">
                  {bonus[a] ? `+${bonus[a]}` : ''}
                </span>
                <span role="cell" className="ab-final">
                  <b>{Number.isFinite(final[a]) ? final[a] : '?'}</b> <small className="muted">({fmtMod(abilityMod(final[a]))})</small>
                </span>
              </div>
            )
          })}
        </div>

        {/* background increase */}
        <div className="bonus-box">
          <h4>{t('create.bonusTitle')}</h4>
          <p className="hint">{t('create.bonusRule')}</p>
          {!background ? (
            <p className="muted">{t('create.bonusNeedsBackground')}</p>
          ) : (
            <>
              <div className="segmented">
                <button className={bonusMode === 'twoOne' ? 'active' : ''} aria-pressed={bonusMode === 'twoOne'} onClick={() => setBonusMode('twoOne')}>
                  +2 / +1
                </button>
                <button className={bonusMode === 'three' ? 'active' : ''} aria-pressed={bonusMode === 'three'} onClick={() => setBonusMode('three')}>
                  +1 / +1 / +1
                </button>
              </div>
              {bonusMode === 'twoOne' ? (
                <>
                  <div className="sub-choice">
                    <span className="sub-label">+2</span>
                    <div className="chip-row">
                      {allowed.map((a) => (
                        <button key={a} className={`toggle ${plus2 === a ? 'on' : ''}`} aria-pressed={plus2 === a} onClick={() => {
                            setPlus2(a)
                            if (plus1 === a) setPlus1('')
                          }}>
                          {t(`ability.long.${a}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sub-choice">
                    <span className="sub-label">+1</span>
                    <div className="chip-row">
                      {allowed.map((a) => (
                        <button key={a} className={`toggle ${plus1 === a ? 'on' : ''}`} aria-pressed={plus1 === a} disabled={plus2 === a} onClick={() => setPlus1(a)}>
                          {t(`ability.long.${a}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : background === CUSTOM ? (
                <div className="sub-choice">
                  <span className="sub-label">{t('create.pickThree')}</span>
                  <div className="chip-row">
                    {allowed.map((a) => {
                      const on = threeSet.includes(a)
                      return (
                        <button
                          key={a}
                          className={`toggle ${on ? 'on' : ''}`}
                          aria-pressed={on}
                          disabled={!on && threeSet.length >= 3}
                          onClick={() => setThreeSet(on ? threeSet.filter((x) => x !== a) : [...threeSet, a])}
                        >
                          {t(`ability.long.${a}`)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p>{t('create.threeAll', { list: abilityList(allowed) })}</p>
              )}
            </>
          )}
        </div>
      </section>

      {/* 6. summary */}
      <section className="panel create-summary">
        <h3>
          <span className="step">5</span> {t('create.summary')}
        </h3>
        {built ? (
          <>
            <p>
              <b>{built.character.name}</b> · {built.character.species.name} · {built.character.classes[0].name} 1 · {built.character.background}
            </p>
            <p>
              {t('create.hpLine', { n: built.character.combat.hp.max, die: hitDie ?? 8, con: fmtMod(conMod) })} · {t('vitals.ac')} {armorClass(built.character).total} · {t('vitals.speed')}{' '}
              {t('create.feet', { n: built.character.combat.speed })}
            </p>
            <p className="hint">{t('create.featuresAdded', { n: built.character.features.length })}</p>
            <h4>{t('create.todoTitle')}</h4>
            <ul className="todo-list">
              {built.todo.map((x, i) => (
                <li key={i}>{t(x.key, x.params)}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className={tried ? 'warn' : 'muted'}>{t('create.missing')}</p>
            <ul className="todo-list">
              {errors.map((e) => (
                <li key={e} className={tried ? 'warn' : ''}>
                  {t(`create.err.${e}`)}
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="warn">{error}</p>}
      </section>

      <div className="create-bar">
        <button className="btn" onClick={props.onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary btn-big" onClick={create} aria-disabled={!built}>
          {t('create.create')}
        </button>
      </div>
    </div>
  )
}
