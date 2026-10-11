// Creatures on screen (model: creatures.ts).
//
// - CreaturesSection: the section of the Play screen, one row per creature in play; folded on a phone into
//   one line with a small Hit Point bar per creature.
// - CreaturePanel: the window of one creature in play: Hit Points with a number and Damage / Heal / Temp,
//   conditions, its own name, maximum and note, and the stat block with that creature's uses.
// - CreatureLibrary: every stat block, with the ones in play: put in play, edit, copy, reorder. It is the
//   Creatures tab (CreaturesView) and, opened from Play, the same list in a window.
//
// Which of these exist for a hero is the hero's own choice (preferences.creatures.where). Every change goes
// through `update`, so the sheet's Undo takes it back.
import { useState, type ReactNode } from 'react'
import { SRD_CONDITIONS } from '../data/srd'
import { t } from '../i18n'
import {
  actionUses,
  addToPlay,
  blankCreature,
  creatureList,
  creatureNumber,
  creaturePrefs,
  creaturesInPlay,
  creaturesShownInPlay,
  damageCreature,
  duplicateCreature,
  findInPlay,
  firstAttack,
  healCreature,
  instanceName,
  isPinned,
  mammothExample,
  moveCreature,
  pinAll,
  removeFromPlay,
  saveCreature,
  setCreatureHp,
  setCreatureHpMax,
  setCreatureLabel,
  setCreatureNote,
  setPinned,
  spendCreatureAction,
  tempHpCreature,
  toggleCreatureCondition,
} from '../model/creatures'
import { loadCreaturesOpen, saveCreaturesOpen } from '../model/storage'
import type { Character, Creature, CreatureAction, CreatureInstance, CreatureRowField } from '../model/types'
import { Check, Modal, RichText, useMediaQuery } from './common'
import { CreatureEditor } from './CreatureEditor'
import { PREFS_PANEL_ID } from './PrefsPanel'
import type { SheetApi } from './Sheet'
import { StatBlock, actionLine, rollToast } from './StatBlock'

export const CREATURE_GLYPH = '♞'

/** The name of a condition: the SRD's for its ids, the player's own word as written. */
export const conditionName = (id: string) => SRD_CONDITIONS.find((x) => x.id === id)?.name ?? id

/** How hurt a creature is, for the colour of its bar: "low" at a quarter or less, "mid" at half or less ("Bloodied"). */
export function hpTone(hp: CreatureInstance['hp']): 'down' | 'low' | 'mid' | 'ok' {
  if (hp.current <= 0) return 'down'
  if (hp.current * 4 <= hp.max) return 'low'
  if (hp.current * 2 <= hp.max) return 'mid'
  return 'ok'
}
const hpPct = (hp: CreatureInstance['hp']) => Math.max(0, Math.min(100, (hp.current / Math.max(1, hp.max)) * 100))

// ---------------- the windows: one at a time, each knows where to go back to ----------------

export type CreatureWin =
  | null
  | { kind: 'panel'; id: string; back?: CreatureWin }
  | { kind: 'edit'; creature: Creature; back?: CreatureWin; /** A new stat block made from Play: one of it is put in play once saved. */ thenPlay?: boolean }
  | { kind: 'library' }

