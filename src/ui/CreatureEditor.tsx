// The editor of a creature's stat block. Every field of the block is here and every one is typed by hand:
// the app works out nothing from an edition's rules (the table may play 2014, 2024 or its own mix), only the
// ability modifiers, shown next to the scores as a help. What is not a field goes in "Your own lines".
import { useState } from 'react'
import { t } from '../i18n'
import { blankAction, creatureHpMax, creatureMod, creatureNumber, deleteCreature, saveCreature } from '../model/creatures'
import { evalFormula } from '../model/rules'
import { ABILITIES, ACTIVATIONS, CREATURE_TEXT_FIELDS, RECHARGES, type Ability, type Activation, type Character, type Creature, type CreatureAction, type CreatureField, type Formula, type Recharge, type Uses } from '../model/types'
import { Check, NumberField, Select, TextArea, TextField, fmtMod } from './common'
import { EditorFrame } from './editors'
import type { SheetApi } from './Sheet'
import { actionLine } from './StatBlock'

/** A number or a formula, typed as text. `optional`: empty = not set. "+10" is read as 10. */
function FormulaField(props: { c: Character; label: string; value: Formula | undefined; onChange: (f: Formula | undefined) => void; optional?: boolean; placeholder?: string }) {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value))
  const parse = (s: string): Formula | undefined => {
    const v = s.trim().replace('−', '-')
    if (v === '') return undefined
    return /^[+-]?\d+$/.test(v) ? Number(v) : v
  }
  const f = parse(text)
  // only a formula needs checking; a plain number is what it says
  const r = typeof f === 'string' ? evalFormula(props.c, f) : null
  const bad = !!r && (!!r.error || r.unknown.length > 0)
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="text"
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => {
          setText(e.target.value)
          const next = parse(e.target.value)
          if (next !== undefined || props.optional) props.onChange(next)
        }}
      />
      {r && <small className={bad ? 'warn' : 'hint'}>{r.error ? r.error : r.unknown.length ? t('uses.unknownNames', { names: r.unknown.join(', ') }) : t('uses.now', { n: Math.floor(r.value) })}</small>}
    </label>
  )
}

/** A whole number that may be left empty; the placeholder says what counts then. */
function OptionalInt(props: { label: string; value: number | undefined; placeholder?: string; onChange: (n: number | undefined) => void }) {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value))
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="text"
        inputMode="text"
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => {
          setText(e.target.value)
          const s = e.target.value.trim().replace('−', '-').replace(/^\+/, '')
          if (s === '') props.onChange(undefined)
          else if (/^-?\d+$/.test(s)) props.onChange(Number(s))
        }}
      />
    </label>
  )
}

/** The limit of an action. What is spent is kept per creature in play, so there is no "used" here. */
function LimitEditor({ c, value, onChange }: { c: Character; value: Uses | undefined; onChange: (u: Uses | undefined) => void }) {
  return (
    <fieldset className="uses-editor creature-limit">
      <Check label={t('creature.edit.limited')} checked={!!value} onChange={(on) => onChange(on ? { max: 1, used: 0, recharge: 'long' } : undefined)} />
      {value && (
        <>
          <div className="creature-presets">
            <button type="button" className="btn btn-small" onClick={() => onChange({ max: 1, used: 0, recharge: 'other', note: 'Recharge 5–6' })}>
              {t('creature.edit.presetRecharge')}
            </button>
            <button type="button" className="btn btn-small" onClick={() => onChange({ max: 3, used: 0, recharge: 'long', note: '3/Day' })}>
              {t('creature.edit.presetDay')}
            </button>
            <button type="button" className="btn btn-small" onClick={() => onChange({ max: 1, used: 0, recharge: 'short' })}>
              {t('creature.edit.presetShort')}
            </button>
          </div>
          <div className="grid-3">
            <FormulaField key={`max-${String(value.max)}-${value.recharge}`} c={c} label={t('creature.edit.limitMax')} value={value.max} onChange={(max) => max !== undefined && onChange({ ...value, max })} />
            <Select<Recharge> label={t('uses.recharge')} value={value.recharge} options={RECHARGES.map((r) => ({ value: r, label: t(`recharge.${r}`) }))} onChange={(recharge) => onChange({ ...value, recharge })} />
            <TextField label={t('creature.edit.limitNote')} value={value.note ?? ''} placeholder="Recharge 5–6" onChange={(note) => onChange({ ...value, note: note || undefined })} />
          </div>
          <p className="hint">{t('creature.edit.limitHint')}</p>
        </>
      )}
    </fieldset>
  )
}

