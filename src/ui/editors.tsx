import { useEffect, useState } from 'react'
import { loadSrdSpells, type SrdSpell } from '../data/srd'
import { t } from '../i18n'
import { newId } from '../model/normalize'
import { evalFormula } from '../model/rules'
import { autoPart, ownTagsIn, spellAutoTags, textTags } from '../model/tags'
import { ACTIVATIONS, ABILITIES, RECHARGES, SOURCE_TYPES, type Activation, type Attack, type Feature, type Item, type ItemPower, type PowerCost, type Recharge, type SourceType, type Spell, type Uses } from '../model/types'
import { Check, Confirm, Modal, NumberField, Select, TextArea, TextField } from './common'
import type { SheetApi } from './Sheet'
import { TagInput } from './tags'

// ---------------- uses (shared) ----------------

function UsesEditor(props: { api: SheetApi; value?: Uses; onChange: (u?: Uses) => void; label: string; allowRegain?: boolean }) {
  const u = props.value
  const preview = u ? evalFormula(props.api.c, u.max) : null
  return (
    <fieldset className="uses-editor">
      <Check
        label={props.label}
        checked={!!u}
        onChange={(on) => props.onChange(on ? { max: 1, used: 0, recharge: 'long' } : undefined)}
      />
      {u && (
        <div className="grid-2">
          <label className="field">
            <span>{t('uses.max')}</span>
            <input value={String(u.max)} onChange={(e) => props.onChange({ ...u, max: /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value })} />
            <small className={preview?.error || preview?.unknown.length ? 'warn' : 'hint'}>
              {preview?.error ? preview.error : preview?.unknown.length ? t('uses.unknownNames', { names: preview.unknown.join(', ') }) : t('uses.now', { n: preview?.value ?? 0 })}
            </small>
          </label>
          <Select<Recharge> label={t('uses.recharge')} value={u.recharge} options={RECHARGES.map((r) => ({ value: r, label: t(`recharge.${r}`) }))} onChange={(recharge) => props.onChange({ ...u, recharge })} />
          {u.recharge === 'long' && (
            <label className="field">
              <span>{t('uses.shortRestRegain')}</span>
              <input
                value={u.shortRestRegain === undefined ? '' : String(u.shortRestRegain)}
                placeholder="0"
                onChange={(e) => props.onChange({ ...u, shortRestRegain: e.target.value === '' ? undefined : /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value })}
              />
            </label>
          )}
          {props.allowRegain && (
            <TextField label={t('uses.regain')} value={u.regain ?? ''} placeholder="1d6+1" onChange={(v) => props.onChange({ ...u, regain: v || undefined })} />
          )}
          <TextField label={t('uses.note')} value={u.note ?? ''} onChange={(v) => props.onChange({ ...u, note: v || undefined })} />
          <NumberField label={t('uses.used')} value={u.used} min={0} onChange={(used) => props.onChange({ ...u, used: Math.max(0, used) })} />
        </div>
      )}
      {u && <p className="hint">{t('uses.formulaHelp')}</p>}
    </fieldset>
  )
}

function EditorFrame(props: { title: string; onClose: () => void; onSave: () => void; onDelete?: () => void; children: React.ReactNode; canSave?: boolean }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Modal
        title={props.title}
        onClose={props.onClose}
        wide
        footer={
          <>
            {props.onDelete && (
              <button className="btn btn-danger left" onClick={() => setConfirm(true)}>
                {t('common.delete')}
              </button>
            )}
            <button className="btn" onClick={props.onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={props.onSave} disabled={props.canSave === false}>
              {t('common.save')}
            </button>
          </>
        }
      >
        <div className="editor">{props.children}</div>
      </Modal>
      {confirm && props.onDelete && (
        <Confirm title={t('common.delete')} message={t('common.confirmDelete')} confirmLabel={t('common.delete')} danger onCancel={() => setConfirm(false)} onConfirm={props.onDelete} />
      )}
    </>
  )
}

// ---------------- feature ----------------

export function blankFeature(): Feature {
  return { id: newId(), name: '', source: { type: 'class', name: '' }, activation: 'action', description: '' }
}