export function CreatureWindows({ api, win, setWin }: { api: SheetApi; win: CreatureWin; setWin: (w: CreatureWin) => void }) {
  if (!win) return null
  if (win.kind === 'edit')
    return (
      <CreatureEditor
        api={api}
        initial={win.creature}
        onClose={() => setWin(win.back ?? null)}
        onSaved={(id) => {
          if (!win.thenPlay) return
          api.update((c) => addToPlay(c, id))
          api.toast({ title: t('creature.putInPlayDone', { name: win.creature.name || t('creature.title') }), tone: 'good' })
        }}
      />
    )
  if (win.kind === 'panel') {
    // removed from play (here, by Undo, in another window): back to where the panel was opened from
    if (!findInPlay(api.c, win.id)) return win.back ? <CreatureWindows api={api} win={win.back} setWin={setWin} /> : null
    return <CreaturePanel api={api} instanceId={win.id} onClose={() => setWin(win.back ?? null)} onEdit={(creature) => setWin({ kind: 'edit', creature, back: win })} />
  }
  const tab = creaturePrefs(api.c).where !== 'play'
  return (
    <Modal
      title={t('creature.libraryTitle')}
      onClose={() => setWin(null)}
      wide
      className="creature-library-modal"
      footer={
        <>
          {tab && (
            <button
              className="btn left"
              onClick={() => {
                setWin(null)
                api.go('creatures')
              }}
            >
              {t('section.openTab', { tab: t('tab.creatures') })}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setWin(null)}>
            {t('section.done')}
          </button>
        </>
      }
    >
      <CreatureLibrary api={api} open={(w) => setWin(w && w.kind !== 'library' ? { ...w, back: win } : w)} fromPlay />
    </Modal>
  )
}

// ---------------- one creature in play: its row ----------------

function HpBar({ hp }: { hp: CreatureInstance['hp'] }) {
  return (
    <span className={`cr-bar cr-${hpTone(hp)}`} aria-hidden="true">
      <span style={{ width: `${hpPct(hp)}%` }} />
    </span>
  )
}

/** One creature in play as a row: its name and Hit Points always, the rest as the hero's preference says. */
export function CreatureRow({ c, creature, instance, onOpen, fields, after }: { c: Character; creature: Creature; instance: CreatureInstance; onOpen: () => void; fields: readonly CreatureRowField[]; /** Extra controls at the end of the row (the pin, on the Creatures tab). */ after?: ReactNode }) {
  const has = (f: CreatureRowField) => fields.includes(f)
  const ac = creatureNumber(c, creature.ac)
  const atk = has('attack') ? firstAttack(creature) : undefined
  const limited = has('uses') ? creature.actions.filter((a) => a.uses).map((a) => ({ a, u: actionUses(c, a, instance)! })).filter((x) => x.u.max > 0) : []
  const stats = [has('ac') ? `${t('vitals.ac')} ${Number.isNaN(ac) ? '?' : ac}` : '', has('speed') && creature.speed ? `${t('vitals.speed')} ${creature.speed}` : '', atk ? `${atk.name} ${actionLine(c, atk).join(', ')}` : ''].filter(Boolean)
  const name = instanceName(creature, instance)
  return (
    <div className={`cr-row cr-${hpTone(instance.hp)}`}>
      <button className="cr-main" onClick={onOpen} aria-label={t('creature.open', { name, hp: instance.hp.current, max: instance.hp.max })}>
        <span className="cr-name">
          <span className="glyph" aria-hidden="true">
            {CREATURE_GLYPH}
          </span>
          {creature.name}
          {instance.label && <span className="cr-label"> · {instance.label}</span>}
        </span>
        <span className="cr-hp">
          <b>{instance.hp.current}</b> / {instance.hp.max}
          {instance.hp.temp > 0 && <span className="temp-badge">+{instance.hp.temp}</span>}
        </span>
        {has('bar') && <HpBar hp={instance.hp} />}
        {has('conditions') && (instance.conditions?.length || instance.hp.current <= 0) ? (
          <span className="cr-line cr-conds">
            {instance.hp.current <= 0 && <span className="cr-cond down">{t('creature.down')}</span>}
            {instance.conditions?.map((id) => (
              <span key={id} className="cr-cond">
                {conditionName(id)}
              </span>
            ))}
          </span>
        ) : null}
        {stats.length > 0 && <span className="cr-line">{stats.join(' · ')}</span>}
        {limited.length > 0 && (
          <span className="cr-line cr-uses">
            {limited.map(({ a, u }) => (
              <span key={a.id} className="cr-use" title={t('creature.usesOf', { name: a.name, left: u.left, max: u.max })}>
                {a.name}{' '}
                {u.max > 6 ? (
                  <b>
                    {u.left}/{u.max}
                  </b>
                ) : (
                  Array.from({ length: u.max }, (_, i) => <span key={i} className={`dot ${i < u.left ? 'full' : 'empty'}`} aria-hidden="true" />)
                )}
              </span>
            ))}
          </span>
        )}
        {has('note') && instance.note && <span className="cr-line cr-note">{instance.note}</span>}
      </button>
      {after}
    </div>
  )
}

// ---------------- conditions of one creature ----------------

function CreatureConditions({ api, instanceId, onClose }: { api: SheetApi; instanceId: string; onClose: () => void }) {
  const hit = findInPlay(api.c, instanceId)
  const [open, setOpen] = useState<string | null>(null)
  const [own, setOwn] = useState('')
  if (!hit) return null
  const on = hit.instance.conditions ?? []
  const toggle = (id: string) => api.update((c) => toggleCreatureCondition(c, instanceId, id))
  const srd = SRD_CONDITIONS.filter((x) => x.id !== 'exhaustion')
  const custom = on.filter((id) => !srd.some((x) => x.id === id))
  const addOwn = () => {
    const s = own.trim()
    if (!s) return
    const known = srd.find((x) => x.id === s.toLowerCase() || x.name.toLowerCase() === s.toLowerCase())
    if (!on.includes(known?.id ?? s)) toggle(known?.id ?? s)
    setOwn('')
  }
  return (
    <Modal title={t('creature.conditionsOf', { name: instanceName(hit.creature, hit.instance) })} onClose={onClose}>
      <ul className="cond-list">
        {custom.map((id) => (
          <li key={id} className="on">
            <div className="cond-row">
              <Check label={id} checked onChange={() => toggle(id)} />
              <span className="muted">{t('creature.ownCondition')}</span>
            </div>
          </li>
        ))}
        {srd.map((cd) => (
          <li key={cd.id} className={on.includes(cd.id) ? 'on' : ''}>
            <div className="cond-row">
              <Check label={cd.name} checked={on.includes(cd.id)} onChange={() => toggle(cd.id)} />
              <button className="link-btn" onClick={() => setOpen(open === cd.id ? null : cd.id)} aria-expanded={open === cd.id}>
                {open === cd.id ? t('common.hide') : t('common.whatIsIt')}
              </button>
            </div>
            {open === cd.id && <RichText text={cd.text} className="cond-text" />}
          </li>
        ))}
      </ul>
      <div className="cr-own-cond">
        <input type="text" value={own} placeholder={t('creature.ownConditionPlaceholder')} aria-label={t('creature.ownConditionAdd')} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addOwn()} />
        <button className="btn" onClick={addOwn} disabled={!own.trim()}>
          {t('common.add')}
        </button>
      </div>
      <p className="hint">{t('creature.ownConditionHint')}</p>
    </Modal>
  )
}

