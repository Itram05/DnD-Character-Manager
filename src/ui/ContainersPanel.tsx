// Gear tab, inventory rework stage 2: the smallest UI that makes containers usable and testable.
// The panel lists the containers with their weight and warnings; a dialog creates or edits one; another
// moves, splits or merges a stack. The real Gear redesign (stage 3, layout A/B/C) replaces the look, not
// the model calls (containers.ts, categories.ts).
import { useState } from 'react'
import { t } from '../i18n'
import { addCategory, categoryList, deleteCategory, isBuiltinCategory, updateCategory } from '../model/categories'
import {
  CONTAINER_PRESETS,
  canMerge,
  carriedWeight,
  containerForItem,
  containerOf,
  contentsWeight,
  deleteContainer,
  findContainer,
  inventoryWarnings,
  itemOfContainer,
  itemsIn,
  mergeCandidates,
  mergeStacks,
  moveItem,
  moveTargets,
  parentOf,
  splitStack,
  totalWeight,
  addContainer,
  updateContainer,
  type ChangeRefusal,
  type ContainerInput,
} from '../model/containers'
import { GEAR_GROUPINGS, GEAR_SHOW_FIELDS, type Container, type GearPrefs, type Item } from '../model/types'
import { Check, Confirm, Modal, NumberField, Select, TextField } from './common'
import type { SheetApi } from './Sheet'

const lb = (n: number) => String(Math.round(n * 100) / 100)
export const boxLabel = (k: { name: string; icon?: string }) => (k.icon ? `${k.icon} ${k.name}` : k.name)