export function FeatureEditor({ api, initial, onClose }: { api: SheetApi; initial: Feature; onClose: () => void }) {
  const [f, setF] = useState(initial)
  const exists = api.c.features.some((x) => x.id === f.id)
  const save = () => {
    api.update((c) => ({ ...c, features: exists ? c.features.map((x) => (x.id === f.id ? f : x)) : [...c.features, f] }))
    onClose()
  }
  return (
    <EditorFrame
      title={exists ? t('feature.edit') : t('feature.add')}
      onClose={onClose}
      onSave={save}
      canSave={!!f.name.trim()}
      onDelete={exists ? () => (api.update((c) => ({ ...c, features: c.features.filter((x) => x.id !== f.id) })), onClose()) : undefined}
    >
      <TextField label={t('common.name')} value={f.name} onChange={(name) => setF({ ...f, name })} />
      <div className="grid-3">
        <Select<SourceType> label={t('feature.sourceType')} value={f.source.type} options={SOURCE_TYPES.map((s) => ({ value: s, label: t(`source.${s}`) }))} onChange={(type) => setF({ ...f, source: { ...f.source, type } })} />
        <TextField label={t('feature.sourceName')} value={f.source.name} placeholder="Fighter 2" onChange={(name) => setF({ ...f, source: { ...f.source, name } })} />
        <Select<Activation> label={t('feature.activation')} value={f.activation} options={ACTIVATIONS.map((a) => ({ value: a, label: t(`act.${a}`) }))} onChange={(activation) => setF({ ...f, activation })} />
      </div>
      <UsesEditor api={api} value={f.uses} onChange={(uses) => setF({ ...f, uses })} label={t('feature.hasUses')} />
      <TextArea label={t('common.description')} rows={6} value={f.description} onChange={(description) => setF({ ...f, description })} />
      <TagInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} auto={autoPart(textTags(f.description), f.tags)} known={ownTagsIn(api.c)} />
    </EditorFrame>
  )
}

// ---------------- spell ----------------

export function blankSpell(level = 1): Spell {
  return { id: newId(), name: '', level, prepared: true, alwaysPrepared: false, ritual: false, concentration: false, castingTime: 'Action', range: '', components: '', duration: '', description: '' }
}

export function fromSrdSpell(s: SrdSpell, source?: string): Spell {
  return {
    id: newId(),
    name: s.name,
    level: s.level,
    source,
    prepared: true,
    alwaysPrepared: false,
    ritual: s.ritual,
    concentration: s.concentration,
    school: s.school,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    description: s.text,
  }
}

export function useSrdSpells() {
  const [spells, setSpells] = useState<SrdSpell[] | null>(null)
  useEffect(() => {
    let alive = true
    loadSrdSpells().then((s) => alive && setSpells(s))
    return () => {
      alive = false
    }
  }, [])
  return spells
}

