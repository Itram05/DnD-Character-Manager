import { useState, type ReactNode } from 'react'
import { SRD_CONDITIONS } from '../data/srd'
import { t } from '../i18n'
import { hitDiceAvailable, longRest, shortRest, spendHitDie } from '../model/rest'
import {
  abilityMod,
  applyDamage,
  applyHealing,
  applyTempHp,
  armorClass,
  effectiveHpCurrent,
  effectiveHpMax,
  effectiveSpeed,
  exhaustionEffects,
  exhaustionLines,
  exhaustionRules,
  hitDicePool,
  initiative,
  proficiencyBonus,
  spellDcView,
  totalLevel,
  type CastingPart,
} from '../model/rules'
import type { Character } from '../model/types'
import { Check, Dis, Modal, Pips, RichText, fmtMod } from './common'
import type { SheetApi } from './Sheet'
import { daysText, levelReadyShort, levelReadyText, timerLines } from './progressText'

export function classLine(c: Character) {
  return c.classes.map((k) => `${k.name} ${k.level}${k.subclass ? ` (${k.subclass})` : ''}`).join(' / ')
}

/** Name row (scrolls away), then the sticky head: the vitals and `children` (the tabs and the screen's own controls). */
export function TopBar({ api, onBack, onUndo, children }: { api: SheetApi; onBack: () => void; onUndo?: () => void; children?: ReactNode }) {
  const { c, update } = api
  const [modal, setModal] = useState<null | 'hp' | 'short' | 'long' | 'conditions' | 'ac' | 'dc'>(null)
  // the numbers that count now: 2014 Exhaustion 4+ halves the maximum
  const hp = { ...c.combat.hp, max: effectiveHpMax(c), current: effectiveHpCurrent(c) }
  const pct = Math.max(0, Math.min(100, (hp.current / Math.max(1, hp.max)) * 100))
  const ac = armorClass(c)
  const exh = exhaustionEffects(c)
  const condCount = c.conditions.length + (c.exhaustion > 0 ? 1 : 0)
  const bloodied = hp.current > 0 && hp.current <= hp.max / 2
  const ready = levelReadyText(c)
  const readyShort = levelReadyShort(c)
  const dcs = spellDcView(c)

  return (
    <header className="topbar">
      <div className="topbar-id">
        <button className="icon-btn back" onClick={onBack} aria-label={t('nav.allCharacters')}>
          ‹
        </button>
        <div className="id-text">
          <h1>{c.name}</h1>
          <div className="subtitle">
            {t('vitals.level', { n: totalLevel(c) })} · {classLine(c)}
          </div>
        </div>
        {ready && (
          <button className="level-ready" onClick={() => api.go('level')} title={t('xp.readyBadgeTitle')}>
            ⇪ <span className="level-ready-text">{ready}</span>
            <span className="level-ready-short">{readyShort}</span>
          </button>
        )}
        {onUndo && (
          <button className="icon-btn" onClick={onUndo} aria-label={t('common.undo')} title={t('common.undo')}>
            ↶
          </button>
        )}
      </div>

      <div className="sheet-head">
        <div className={dcs.length ? 'vitals has-dc' : 'vitals'}>
          <button className={`hp-widget ${hp.current === 0 ? 'down' : bloodied ? 'bloodied' : ''}`} onClick={() => setModal('hp')} aria-label={t('hp.open')}>
            <span className="hp-label">{t('hp.hp')}</span>
            <span className="hp-nums">
              <b>{hp.current}</b>/{hp.max}
              {hp.temp > 0 && <span className="temp-badge">+{hp.temp}</span>}
            </span>
            <span className="hp-bar">
              <span className="hp-fill" style={{ width: `${pct}%` }} />
            </span>
          </button>
          <button className="stat-chip ac" onClick={() => setModal('ac')} title={t('vitals.acTitle')}>
            <span className="chip-label">{t('vitals.ac')}</span>
            <b>{ac.total}</b>
          </button>
          <div className="stat-chip">
            <span className="chip-label">{t('vitals.init')}</span>
            <b>{fmtMod(initiative(c) - exh.d20Penalty)}</b>
            <Dis on={exh.checksDisadvantage} />
          </div>
          <div className={`stat-chip ${effectiveSpeed(c) < c.combat.speed ? 'reduced' : ''}`} title={effectiveSpeed(c) < c.combat.speed ? t('cond.reducedFrom', { n: c.combat.speed }) : undefined}>
            <span className="chip-label">{t('vitals.speed')}</span>
            <b>{effectiveSpeed(c)}</b>
          </div>
          <div className="stat-chip">
            <span className="chip-label">{t('vitals.pb')}</span>
            <b>{fmtMod(proficiencyBonus(totalLevel(c)))}</b>
          </div>
          {dcs.length > 0 && (
            <button
              className={`stat-chip dc ${dcs.length > 1 ? 'multi' : ''}`}
              onClick={() => setModal('dc')}
              title={dcs.map((d) => t('vitals.dcLine', { dc: d.saveDc, atk: fmtMod(d.attack), ability: t(`ability.${d.ability}`) })).join('\n')}
            >
              <span className="chip-label">
                <span className="dc-long">{t('vitals.dc')}</span>
                <span className="dc-short">{t('vitals.dcShort')}</span>
              </span>
              <b>{dcs.map((d) => d.saveDc).join('/')}</b>
            </button>
          )}
          <button
            className={`stat-chip insp ${c.heroicInspiration ? 'on' : ''}`}
            onClick={() => update((x) => ({ ...x, heroicInspiration: !x.heroicInspiration }))}
            title={t('vitals.inspirationTitle')}
            aria-pressed={c.heroicInspiration}
          >
            <span className="chip-label">{t('vitals.inspiration')}</span>
            <b>{c.heroicInspiration ? '★' : '☆'}</b>
          </button>
          <button className={`stat-chip cond ${condCount ? 'on' : ''}`} onClick={() => setModal('conditions')}>
            <span className="chip-label">{t('vitals.conditions')}</span>
            <b>{condCount || '—'}</b>
          </button>
          <div className="rest-btns">
            <button className="btn btn-rest" onClick={() => setModal('short')}>
              {t('rest.short')}
            </button>
            <button className="btn btn-rest long" onClick={() => setModal('long')}>
              {t('rest.long')}
            </button>
          </div>
        </div>
        {children}
      </div>

      {(c.conditions.length > 0 || c.exhaustion > 0) && (
        <div className="cond-strip">
          {c.exhaustion > 0 && (
            <button className="cond-chip exh" onClick={() => setModal('conditions')}>
              {t('cond.exhaustionChip', { n: c.exhaustion, rules: exh.rules, effects: exhaustionLines(c).join(' · ') })}
            </button>
          )}
          {c.conditions.map((id) => (
            <button key={id} className="cond-chip" onClick={() => setModal('conditions')}>
              {SRD_CONDITIONS.find((x) => x.id === id)?.name ?? id}
            </button>
          ))}
        </div>
      )}

      {modal === 'hp' && <HpModal api={api} onClose={() => setModal(null)} />}
      {(modal === 'short' || modal === 'long') && <RestModal api={api} kind={modal} onClose={() => setModal(null)} />}
      {modal === 'conditions' && <ConditionsModal api={api} onClose={() => setModal(null)} />}
      {modal === 'dc' && (
        <Modal title={t('vitals.dcTitle')} onClose={() => setModal(null)}>
          {dcs.map((d) => (
            <div key={d.ability} className="dc-block">
              {dcs.length > 1 && (
                <h4>
                  {t(`ability.long.${d.ability}`)} · {d.classes.join(', ')}
                </h4>
              )}
              <table className="breakdown">
                <tbody>
                  {d.dcParts.map((p, i) => (
                    <tr key={i}>
                      <td>{partLabel(p)}</td>
                      <td>{p.kind === 'base' ? p.value : fmtMod(p.value)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>{t('vitals.dcTitle')}</td>
                    <td>{d.saveDc}</td>
                  </tr>
                </tbody>
              </table>
              <table className="breakdown">
                <tbody>
                  {d.attackParts.map((p, i) => (
                    <tr key={i}>
                      <td>{partLabel(p)}</td>
                      <td>{fmtMod(p.value)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>{t('vitals.spellAttack')}</td>
                    <td>{fmtMod(d.attack)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          <p className="hint">{t('vitals.dcHint')}</p>
        </Modal>
      )}
      {modal === 'ac' && (
        <Modal title={t('vitals.acTitle')} onClose={() => setModal(null)}>
          <table className="breakdown">
            <tbody>
              {ac.parts.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td>{p.value}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{t('common.total')}</td>
                <td>{ac.total}</td>
              </tr>
            </tbody>
          </table>
          {ac.warnings.map((w, i) => (
            <p className="warn" key={i}>
              {w}
            </p>
          ))}
          <p className="hint">{t('vitals.acHint')}</p>
        </Modal>
      )}
    </header>
  )
}

/** A line of the spell DC / attack breakdown: "Base", "CHA", "Prof", or the item's name. */
function partLabel(p: CastingPart): string {
  if (p.kind === 'base') return t('vitals.dcBase')
  if (p.kind === 'ability') return t(`ability.long.${p.label}`)
  if (p.kind === 'pb') return t('vitals.pbLong')
  return p.label
}

// ---------------- HP ----------------

function HpModal({ api, onClose }: { api: SheetApi; onClose: () => void }) {
  const { c, update, toast } = api
  const [amount, setAmount] = useState('')
  const [crit, setCrit] = useState(false)
  const n = Math.max(0, Math.floor(Number(amount) || 0))
  // the numbers that count now: 2014 Exhaustion 4+ halves the maximum
  const hp = { ...c.combat.hp, max: effectiveHpMax(c), current: effectiveHpCurrent(c) }
  const ds = c.combat.deathSaves

  const damage = () => {
    if (!n) return
    const r = applyDamage(c, n, crit)
    let next = r.character
    const conc = c.spellcasting.concentration
    if (conc && r.events.includes('droppedToZero')) {
      // 0 HP = Unconscious = Incapacitated, which ends Concentration
      next = { ...next, spellcasting: { ...next.spellcasting, concentration: '' } }
      toast({ title: t('hp.concLost', { name: conc }), tone: 'bad' })
    } else if (conc) {
      toast({ title: t('hp.concCheck', { name: conc, dc: Math.min(30, Math.max(10, Math.floor(n / 2))) }) })
    }
    update(() => next)
    for (const e of r.events) toast({ title: t(`hp.event.${e}`), tone: 'bad' })
    setAmount('')
    setCrit(false)
  }
  const heal = () => {
    if (!n) return
    update((x) => applyHealing(x, n))
    setAmount('')
  }
  const temp = () => {
    if (!n) return
    if (n <= hp.temp) toast({ title: t('hp.tempNoStack', { old: hp.temp }) })
    update((x) => applyTempHp(x, n))
    setAmount('')
  }
  const setDs = (k: 'successes' | 'failures', v: number) => update((x) => ({ ...x, combat: { ...x.combat, deathSaves: { ...x.combat.deathSaves, [k]: Math.max(0, Math.min(3, v)) } } }))

  return (
    <Modal title={t('hp.title')} onClose={onClose} className="hp-modal">
      <div className="hp-big">
        <span className="cur">{hp.current}</span>
        <span className="max">/ {hp.max}</span>
        {hp.temp > 0 && <span className="temp-badge">{t('hp.tempShort', { n: hp.temp })}</span>}
      </div>
      <div className="hp-entry">
        <input
          className="big-input"
          type="number"
          inputMode="numeric"
          autoFocus
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && damage()}
          aria-label={t('hp.amount')}
        />
        <div className="hp-actions">
          <button className="btn btn-danger" onClick={damage} disabled={!n}>
            {t('hp.damage')}
          </button>
          <button className="btn btn-good" onClick={heal} disabled={!n}>
            {t('hp.heal')}
          </button>
          <button className="btn" onClick={temp} disabled={!n}>
            {t('hp.temp')}
          </button>
        </div>
        {hp.current === 0 && <Check label={t('hp.critical')} checked={crit} onChange={setCrit} />}
      </div>
      {hp.temp > 0 && (
        <button className="link-btn" onClick={() => update((x) => ({ ...x, combat: { ...x.combat, hp: { ...x.combat.hp, temp: 0 } } }))}>
          {t('hp.clearTemp')}
        </button>
      )}

      {(hp.current === 0 || ds.successes > 0 || ds.failures > 0) && (
        <section className="death-saves">
          <h3>{t('hp.deathSaves')}</h3>
          <div className="ds-row">
            <span>{t('hp.successes')}</span>
            <Pips max={3} left={ds.successes} variant="death-ok" onSpend={() => setDs('successes', ds.successes - 1)} onRestore={() => setDs('successes', ds.successes + 1)} />
          </div>
          <div className="ds-row">
            <span>{t('hp.failures')}</span>
            <Pips max={3} left={ds.failures} variant="death-fail" onSpend={() => setDs('failures', ds.failures - 1)} onRestore={() => setDs('failures', ds.failures + 1)} />
          </div>
          <p className="hint">{t('hp.deathSavesHint')}</p>
          {ds.successes >= 3 && <p className="good">{t('hp.stable')}</p>}
          {ds.failures >= 3 && <p className="warn">{t('hp.dead')}</p>}
        </section>
      )}
      <HitDiceBlock api={api} />
    </Modal>
  )
}

function HitDiceBlock({ api }: { api: SheetApi }) {
  const { c } = api
  const pool = hitDicePool(c)
  const avail = hitDiceAvailable(c)
  return (
    <section className="hit-dice">
      <h3>{t('hp.hitDice')}</h3>
      {Object.entries(pool).map(([d, max]) => (
        <div key={d} className="hd-row">
          <span className="hd-die">{d}</span>
          <Pips max={max} left={avail[d] ?? 0} size="sm" />
          <span className="muted">
            {avail[d] ?? 0}/{max}
          </span>
        </div>
      ))}
    </section>
  )
}

// ---------------- rests ----------------

function RestModal({ api, kind, onClose }: { api: SheetApi; kind: 'short' | 'long'; onClose: () => void }) {
  const { c, update, toast } = api
  const [dawn, setDawn] = useState(kind === 'long')
  const [rolls, setRolls] = useState<Record<string, string>>({})
  const [healedLog, setHealedLog] = useState<string[]>([])
  const avail = hitDiceAvailable(c)
  const con = abilityMod(c.abilities.con)

  const spend = (die: string, roll: number) => {
    const r = spendHitDie(c, die, roll)
    if (!r) return
    update(() => r.character)
    setHealedLog((l) => [...l, t('rest.hitDieLog', { die, roll, con: fmtMod(con), healed: r.healed })])
    setRolls((x) => ({ ...x, [die]: '' }))
  }

  const finish = () => {
    const r = kind === 'short' ? shortRest(c, { dawn }) : longRest(c, { dawn })
    update(() => r.character)
    const days = r.timers.length ? [t('rest.daysMoved', { list: timerLines(r.timers).join(' · ') })] : []
    document.body.classList.add('untap-step')
    setTimeout(() => document.body.classList.remove('untap-step'), 700)
    toast({
      title: kind === 'short' ? t('rest.shortDone') : t('rest.longDone'),
      lines: [...(r.restored.length ? [t('rest.untapped', { list: r.restored.join(', ') })] : [t('rest.nothing')]), ...days, ...r.reminders, t('rest.undoHint')],
      tone: r.timers.some((x) => x.ended) ? 'bad' : 'good',
    })
    onClose()
  }

  return (
    <Modal
      title={kind === 'short' ? t('rest.shortTitle') : t('rest.longTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={finish}>
            {kind === 'short' ? t('rest.finishShort') : t('rest.finishLong')}
          </button>
        </>
      }
    >
      {c.combat.hp.current < 1 && <p className="warn">{t('rest.needHp')}</p>}
      {kind === 'short' ? (
        <>
          <p className="hint">{t('rest.shortExplain')}</p>
          <p>
            {t('hp.hp')}: <b>{effectiveHpCurrent(c)}</b>/{effectiveHpMax(c)}
          </p>
          {Object.entries(avail).map(([die, left]) => (
            <div className="hd-spend" key={die}>
              <span className="hd-die">{die}</span>
              <span className="muted">{t('rest.left', { n: left })}</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder={t('rest.yourRoll')}
                value={rolls[die] ?? ''}
                onChange={(e) => setRolls((x) => ({ ...x, [die]: e.target.value }))}
                disabled={left === 0}
                aria-label={t('rest.yourRoll')}
              />
              <button className="btn" disabled={left === 0 || !Number(rolls[die])} onClick={() => spend(die, Number(rolls[die]))}>
                {t('rest.spend')}
              </button>
              <button className="btn" disabled={left === 0} onClick={() => spend(die, 1 + Math.floor(Math.random() * Number(die.slice(1))))}>
                {t('rest.rollForMe')}
              </button>
            </div>
          ))}
          {healedLog.length > 0 && (
            <ul className="log">
              {healedLog.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="hint">{t('rest.longExplain')}</p>
          <ul className="rest-list">
            <li>{t('rest.long.hp')}</li>
            <li>{t('rest.long.hd')}</li>
            <li>{t('rest.long.slots')}</li>
            <li>{t('rest.long.features')}</li>
            <li>{t('rest.long.exhaustion')}</li>
            <li>{t('rest.long.temp')}</li>
            {c.timers.some((x) => x.days > 0) && (
              <li>
                {t('rest.long.days', {
                  list: c.timers
                    .filter((x) => x.days > 0)
                    .map((x) => `${x.name} ${daysText(x.days)} → ${x.days - 1 === 0 ? t('days.ended') : daysText(x.days - 1)}`)
                    .join(', '),
                })}
              </li>
            )}
          </ul>
        </>
      )}
      <Check label={t('rest.dawn')} checked={dawn} onChange={setDawn} />
    </Modal>
  )
}

// ---------------- conditions ----------------

function ConditionsModal({ api, onClose }: { api: SheetApi; onClose: () => void }) {
  const { c, update } = api
  const [open, setOpen] = useState<string | null>(null)
  const exh = SRD_CONDITIONS.find((x) => x.id === 'exhaustion')
  const toggle = (id: string) =>
    update((x) => ({ ...x, conditions: x.conditions.includes(id) ? x.conditions.filter((y) => y !== id) : [...x.conditions, id] }))
  return (
    <Modal title={t('cond.title')} onClose={onClose}>
      <section className="exhaustion">
        <h3>{t('cond.exhaustion')}</h3>
        <div className="stepper">
          <button className="btn" onClick={() => update((x) => ({ ...x, exhaustion: Math.max(0, x.exhaustion - 1) }))} disabled={c.exhaustion === 0}>
            −
          </button>
          <b className="stepper-val">{c.exhaustion}</b>
          <button className="btn" onClick={() => update((x) => ({ ...x, exhaustion: Math.min(6, x.exhaustion + 1) }))} disabled={c.exhaustion === 6}>
            +
          </button>
          <label className="exh-rules">
            <span className="muted">{t('cond.exhaustionRules')}</span>
            <select
              value={exhaustionRules(c)}
              onChange={(e) =>
                update((x) => {
                  // only the 2014 choice is stored; absent = 2024
                  const { exhaustionRules: _old, ...rest } = x
                  void _old
                  return e.target.value === '2014' ? { ...rest, exhaustionRules: '2014' as const } : rest
                })
              }
            >
              <option value="2024">2024</option>
              <option value="2014">2014</option>
            </select>
          </label>
        </div>
        {c.exhaustion > 0 ? (
          <ul className="exh-effects">
            {exhaustionLines(c).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('cond.none')}</p>
        )}
        {c.exhaustion >= 6 && <p className="warn">{t('cond.exhaustionDeath')}</p>}
        <details>
          <summary>{t('cond.rulesText')}</summary>
          <RichText text={exh?.text ?? ''} />
        </details>
      </section>
      <ul className="cond-list">
        {SRD_CONDITIONS.filter((x) => x.id !== 'exhaustion').map((cd) => (
          <li key={cd.id} className={c.conditions.includes(cd.id) ? 'on' : ''}>
            <div className="cond-row">
              <Check label={cd.name} checked={c.conditions.includes(cd.id)} onChange={() => toggle(cd.id)} />
              <button className="link-btn" onClick={() => setOpen(open === cd.id ? null : cd.id)} aria-expanded={open === cd.id}>
                {open === cd.id ? t('common.hide') : t('common.whatIsIt')}
              </button>
            </div>
            {open === cd.id && <RichText text={cd.text} className="cond-text" />}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