export function ContainersPanel({ api }: { api: SheetApi }) {
  const { c } = api
  const [edit, setEdit] = useState<Container | 'new' | null>(null)
  const warnings = inventoryWarnings(c)
  return (
    <section className="panel containers">
      <h3>
        {t('box.title')}
        <button className="btn btn-small" onClick={() => setEdit('new')}>
          + {t('box.new')}
        </button>
      </h3>
      {warnings.length > 0 && (
        <ul className="box-warnings" role="alert">
          {warnings.map((w) => (
            <li key={`${w.kind}:${w.container.id}`}>
              {w.kind === 'nested-extradimensional'
                ? t('box.warnNested', { inner: w.container.name, outer: w.inside.name })
                : t('box.warnOver', { name: w.container.name, n: lb(w.weight), max: lb(w.capacity) })}
            </li>
          ))}
        </ul>
      )}
      <ul className="box-list">
        {c.inventory.containers.map((k) => {
          const parent = parentOf(c, k)
          const n = itemsIn(c, k.id).length
          return (
            <li key={k.id} style={k.color ? { borderLeftColor: k.color } : undefined}>
              <button className="link-btn box-name" onClick={() => setEdit(k)}>
                {boxLabel(k)}
              </button>
              <span className="muted">{t('box.count', { n })}</span>
              <span className="muted">{k.capacity ? t('box.weightOf', { n: lb(contentsWeight(c, k.id)), max: lb(k.capacity) }) : t('box.weight', { n: lb(contentsWeight(c, k.id)) })}</span>
              {parent && <span className="tag">{t('box.inside', { name: parent.name })}</span>}
              {k.weightless && <span className="tag">{t('box.weightless')}</span>}
              {k.extradimensional && <span className="tag">{t('box.extradimensional')}</span>}
            </li>
          )
        })}
      </ul>
      <p className="muted">{t('box.carried', { n: lb(carriedWeight(c)), all: lb(totalWeight(c)) })}</p>
      <GearDisplay api={api} />
      <CategoriesEditor api={api} />
      {edit && <ContainerEditor api={api} initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  )
}

const REFUSAL_KEY: Record<ChangeRefusal, string> = {
  'not-found': 'box.err.notFound',
  'last-container': 'box.err.last',
  'into-itself': 'box.err.intoItself',
  'bad-amount': 'box.err.amount',
  'is-container': 'box.err.isContainer',
  'not-same': 'box.err.notSame',
  'item-taken': 'box.err.itemTaken',
}
export const refusalText = (r: ChangeRefusal) => t(REFUSAL_KEY[r])

function ContainerEditor({ api, initial, onClose }: { api: SheetApi; initial: Container | null; onClose: () => void }) {
  const { c } = api
  const [f, setF] = useState<ContainerInput>(initial ?? { name: '' })
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  // items that can be this container: not one another container already is
  const items = c.inventory.items.filter((i) => !containerForItem(c, i.id) || containerForItem(c, i.id)?.id === initial?.id)
  const save = () => {
    if (initial) {
      const r = updateContainer(c, initial.id, f)
      if (!r.ok) return setError(refusalText(r.reason))
      api.update(() => r.character)
    } else {
      const r = addContainer(c, f)
      if ('refused' in r) return setError(refusalText(r.refused))
      api.update(() => r.character)
    }
    onClose()
  }
  const remove = () => {
    const r = deleteContainer(c, initial!.id)
    setConfirm(false)
    if (!r.ok) return setError(refusalText(r.reason))
    api.update(() => r.character)
    if (r.moved) api.toast({ title: t('box.deleted', { name: initial!.name }), lines: [t('box.movedTo', { n: r.moved, name: r.movedTo!.name })] })
    onClose()
  }
  const target = initial && (parentOf(c, initial)?.name ?? c.inventory.containers.find((x) => x.id !== initial.id)?.name)
  return (
    <>
      <Modal
        title={initial ? t('box.edit') : t('box.new')}
        onClose={onClose}
        footer={
          <>
            {initial && (
              <button className="btn btn-danger left" onClick={() => setConfirm(true)} disabled={c.inventory.containers.length <= 1}>
                {t('common.delete')}
              </button>
            )}
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={save}>
              {t('common.save')}
            </button>
          </>
        }
      >
        <div className="editor">
          {!initial && (
            <Select
              label={t('box.kind')}
              value=""
              options={[{ value: '', label: '—' }, ...Object.entries(CONTAINER_PRESETS).map(([k, p]) => ({ value: k, label: p.name }))]}
              onChange={(k) => k && setF({ ...CONTAINER_PRESETS[k], itemId: f.itemId })}
            />
          )}
          <div className="grid-3">
            <TextField label={t('common.name')} value={f.name} onChange={(name) => setF({ ...f, name })} />
            <TextField label={t('box.icon')} value={f.icon ?? ''} placeholder="🎒" onChange={(icon) => setF({ ...f, icon })} />
            <TextField label={t('box.color')} value={f.color ?? ''} placeholder="#a274e0" onChange={(color) => setF({ ...f, color })} />
            <NumberField label={t('box.capacity')} value={f.capacity ?? 0} min={0} onChange={(capacity) => setF({ ...f, capacity: capacity > 0 ? capacity : undefined })} />
            <Select
              label={t('box.item')}
              value={f.itemId ?? ''}
              options={[{ value: '', label: t('box.itemNone') }, ...items.map((i) => ({ value: i.id, label: i.name }))]}
              onChange={(itemId) => setF({ ...f, itemId: itemId || undefined })}
            />
          </div>
          <div className="checks">
            <Check label={t('box.weightlessLong')} checked={!!f.weightless} onChange={(weightless) => setF({ ...f, weightless })} />
            <Check label={t('box.extradimensionalLong')} checked={!!f.extradimensional} onChange={(extradimensional) => setF({ ...f, extradimensional })} />
          </div>
          <p className="hint">{t('box.hint')}</p>
          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
      {confirm && initial && (
        <Confirm
          title={t('common.delete')}
          message={t('box.confirmDelete', { name: initial.name, n: itemsIn(c, initial.id).length, to: target ?? '' })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={remove}
        />
      )}
    </>
  )
}

/** Move, split or merge one stack. */
export function StackDialog({ api, item, onClose }: { api: SheetApi; item: Item; onClose: () => void }) {
  const { c } = api
  const here = containerOf(c, item)
  const targets = moveTargets(c, item.id)
  const [to, setTo] = useState(targets.find((k) => k.id !== here?.id)?.id ?? here?.id ?? '')
  const [n, setN] = useState(Math.max(1, Math.floor(item.quantity / 2)))
  const [error, setError] = useState<string | null>(null)
  const merges = mergeCandidates(c, item.id)
  const isBag = !!containerForItem(c, item.id)
  const run = (r: { ok: true; character: typeof c } | { ok: false; reason: ChangeRefusal }) => {
    if (!r.ok) return setError(refusalText(r.reason))
    api.update(() => r.character)
    onClose()
  }
  return (
    <Modal title={item.name} onClose={onClose}>
      <div className="editor stack-dialog">
        <p className="muted">{t('stack.where', { name: here ? boxLabel(here) : '', n: item.quantity })}</p>
        <Select label={t('stack.to')} value={to} options={targets.map((k) => ({ value: k.id, label: boxLabel(k) }))} onChange={setTo} />
        <div className="row">
          <button className="btn" onClick={() => run(moveItem(c, item.id, to))} disabled={to === here?.id}>
            {t('stack.moveAll')}
          </button>
        </div>
        {!isBag && item.quantity > 1 && (
          <div className="row">
            <NumberField label={t('stack.count')} value={n} min={1} max={item.quantity - 1} onChange={(v) => setN(Math.floor(v))} />
            <button className="btn" onClick={() => run(splitStack(c, item.id, n, to))}>
              {t('stack.split', { n, name: findContainer(c, to)?.name ?? '' })}
            </button>
          </div>
        )}
        {merges.length > 0 && (
          <div className="row merges">
            {merges.map((m) => (
              <button key={m.id} className="btn" onClick={() => run(mergeStacks(c, item.id, m.id))} disabled={!canMerge(c, item, m)}>
                {t('stack.mergeInto', { n: m.quantity, name: containerOf(c, m)?.name ?? '' })}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** The character's choices for the Gear list: grouping and which details a row shows. */
function GearDisplay({ api }: { api: SheetApi }) {
  const g = api.c.preferences.gear
  const set = (patch: Partial<GearPrefs>) => api.update((x) => ({ ...x, preferences: { ...x.preferences, gear: { ...x.preferences.gear, ...patch } } }))
  return (
    <details className="gear-display">
      <summary>{t('gearPrefs.title')}</summary>
      <Select label={t('gearPrefs.groupBy')} value={g.groupBy} options={GEAR_GROUPINGS.map((v) => ({ value: v, label: t(`gearPrefs.group.${v}`) }))} onChange={(groupBy) => set({ groupBy })} />
      <div className="checks">
        {GEAR_SHOW_FIELDS.map((f) => (
          <Check key={f} label={t(`gearPrefs.show.${f}`)} checked={g.show[f]} onChange={(on) => set({ show: { ...g.show, [f]: on } })} />
        ))}
      </div>
    </details>
  )
}

/** Built-in categories can be renamed (and reset); the player's own can be added, renamed and deleted. */
function CategoriesEditor({ api }: { api: SheetApi }) {
  const { c } = api
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const own = (id: string) => c.inventory.categories.some((x) => x.id === id)
  return (
    <details className="categories-editor">
      <summary>{t('cat.title')}</summary>
      <ul className="cat-list">
        {categoryList(c).map((k) => (
          <li key={k.id}>
            <input className="cat-icon" aria-label={t('box.icon')} value={k.icon ?? ''} onChange={(e) => api.update((x) => updateCategory(x, k.id, { icon: e.target.value || undefined }))} />
            <input aria-label={t('common.name')} value={k.name} onChange={(e) => api.update((x) => updateCategory(x, k.id, { name: e.target.value }))} />
            {own(k.id) && (
              <button className="mini-btn" onClick={() => api.update((x) => deleteCategory(x, k.id))}>
                {isBuiltinCategory(k.id) ? t('cat.reset') : t('common.delete')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <TextField label={t('box.icon')} value={icon} onChange={setIcon} />
        <TextField label={t('common.name')} value={name} onChange={setName} />
        <button
          className="btn btn-small"
          disabled={!name.trim()}
          onClick={() => {
            api.update((x) => addCategory(x, { name, icon }).character)
            setName('')
            setIcon('')
          }}
        >
          + {t('common.add')}
        </button>
      </div>
    </details>
  )
}

export interface ItemGroup {
  id: string
  label: string
  items: Item[]
}

/** The item list in groups, as the character's preferences ask: by container (their order), by category (their order), or one group. */
export function groupItems(c: SheetApi['c'], category: (i: Item) => { id: string; name: string; icon?: string }): ItemGroup[] {
  const items = c.inventory.items
  const by = c.preferences.gear.groupBy
  if (by === 'none') return [{ id: 'all', label: '', items }]
  if (by === 'container')
    return c.inventory.containers
      .map((k) => ({ id: k.id, label: boxLabel(k), items: itemsIn(c, k.id) }))
      .filter((g) => g.items.length > 0)
  return categoryList(c)
    .map((k) => ({ id: k.id, label: boxLabel(k), items: items.filter((i) => category(i).id === k.id) }))
    .filter((g) => g.items.length > 0)
}

/** Under a bag item's name: what is in it. */
export const bagOf = (c: SheetApi['c'], i: Item) => {
  const k = containerForItem(c, i.id)
  return k && itemOfContainer(c, k) ? k : undefined
}