export function SpellEditor({ api, initial, onClose }: { api: SheetApi; initial: Spell; onClose: () => void }) {
  const [s, setS] = useState(initial)
  const srd = useSrdSpells()
  const exists = api.c.spells.some((x) => x.id === s.id)
  const sources = [...api.c.classes.map((k) => k.id), 'feat', 'item', 'species']
  const save = () => {
    api.update((c) => ({ ...c, spells: exists ? c.spells.map((x) => (x.id === s.id ? s : x)) : [...c.spells, s] }))
    onClose()
  }
  const fillFromSrd = (name: string) => {
    const m = srd?.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (m) setS({ ...fromSrdSpell(m, s.source), id: s.id, prepared: s.prepared, alwaysPrepared: s.alwaysPrepared, freeCasts: s.freeCasts, tags: s.tags })
  }
  return (
    <EditorFrame
      title={exists ? t('spell.edit') : t('spell.add')}
      onClose={onClose}
      onSave={save}
      canSave={!!s.name.trim()}
      onDelete={exists ? () => (api.update((c) => ({ ...c, spells: c.spells.filter((x) => x.id !== s.id) })), onClose()) : undefined}
    >
      <TextField
        label={t('common.name')}
        value={s.name}
        list="srd-spells"
        onChange={(name) => {
          setS({ ...s, name })
          fillFromSrd(name)
        }}
      />
      <datalist id="srd-spells">{srd?.map((x) => <option key={x.name} value={x.name} />)}</datalist>
      <p className="hint">{t('spell.srdHint')}</p>
      <div className="grid-3">
        <NumberField label={t('spell.level')} value={s.level} min={0} max={9} onChange={(level) => setS({ ...s, level: Math.max(0, Math.min(9, Math.round(level))) })} />
        <Select label={t('spell.source')} value={s.source ?? ''} options={[{ value: '', label: '—' }, ...sources.map((x) => ({ value: x, label: x }))]} onChange={(source) => setS({ ...s, source: source || undefined })} />
        <TextField label={t('spell.school')} value={s.school ?? ''} onChange={(school) => setS({ ...s, school })} />
        <TextField label={t('spell.castingTime')} value={s.castingTime ?? ''} onChange={(castingTime) => setS({ ...s, castingTime })} />
        <TextField label={t('spell.range')} value={s.range ?? ''} onChange={(range) => setS({ ...s, range })} />
        <TextField label={t('spell.components')} value={s.components ?? ''} onChange={(components) => setS({ ...s, components })} />
        <TextField label={t('spell.duration')} value={s.duration ?? ''} onChange={(duration) => setS({ ...s, duration })} />
      </div>
      <div className="checks">
        <Check label={t('spell.prepared')} checked={s.prepared} onChange={(prepared) => setS({ ...s, prepared })} />
        <Check label={t('spell.alwaysPrepared')} checked={s.alwaysPrepared} onChange={(alwaysPrepared) => setS({ ...s, alwaysPrepared })} />
        <Check label={t('spell.concentration')} checked={s.concentration} onChange={(concentration) => setS({ ...s, concentration })} />
        <Check label={t('spell.ritual')} checked={s.ritual} onChange={(ritual) => setS({ ...s, ritual })} />
      </div>
      <UsesEditor api={api} value={s.freeCasts} onChange={(freeCasts) => setS({ ...s, freeCasts })} label={t('spell.hasFreeCasts')} />
      <TextArea label={t('common.description')} rows={6} value={s.description ?? ''} onChange={(description) => setS({ ...s, description })} />
      <TagInput value={s.tags} onChange={(tags) => setS({ ...s, tags })} auto={autoPart(spellAutoTags(s), s.tags)} known={ownTagsIn(api.c)} />
    </EditorFrame>
  )
}

// ---------------- item ----------------

export function blankItem(): Item {
  return { id: newId(), name: '', quantity: 1, equipped: false, requiresAttunement: false, attuned: false, description: '' }
}