/** The lines of the stat block: one is open for editing at a time, like the powers of an item. */
function ActionsEditor({ c, actions, onChange }: { c: Character; actions: CreatureAction[]; onChange: (a: CreatureAction[]) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const set = (id: string, patch: Partial<CreatureAction>) => onChange(actions.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= actions.length) return
    const next = [...actions]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = (activation: Activation) => {
    const a = blankAction(activation)
    onChange([...actions, a])
    setOpen(a.id)
  }
  return (
    <fieldset className="powers-editor creature-actions-editor">
      <legend>{t('creature.edit.actions')}</legend>
      <p className="hint">{t('creature.edit.actionsHint')}</p>
      {actions.length === 0 && <p className="muted">{t('creature.edit.noActions')}</p>}
      <ul className="power-rows">
        {actions.map((a, i) => (
          <li key={a.id} className={open === a.id ? 'open' : ''}>
            <div className="power-head">
              <button type="button" className="link-btn" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                {open === a.id ? '▾' : '▸'} {a.name || t('creature.edit.unnamed')}
              </button>
              <span className={`gem gem-small gem-${a.activation}`}>{t(`creature.act.${a.activation}`)}</span>
              {open !== a.id && actionLine(c, a).length > 0 && <span className="muted creature-action-sum">{actionLine(c, a).join(' · ')}</span>}
              <span className="power-move">
                <button type="button" className="mini-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('power.up')}>
                  ↑
                </button>
                <button type="button" className="mini-btn" onClick={() => move(i, 1)} disabled={i === actions.length - 1} aria-label={t('power.down')}>
                  ↓
                </button>
                <button type="button" className="mini-btn danger" onClick={() => onChange(actions.filter((x) => x.id !== a.id))} aria-label={t('creature.edit.removeAction', { name: a.name })}>
                  ✕
                </button>
              </span>
            </div>
            {open === a.id && (
              <div className="power-body">
                <div className="grid-2">
                  <TextField label={t('common.name')} value={a.name} placeholder="Gore" onChange={(name) => set(a.id, { name })} />
                  <Select<Activation> label={t('creature.edit.section')} value={a.activation} options={ACTIVATIONS.map((x) => ({ value: x, label: t(`creature.act.${x}`) }))} onChange={(activation) => set(a.id, { activation })} />
                </div>
                <div className="grid-3">
                  <FormulaField c={c} optional label={t('creature.edit.toHit')} value={a.toHit} placeholder="+10" onChange={(toHit) => set(a.id, { toHit })} />
                  <TextField label={t('creature.edit.damage')} value={a.damage ?? ''} placeholder="2d10" onChange={(damage) => set(a.id, { damage: damage || undefined })} />
                  <FormulaField c={c} optional label={t('creature.edit.damageBonus')} value={a.damageBonus} placeholder="7" onChange={(damageBonus) => set(a.id, { damageBonus: damageBonus === 0 ? undefined : damageBonus })} />
                  <TextField label={t('creature.edit.damageType')} value={a.damageType ?? ''} placeholder="Piercing" onChange={(damageType) => set(a.id, { damageType: damageType || undefined })} />
                  <FormulaField c={c} optional label={t('creature.edit.saveDc')} value={a.saveDc} placeholder="18" onChange={(saveDc) => set(a.id, { saveDc })} />
                  <Select
                    label={t('creature.edit.saveAbility')}
                    value={a.saveAbility ?? ''}
                    options={[{ value: '', label: '—' }, ...ABILITIES.map((x) => ({ value: x as string, label: t(`ability.long.${x}`) }))]}
                    onChange={(v) => set(a.id, { saveAbility: (v || undefined) as Ability | undefined })}
                  />
                </div>
                <p className="hint">{t('creature.edit.numbersHint')}</p>
                <LimitEditor c={c} value={a.uses} onChange={(uses) => set(a.id, { uses })} />
                <TextArea label={t('creature.edit.text')} rows={4} value={a.description} onChange={(description) => set(a.id, { description })} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="creature-add-actions">
        {(['passive', 'action', 'bonus', 'reaction'] as const).map((x) => (
          <button key={x} type="button" className="btn btn-small" onClick={() => add(x)}>
            + {t(`creature.edit.add.${x}`)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** The player's own lines: a label and a value each. */
function ExtraEditor({ value, onChange }: { value: CreatureField[]; onChange: (list: CreatureField[]) => void }) {
  const set = (i: number, patch: Partial<CreatureField>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <fieldset className="creature-extra-editor">
      <legend>{t('creature.edit.extra')}</legend>
      <p className="hint">{t('creature.edit.extraHint')}</p>
      {value.map((x, i) => (
        <div key={i} className="creature-extra-row">
          <TextField label={t('creature.edit.extraLabel')} value={x.label} placeholder="Carries" onChange={(label) => set(i, { label })} />
          <TextField label={t('creature.edit.extraValue')} value={x.value} placeholder="1,080 lb." onChange={(v) => set(i, { value: v })} />
          <button type="button" className="mini-btn danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t('creature.edit.extraRemove')} title={t('creature.edit.extraRemove')}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-small" onClick={() => onChange([...value, { label: '', value: '' }])}>
        + {t('creature.edit.extraAdd')}
      </button>
    </fieldset>
  )
}

export function CreatureEditor({ api, initial, onClose, onSaved }: { api: SheetApi; initial: Creature; onClose: () => void; /** Called with the saved stat block's id (a new one: to put it in play at once). */ onSaved?: (id: string) => void }) {
  const [k, setK] = useState(initial)
  const exists = (api.c.creatures ?? []).some((x) => x.id === k.id)
  const inPlay = (api.c.creatures ?? []).find((x) => x.id === k.id)?.inPlay?.length ?? 0
  const save = () => {
    // a line added and left completely empty is dropped
    const actions = k.actions.filter((a) => a.name.trim() || a.description.trim() || a.toHit !== undefined || a.damage).map((a) => ({ ...a, name: a.name.trim() || t('creature.edit.unnamedSaved') }))
    api.update((c) => saveCreature(c, { ...k, name: k.name.trim(), actions }))
    onSaved?.(k.id)
    onClose()
  }
  const hp = creatureNumber(api.c, k.hp)
  const hpChanges = exists && inPlay > 0 && !Number.isNaN(hp) && creatureHpMax(api.c, k) !== creatureHpMax(api.c, initial)
  return (
    <EditorFrame title={exists ? t('creature.edit.title') : t('creature.edit.titleNew')} onClose={onClose} onSave={save} canSave={!!k.name.trim()} onDelete={exists ? () => (api.update((c) => deleteCreature(c, k.id)), onClose()) : undefined}>
      <p className="hint">{t('creature.edit.hint')}</p>
      {exists && inPlay > 0 && <p className="hint creature-inplay-note">{t('creature.edit.inPlay', { n: inPlay })}</p>}
      <div className="grid-2">
        <TextField label={t('common.name')} value={k.name} placeholder="Mammoth" onChange={(name) => setK({ ...k, name })} />
        <TextField label={t('creature.edit.kind')} value={k.kind ?? ''} placeholder="Huge Beast, Unaligned" onChange={(kind) => setK({ ...k, kind: kind || undefined })} />
      </div>
      <div className="grid-3">
        <FormulaField c={api.c} label={t('creature.edit.ac')} value={k.ac} onChange={(ac) => ac !== undefined && setK({ ...k, ac })} />
        <FormulaField c={api.c} label={t('creature.edit.hp')} value={k.hp} onChange={(v) => v !== undefined && setK({ ...k, hp: v })} />
        <TextField label={t('creature.edit.hitDice')} value={k.hitDice ?? ''} placeholder="11d12 + 55" onChange={(hitDice) => setK({ ...k, hitDice: hitDice || undefined })} />
        <TextField label={t('creature.edit.speed')} value={k.speed} placeholder="50 ft." onChange={(speed) => setK({ ...k, speed })} />
        <OptionalInt label={t('creature.edit.initiative')} value={k.initiative} placeholder={t('creature.edit.fromDex', { n: fmtMod(creatureMod(k, 'dex')) })} onChange={(initiative) => setK({ ...k, initiative })} />
        <TextField label={t('creature.field.cr')} value={k.cr ?? ''} placeholder="6 (XP 2,300; PB +3)" onChange={(cr) => setK({ ...k, cr: cr || undefined })} />
      </div>
      {hpChanges && <p className="hint creature-inplay-note">{t('creature.edit.hpFollows')}</p>}

      <fieldset className="creature-abilities-editor">
        <legend>{t('creature.edit.abilities')}</legend>
        <div className="grid-6">
          {ABILITIES.map((a) => (
            <div key={a} className="creature-ability-edit">
              <NumberField label={`${t(`ability.${a}`)} (${fmtMod(creatureMod(k, a))})`} value={k.abilities[a]} min={1} max={30} onChange={(n) => setK({ ...k, abilities: { ...k.abilities, [a]: Math.max(1, Math.min(30, Math.round(n))) } })} />
              <OptionalInt
                label={t('creature.edit.save', { ability: t(`ability.${a}`) })}
                value={k.saves?.[a]}
                placeholder={fmtMod(creatureMod(k, a))}
                onChange={(n) => {
                  const saves = { ...(k.saves ?? {}) }
                  if (n === undefined) delete saves[a]
                  else saves[a] = n
                  setK({ ...k, saves: Object.keys(saves).length ? saves : undefined })
                }}
              />
            </div>
          ))}
        </div>
        <p className="hint">{t('creature.edit.savesHint')}</p>
      </fieldset>

      <div className="grid-2">
        {CREATURE_TEXT_FIELDS.filter((f) => f !== 'cr').map((f) => (
          <TextField key={f} label={t(`creature.field.${f}`)} value={k[f] ?? ''} placeholder={t(`creature.placeholder.${f}`)} onChange={(v) => setK({ ...k, [f]: v || undefined })} />
        ))}
      </div>

      <ActionsEditor c={api.c} actions={k.actions} onChange={(actions) => setK({ ...k, actions })} />
      <ExtraEditor value={k.extra ?? []} onChange={(extra) => setK({ ...k, extra: extra.length ? extra : undefined })} />
      <TextArea label={t('creature.notes')} rows={3} value={k.description ?? ''} hint={t('creature.edit.notesHint')} onChange={(description) => setK({ ...k, description: description || undefined })} />
    </EditorFrame>
  )
}
