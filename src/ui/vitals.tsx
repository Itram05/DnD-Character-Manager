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
  effectiveSpeed,
  exhaustionD20Penalty,
  hitDicePool,
  initiative,
  proficiencyBonus,
  totalLevel,
} from '../model/rules'
import type { Character } from '../model/types'
import { Check, Modal, Pips, RichText, fmtMod } from './common'
import type { SheetApi } from './Sheet'

export function classLine(c: Character) {
  return c.classes.map((k) => `${k.name} ${k.level}${k.subclass ? ` (${k.subclass})` : ''}`).join(' / ')
}

/** Name row (scrolls away), then the sticky head: the vitals and `children` (the tabs and the screen's own controls). */
export function TopBar({ api, onBack, onUndo, children }: { api: SheetApi; onBack: () => void; onUndo?: () => void; children?: ReactNode }) {
  const { c, update } = api
  const [modal, setModal] = useState<null | 'hp' | 'short' | 'long' | 'conditions' | 'ac'>(null)
  const hp = c.combat.hp
  const pct = Math.max(0, Math.min(100, (hp.current / Math.max(1, hp.max)) * 100))
  const ac = armorClass(c)
  const condCount = c.conditions.length + (c.exhaustion > 0 ? 1 : 0)
  const bloodied = hp.current > 0 && hp.current <= hp.max / 2

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
        {onUndo && (
          <button className="icon-btn" onClick={onUndo} aria-label={t('common.undo')} title={t('common.undo')}>
            ↶
          </button>
        )}
      </div>

      <div className="sheet-head">
        <div className="vitals">
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
            <b>{fmtMod(initiative(c))}</b>
          </div>
          <div className="stat-chip">
            <span className="chip-label">{t('vitals.speed')}</span>
            <b>{effectiveSpeed(c)}</b>
          </div>
          <div className="stat-chip">
            <span className="chip-label">{t('vitals.pb')}</span>
            <b>{fmtMod(proficiencyBonus(totalLevel(c)))}</b>
          </div>
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
              {t('cond.exhaustionChip', { n: c.exhaustion, p: exhaustionD20Penalty(c) })}
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

// ---------------- HP ----------------

function HpModal({ api, onClose }: { api: SheetApi; onClose: () => void }) {
  const { c, update, toast } = api
  const [amount, setAmount] = useState('')
  const [crit, setCrit] = useState(false)
  const n = Math.max(0, Math.floor(Number(amount) || 0))
  const hp = c.combat.hp
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
    document.body.classList.add('untap-step')
    setTimeout(() => document.body.classList.remove('untap-step'), 700)
    toast({
      title: kind === 'short' ? t('rest.shortDone') : t('rest.longDone'),
      lines: [...(r.restored.length ? [t('rest.untapped', { list: r.restored.join(', ') })] : [t('rest.nothing')]), ...r.reminders],
      tone: 'good',
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
            {t('hp.hp')}: <b>{c.combat.hp.current}</b>/{c.combat.hp.max}
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
          <span className="muted">{c.exhaustion > 0 ? t('cond.exhaustionEffect', { p: 2 * c.exhaustion, s: 5 * c.exhaustion }) : t('cond.none')}</span>
        </div>
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