export function ItemEditor({ api, initial, onClose }: { api: SheetApi; initial: Item; onClose: () => void }) {
  const [it, setIt] = useState(initial)
  const exists = api.c.inventory.items.some((x) => x.id === it.id)
  const save = () => {
    // a power added and left completely empty is dropped; one with only a description gets a name on the next import
    const powers = it.powers?.filter((p) => p.name.trim() || p.description.trim())
    const out: Item = { ...it, powers: powers?.length ? powers : undefined }
    api.update((c) => ({ ...c, inventory: { ...c.inventory, items: exists ? c.inventory.items.map((x) => (x.id === out.id ? out : x)) : [...c.inventory.items, out] } }))
    onClose()
  }
  const isCard = !!it.activation
  return (
    <EditorFrame
      title={exists ? t('item.edit') : t('item.add')}
      onClose={onClose}
      onSave={save}
      canSave={!!it.name.trim()}
      onDelete={exists ? () => (api.update((c) => ({ ...c, inventory: { ...c.inventory, items: c.inventory.items.filter((x) => x.id !== it.id) } })), onClose()) : undefined}
    >
      <TextField label={t('common.name')} value={it.name} onChange={(name) => setIt({ ...it, name })} />
      <div className="grid-3">
        <NumberField label={t('item.quantity')} value={it.quantity} min={0} onChange={(quantity) => setIt({ ...it, quantity: Math.max(0, quantity) })} />
        <NumberField label={t('item.weight')} value={it.weight ?? 0} min={0} step={0.5} onChange={(weight) => setIt({ ...it, weight })} />
        <NumberField label={t('item.acBonus')} value={it.acBonus ?? 0} onChange={(acBonus) => setIt({ ...it, acBonus: acBonus || undefined })} />
        <NumberField label={t('item.saveBonus')} value={it.saveBonus ?? 0} onChange={(saveBonus) => setIt({ ...it, saveBonus: saveBonus || undefined })} />
        <NumberField label={t('item.spellDcBonus')} value={it.spellDcBonus ?? 0} onChange={(spellDcBonus) => setIt({ ...it, spellDcBonus: spellDcBonus || undefined })} />
        <NumberField label={t('item.spellAttackBonus')} value={it.spellAttackBonus ?? 0} onChange={(spellAttackBonus) => setIt({ ...it, spellAttackBonus: spellAttackBonus || undefined })} />
      </div>
      <div className="checks">
        <Check label={t('item.equipped')} checked={it.equipped} onChange={(equipped) => setIt({ ...it, equipped })} />
        <Check label={t('item.requiresAttunement')} checked={it.requiresAttunement} onChange={(requiresAttunement) => setIt({ ...it, requiresAttunement, attuned: requiresAttunement && it.attuned })} />
        <Check label={t('item.isArmor')} checked={!!it.armor} onChange={(on) => setIt({ ...it, armor: on ? { base: 11, dexCap: null } : undefined })} />
        <Check label={t('item.isCard')} checked={isCard} onChange={(on) => setIt({ ...it, activation: on ? 'action' : undefined })} />
      </div>
      {it.armor && (
        <div className="grid-3">
          <NumberField label={t('item.armorBase')} value={it.armor.base} onChange={(base) => setIt({ ...it, armor: { ...it.armor!, base } })} />
          <Select
            label={t('item.dexCap')}
            value={it.armor.dexCap === null ? 'none' : String(it.armor.dexCap)}
            options={[
              { value: 'none', label: t('item.dexCapNone') },
              { value: '2', label: t('item.dexCap2') },
              { value: '0', label: t('item.dexCap0') },
            ]}
            onChange={(v) => setIt({ ...it, armor: { ...it.armor!, dexCap: v === 'none' ? null : Number(v) } })}
          />
        </div>
      )}
      {isCard && (
        <Select<Activation> label={t('feature.activation')} value={it.activation!} options={ACTIVATIONS.filter((a) => a !== 'passive').map((a) => ({ value: a, label: t(`act.${a}`) }))} onChange={(activation) => setIt({ ...it, activation })} />
      )}
      <UsesEditor api={api} value={it.charges} onChange={(charges) => setIt({ ...it, charges })} label={t('item.hasCharges')} allowRegain />
      <TextArea label={t('common.description')} rows={5} value={it.description ?? ''} onChange={(description) => setIt({ ...it, description })} />
      <PowersEditor api={api} item={it} onChange={(powers) => setIt({ ...it, powers: powers.length ? powers : undefined })} />
      <TagInput value={it.tags} onChange={(tags) => setIt({ ...it, tags })} auto={autoPart(textTags(it.description), it.tags)} known={ownTagsIn(api.c)} />
    </EditorFrame>
  )
}

// ---------------- item powers ----------------

export function blankPower(): ItemPower {
  return { id: newId(), name: '', activation: 'action', description: '' }
}

/**
 * The separate abilities of an item (Staff of Ages: Temporal Echo, Hourglass Ward...).
 * Each is a card on the Play screen (passive ones sit with "Always on"); using one spends
 * its cost from the item's charges. One power is open for editing at a time.
 */