// ---------------- one creature in play: its window ----------------

/** A text that is saved when the field is left (or Enter is pressed), so typing a name is one step of Undo, not one per letter. */
function CommitText(props: { label: string; value: string; onCommit: (s: string) => void; placeholder?: string; area?: boolean }) {
  const [text, setText] = useState(props.value)
  const [seen, setSeen] = useState(props.value)
  // the value changed from outside (Undo): show it
  if (props.value !== seen) {
    setSeen(props.value)
    setText(props.value)
  }
  const commit = () => text !== props.value && props.onCommit(text)
  return (
    <label className={`field ${props.area ? 'field-area' : ''}`}>
      <span>{props.label}</span>
      {props.area ? (
        <textarea rows={2} value={text} placeholder={props.placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      ) : (
        <input type="text" value={text} placeholder={props.placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      )}
    </label>
  )
}

/** A whole number saved when the field is left. */
function CommitNumber(props: { label: string; value: number; min: number; max?: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(props.value))
  const [seen, setSeen] = useState(props.value)
  if (props.value !== seen) {
    setSeen(props.value)
    setText(String(props.value))
  }
  const commit = () => {
    const n = Math.floor(Number(text))
    if (text.trim() === '' || !Number.isFinite(n)) return setText(String(props.value))
    const v = Math.max(props.min, props.max === undefined ? n : Math.min(props.max, n))
    if (v !== props.value) props.onCommit(v)
    else setText(String(props.value))
  }
  return (
    <label className="field">
      <span>{props.label}</span>
      <input type="number" inputMode="numeric" value={text} min={props.min} max={props.max} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  )
}

export function CreaturePanel({ api, instanceId, onClose, onEdit, initiallyOpen }: { api: SheetApi; instanceId: string; onClose: () => void; onEdit: (k: Creature) => void; /** For tests: "This creature" unfolded. */ initiallyOpen?: boolean }) {
  const { c, update, toast } = api
  const [amount, setAmount] = useState('')
  const [conds, setConds] = useState(false)
  const [own, setOwn] = useState(!!initiallyOpen)
  const hit = findInPlay(c, instanceId)
  if (!hit) return null
  const { creature: k, instance: inst } = hit
  if (conds) return <CreatureConditions api={api} instanceId={instanceId} onClose={() => setConds(false)} />
  const name = instanceName(k, inst)
  const n = Math.max(0, Math.floor(Number(amount) || 0))
  const prefs = creaturePrefs(c)
  const damage = () => {
    if (!n) return
    update((x) => damageCreature(x, instanceId, n))
    if (inst.hp.current > 0 && n - Math.min(inst.hp.temp, n) >= inst.hp.current) toast({ title: t('creature.droppedToZero', { name }), tone: 'bad' })
    setAmount('')
  }
  const heal = () => {
    if (!n) return
    update((x) => healCreature(x, instanceId, n))
    setAmount('')
  }
  const temp = () => {
    if (!n) return
    if (n <= inst.hp.temp) toast({ title: t('hp.tempNoStack', { old: inst.hp.temp }) })
    update((x) => tempHpCreature(x, instanceId, n))
    setAmount('')
  }
  const another = () => {
    update((x) => addToPlay(x, k.id))
    toast({ title: t('creature.putInPlayDone', { name: k.name }), tone: 'good' })
  }
  const remove = () => {
    update((x) => removeFromPlay(x, instanceId))
    toast({ title: t('creature.removed', { name }), lines: [t('creature.removedHint')] })
    onClose()
  }
  const roll = prefs.rolls ? (a: CreatureAction) => toast(rollToast(c, name, a)) : undefined
  const sub = [k.kind, k.cr ? t('creature.crShort', { cr: k.cr }) : ''].filter(Boolean).join(' · ')
  return (
    <Modal
      title={
        <span className="zoom-title cr-title">
          {CREATURE_GLYPH} {name}
        </span>
      }
      onClose={onClose}
      wide
      className={`creature-panel cr-${hpTone(inst.hp)}`}
      footer={
        <>
          {api.undo && (
            <button className="btn left" onClick={api.undo} title={t('common.undo')}>
              ↶ {t('creature.undo')}
            </button>
          )}
          <button className="btn" onClick={() => onEdit(k)}>
            {t('creature.editBlock')}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            {t('section.done')}
          </button>
        </>
      }
    >
      {sub && <p className="muted cr-sub">{sub}</p>}
      <div className="cr-hp-area">
        <div className="hp-big">
          <span className="cur">{inst.hp.current}</span>
          <span className="max">/ {inst.hp.max}</span>
          {inst.hp.temp > 0 && <span className="temp-badge">{t('hp.tempShort', { n: inst.hp.temp })}</span>}
        </div>
        <HpBar hp={inst.hp} />
        {inst.hp.current <= 0 && <p className="warn cr-down-note">{t('creature.downNote')}</p>}
        <div className="cr-entry">
          <input className="big-input" type="number" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && damage()} aria-label={t('hp.amount')} />
          <button className="btn btn-danger" onClick={damage} disabled={!n}>
            − {t('hp.damage')}
          </button>
          <button className="btn btn-good" onClick={heal} disabled={!n}>
            + {t('hp.heal')}
          </button>
          <button className="btn" onClick={temp} disabled={!n}>
            {t('hp.temp')}
          </button>
        </div>
        {inst.hp.temp > 0 && (
          <button className="link-btn" onClick={() => update((x) => tempHpCreature(x, instanceId, 0))}>
            {t('hp.clearTemp')}
          </button>
        )}
      </div>

      <div className="cr-conds-row">
        {inst.conditions?.map((id) => (
          <button key={id} className="cond-chip" onClick={() => update((x) => toggleCreatureCondition(x, instanceId, id))} title={t('creature.conditionOff', { name: conditionName(id) })}>
            {conditionName(id)} ✕
          </button>
        ))}
        <button className="btn btn-small" onClick={() => setConds(true)}>
          {t('cond.title')}
          {inst.conditions?.length ? ` (${inst.conditions.length})` : ''}
        </button>
        <button className="btn btn-small" onClick={another}>
          + {t('creature.another')}
        </button>
        <button className="btn btn-small" onClick={remove}>
          {t('creature.remove')}
        </button>
      </div>
      {inst.note && !own && <p className="cr-note-shown">{inst.note}</p>}

      <div className={`cr-own ${own ? 'open' : ''}`}>
        <button className="link-btn" onClick={() => setOwn(!own)} aria-expanded={own}>
          {own ? '▾' : '▸'} {t('creature.thisOne')}
        </button>
        {own && (
          <div className="cr-own-body">
            <div className="grid-3">
              <CommitText label={t('creature.label')} value={inst.label ?? ''} placeholder={t('creature.labelPlaceholder')} onCommit={(s) => update((x) => setCreatureLabel(x, instanceId, s))} />
              <CommitNumber label={t('creature.hpNow')} value={inst.hp.current} min={0} max={inst.hp.max} onCommit={(v) => update((x) => setCreatureHp(x, instanceId, v))} />
              <CommitNumber label={t('creature.hpMax')} value={inst.hp.max} min={1} onCommit={(v) => update((x) => setCreatureHpMax(x, instanceId, v))} />
            </div>
            <CommitText area label={t('creature.note')} value={inst.note ?? ''} placeholder={t('creature.notePlaceholder')} onCommit={(s) => update((x) => setCreatureNote(x, instanceId, s))} />
            {prefs.where !== 'tab' && <Check label={t('creature.pinned')} checked={isPinned(c, instanceId)} onChange={(on) => update((x) => setPinned(x, instanceId, on))} />}
            <p className="hint">{t('creature.thisOneHint')}</p>
          </div>
        )}
      </div>

      <StatBlock c={c} creature={k} instance={inst} onSpend={(actionId, d) => update((x) => spendCreatureAction(x, instanceId, actionId, d))} onRoll={roll} />
    </Modal>
  )
}

// ---------------- every stat block, with the ones in play ----------------

function BlockCard({ api, creature: k, index, count, open }: { api: SheetApi; creature: Creature; index: number; count: number; open: (w: CreatureWin) => void }) {
  const { c, update, toast } = api
  const prefs = creaturePrefs(c)
  const inPlay = k.inPlay ?? []
  const [shown, setShown] = useState(false)
  const [n, setN] = useState(1)
  const put = () => {
    update((x) => addToPlay(x, k.id, n))
    toast({ title: n > 1 ? t('creature.putInPlayDoneN', { n, name: k.name }) : t('creature.putInPlayDone', { name: k.name }), tone: 'good' })
    setN(1)
  }
  const sub = [k.kind, k.cr ? t('creature.crShort', { cr: k.cr }) : ''].filter(Boolean).join(' · ')
  return (
    <section className="panel creature-block" id={`creature-${k.id}`}>
      <div className="cb-head">
        <h3>
          <span className="glyph" aria-hidden="true">
            {CREATURE_GLYPH}
          </span>{' '}
          {k.name} {inPlay.length > 0 && <span className="muted">({t('creature.inPlayN', { n: inPlay.length })})</span>}
        </h3>
        <span className="cb-tools">
          <button className="btn btn-small" onClick={() => open({ kind: 'edit', creature: k })}>
            {t('common.edit')}
          </button>
          <button className="btn btn-small" onClick={() => update((x) => duplicateCreature(x, k.id, t('creature.copyName', { name: k.name })))} title={t('creature.copyHint')}>
            {t('creature.copy')}
          </button>
          <button className="mini-btn" disabled={index === 0} onClick={() => update((x) => moveCreature(x, k.id, -1))} aria-label={t('section.moveUp', { name: k.name })}>
            ↑
          </button>
          <button className="mini-btn" disabled={index === count - 1} onClick={() => update((x) => moveCreature(x, k.id, 1))} aria-label={t('section.moveDown', { name: k.name })}>
            ↓
          </button>
        </span>
      </div>
      {sub && <p className="muted cr-sub">{sub}</p>}
      {inPlay.length > 0 && (
        <div className="cr-rows">
          {inPlay.map((inst) => (
            <CreatureRow
              key={inst.id}
              c={c}
              creature={k}
              instance={inst}
              fields={prefs.row}
              onOpen={() => open({ kind: 'panel', id: inst.id })}
              after={
                prefs.where !== 'tab' ? (
                  <button
                    className={`mini-btn cr-pin ${isPinned(c, inst.id) ? 'on' : ''}`}
                    onClick={() => update((x) => setPinned(x, inst.id, !isPinned(x, inst.id)))}
                    aria-pressed={isPinned(c, inst.id)}
                    aria-label={t(isPinned(c, inst.id) ? 'creature.unpin' : 'creature.pin', { name: instanceName(k, inst) })}
                    title={t(isPinned(c, inst.id) ? 'creature.unpin' : 'creature.pin', { name: instanceName(k, inst) })}
                  >
                    📌
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
      <div className="cb-put">
        <label className="cb-count">
          <span className="muted">{t('creature.howMany')}</span>
          <input type="number" inputMode="numeric" min={1} max={50} value={n} onChange={(e) => setN(Math.max(1, Math.min(50, Math.floor(Number(e.target.value)) || 1)))} aria-label={t('creature.howMany')} />
        </label>
        <button className="btn btn-primary" onClick={put}>
          + {t('creature.putInPlay')}
        </button>
        <button className="link-btn cb-toggle" onClick={() => setShown(!shown)} aria-expanded={shown}>
          {shown ? '▾' : '▸'} {t('creature.statBlock')}
        </button>
      </div>
      {shown && <StatBlock c={c} creature={k} onRoll={prefs.rolls ? (a) => toast(rollToast(c, k.name, a)) : undefined} />}
    </section>
  )
}

/** Every stat block of the hero. `open` asks the caller for a window (a creature's panel, the editor). */
export function CreatureLibrary({ api, open, fromPlay }: { api: SheetApi; open: (w: CreatureWin) => void; /** Shown in a window opened from Play: a new stat block is put in play once saved. */ fromPlay?: boolean }) {
  const { c, update, toast } = api
  const list = creatureList(c)
  const hidden = creaturesInPlay(c).length - creaturesShownInPlay(c).length
  const prefs = creaturePrefs(c)
  const addMammoth = () => {
    const k = mammothExample()
    update((x) => saveCreature(x, k))
    toast({ title: t('creature.exampleAdded', { name: k.name }), lines: [t('creature.exampleAddedHint')], tone: 'good' })
  }
  return (
    <div className="creature-library">
      <p className="hint">{t('creature.libraryHint')}</p>
      <div className="cl-actions">
        <button className="btn btn-primary" onClick={() => open({ kind: 'edit', creature: blankCreature(), thenPlay: fromPlay })}>
          + {t('creature.newBlock')}
        </button>
        <button className="btn" onClick={addMammoth} title={t('creature.exampleHint')}>
          + {t('creature.example')}
        </button>
        <button className="link-btn" onClick={() => api.go('edit', PREFS_PANEL_ID)}>
          {t('creature.settings')}
        </button>
      </div>
      {list.length === 0 && <p className="muted cl-empty">{t('creature.none')}</p>}
      {hidden > 0 && prefs.where !== 'tab' && (
        <p className="hint cl-hidden">
          {t('creature.hiddenN', { n: hidden })}{' '}
          <button className="link-btn" onClick={() => update(pinAll)}>
            {t('creature.showAll')}
          </button>
        </p>
      )}
      {list.map((k, i) => (
        <BlockCard key={k.id} api={api} creature={k} index={i} count={list.length} open={open} />
      ))}
    </div>
  )
}

/** The Creatures tab. */
export function CreaturesView({ api }: { api: SheetApi }) {
  const [win, setWin] = useState<CreatureWin>(null)
  return (
    <div className="creatures-view">
      <section className="panel">
        <h3>{t('creature.title')}</h3>
        <CreatureLibrary api={api} open={setWin} />
      </section>
      <CreatureWindows api={api} win={win} setWin={setWin} />
    </div>
  )
}

// ---------------- the section of the Play screen ----------------

export function CreaturesSection({ api, id, initiallyOpen }: { api: SheetApi; id: string; /** For tests; otherwise from storage. */ initiallyOpen?: boolean }) {
  const { c } = api
  const wide = useMediaQuery('(min-width: 900px)')
  const [open, setOpen] = useState(() => initiallyOpen ?? loadCreaturesOpen())
  const [win, setWin] = useState<CreatureWin>(null)
  const prefs = creaturePrefs(c)
  const rows = creaturesShownInPlay(c)
  // only the tab: no section. Both: the section appears with the first creature in play. Only the section:
  // it is always there, or there would be no way to add the first creature.
  if (prefs.where === 'tab' || (rows.length === 0 && prefs.where === 'both')) return <CreatureWindows api={api} win={win} setWin={setWin} />
  const collapsible = !wide
  const shown = !collapsible || open
  const toggle = () => {
    setOpen(!open)
    saveCreaturesOpen(!open)
  }
  const count = <span className="muted">({rows.length})</span>
  const add = (
    <button className="section-edit cr-add" onClick={() => setWin({ kind: 'library' })} aria-label={t('creature.manage')} title={t('creature.manage')}>
      <span aria-hidden="true">+</span> {t('common.add')}
    </button>
  )
  return (
    <section id={id} className={`play-creatures panel nav-target ${collapsible ? 'collapsible' : ''} ${shown ? 'open' : ''}`}>
      {collapsible ? (
        <div className="items-head">
          <button className="items-toggle" onClick={toggle} aria-expanded={open} title={open ? t('creature.hide') : t('creature.show')}>
            <span className="items-title">
              {t('creature.title')} {count}
            </span>
            {!open && (
              <span className="cr-minis" aria-hidden="true">
                {rows.slice(0, 8).map(({ instance }) => (
                  <HpBar key={instance.id} hp={instance.hp} />
                ))}
              </span>
            )}
            <svg className="items-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d={open ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {add}
        </div>
      ) : (
        <h3>
          {t('creature.title')} {count}
          {add}
        </h3>
      )}
      {shown &&
        (rows.length > 0 ? (
          <div className="cr-rows">
            {rows.map(({ creature, instance }) => (
              <CreatureRow key={instance.id} c={c} creature={creature} instance={instance} fields={prefs.row} onOpen={() => setWin({ kind: 'panel', id: instance.id })} />
            ))}
          </div>
        ) : (
          <p className="muted cr-empty">{t('creature.noneInPlay')}</p>
        ))}
      <CreatureWindows api={api} win={win} setWin={setWin} />
    </section>
  )
}