function PowersEditor({ api, item, onChange }: { api: SheetApi; item: Item; onChange: (p: ItemPower[]) => void }) {
  const powers = item.powers ?? []
  const [open, setOpen] = useState<string | null>(null)
  const setPower = (id: string, patch: Partial<ItemPower>) => onChange(powers.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= powers.length) return
    const next = [...powers]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const costValue = (c: PowerCost | undefined) => (c === 'all' ? 'all' : String(c ?? 0))
  const costOptions = [
    { value: '0', label: t('power.costNone') },
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: t('power.costN', { n }) })),
    { value: 'all', label: t('power.costAll') },
  ]
  return (
    <fieldset className="powers-editor">
      <legend>{t('power.title')}</legend>
      <p className="hint">{t('power.hint')}</p>
      {powers.length === 0 && <p className="muted">{t('power.none')}</p>}
      <ul className="power-rows">
        {powers.map((p, i) => (
          <li key={p.id} className={open === p.id ? 'open' : ''}>
            <div className="power-head">
              <button type="button" className="link-btn" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                {open === p.id ? '▾' : '▸'} {p.name || t('power.unnamed')}
              </button>
              <span className={`gem gem-small gem-${p.activation}`}>{t(`act.${p.activation}`)}</span>
              {p.cost ? <span className="tag">{p.cost === 'all' ? t('power.costAll') : t('power.costN', { n: p.cost })}</span> : null}
              <span className="power-move">
                <button type="button" className="mini-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('power.up')}>
                  ↑
                </button>
                <button type="button" className="mini-btn" onClick={() => move(i, 1)} disabled={i === powers.length - 1} aria-label={t('power.down')}>
                  ↓
                </button>
                <button type="button" className="mini-btn danger" onClick={() => onChange(powers.filter((x) => x.id !== p.id))} aria-label={t('power.remove', { name: p.name })}>
                  ✕
                </button>
              </span>
            </div>
            {open === p.id && (
              <div className="power-body">
                <TextField label={t('common.name')} value={p.name} onChange={(name) => setPower(p.id, { name })} />
                <div className="grid-2">
                  <Select<Activation> label={t('feature.activation')} value={p.activation} options={ACTIVATIONS.map((a) => ({ value: a, label: t(`act.${a}`) }))} onChange={(activation) => setPower(p.id, { activation })} />
                  {item.charges ? (
                    <Select label={t('power.cost')} value={costValue(p.cost)} options={costOptions} onChange={(v) => setPower(p.id, { cost: v === 'all' ? 'all' : Number(v) || undefined })} />
                  ) : (
                    <p className="hint">{t('power.noPool')}</p>
                  )}
                </div>
                <UsesEditor api={api} value={p.uses} onChange={(uses) => setPower(p.id, { uses })} label={t('power.ownUses')} />
                <TextArea label={t('common.description')} rows={4} value={p.description} onChange={(description) => setPower(p.id, { description })} />
                <TagInput value={p.tags} onChange={(tags) => setPower(p.id, { tags })} auto={autoPart(textTags(p.description), [...(p.tags ?? []), ...(item.tags ?? [])])} known={ownTagsIn(api.c)} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => {
          const p = blankPower()
          onChange([...powers, p])
          setOpen(p.id)
        }}
      >
        + {t('power.add')}
      </button>
    </fieldset>
  )
}

// ---------------- attack ----------------

export function blankAttack(): Attack {
  return { id: newId(), name: '', ability: 'str', proficient: true, bonus: 0, damage: '1d8', damageType: '', addAbilityToDamage: true, damageBonus: 0 }
}

export function AttackEditor({ api, initial, onClose }: { api: SheetApi; initial: Attack; onClose: () => void }) {
  const [a, setA] = useState(initial)
  const exists = api.c.attacks.some((x) => x.id === a.id)
  const save = () => {
    api.update((c) => ({ ...c, attacks: exists ? c.attacks.map((x) => (x.id === a.id ? a : x)) : [...c.attacks, a] }))
    onClose()
  }
  const abil = [...ABILITIES, 'finesse', 'spell'] as Attack['ability'][]
  return (
    <EditorFrame
      title={exists ? t('attack.edit') : t('attack.add')}
      onClose={onClose}
      onSave={save}
      canSave={!!a.name.trim()}
      onDelete={exists ? () => (api.update((c) => ({ ...c, attacks: c.attacks.filter((x) => x.id !== a.id) })), onClose()) : undefined}
    >
      <TextField label={t('common.name')} value={a.name} onChange={(name) => setA({ ...a, name })} />
      <div className="grid-3">
        <Select label={t('attack.ability')} value={a.ability} options={abil.map((x) => ({ value: x, label: t(`attack.ability.${x}`) }))} onChange={(ability) => setA({ ...a, ability })} />
        <NumberField label={t('attack.bonus')} value={a.bonus} onChange={(bonus) => setA({ ...a, bonus })} />
        <TextField label={t('attack.damage')} value={a.damage} placeholder="1d8" onChange={(damage) => setA({ ...a, damage })} />
        <NumberField label={t('attack.damageBonus')} value={a.damageBonus} onChange={(damageBonus) => setA({ ...a, damageBonus })} />
        <TextField label={t('attack.damageType')} value={a.damageType ?? ''} onChange={(damageType) => setA({ ...a, damageType })} />
        <TextField label={t('attack.mastery')} value={a.mastery ?? ''} onChange={(mastery) => setA({ ...a, mastery })} />
      </div>
      <div className="checks">
        <Check label={t('attack.proficient')} checked={a.proficient} onChange={(proficient) => setA({ ...a, proficient })} />
        <Check label={t('attack.addAbility')} checked={a.addAbilityToDamage} onChange={(addAbilityToDamage) => setA({ ...a, addAbilityToDamage })} />
      </div>
      <TextArea label={t('attack.notes')} rows={3} value={a.notes ?? ''} onChange={(notes) => setA({ ...a, notes })} />
    </EditorFrame>
  )
}
