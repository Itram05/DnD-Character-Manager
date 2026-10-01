// Gear tab, inventory rework stage 5: the player's crafting recipes and the counters pinned to Play.
// The model is crafting.ts; this file only shows it and calls it. Craft is one api.update, so one Undo (↶)
// takes back the whole craft: the materials, the made item and the remembered container.
import { useState } from 'react'
import { t } from '../i18n'
import { categoryList } from '../model/categories'
import {
  RECIPE_EXAMPLES,
  blankRecipe,
  countOf,
  counterViews,
  craft,
  craftStatus,
  deleteRecipe,
  isPinned,
  movePin,
  nameKey,
  outputHome,
  recipeFromExample,
  saveRecipe,
  togglePin,
  type PartStatus,
} from '../model/crafting'
import { findContainer } from '../model/containers'
import type { Item, ItemTemplate, Recipe } from '../model/types'
import { Modal, NumberField, Select, TextArea, TextField } from './common'
import { boxLabel } from './ContainersPanel'
import { EditorFrame } from './editors'
import type { SheetApi } from './Sheet'

const qty = (n: number) => String(Math.round(n * 1000) / 1000)
/** "2 Moonpetal" */
const partText = (p: { name: string; quantity: number }) => `${qty(p.quantity)} ${p.name}`
const missingText = (m: PartStatus[]) => m.map((p) => t('craft.short', { n: qty(p.short), name: p.name })).join(', ')

/** Every item name in the inventory, once, for the name fields' suggestions. */
function NameList({ id, items }: { id: string; items: Item[] }) {
  const names = [...new Map(items.map((i) => [nameKey(i.name), i.name.trim()])).values()].filter(Boolean)
  return (
    <datalist id={id}>
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  )
}

export function CraftingPanel({ api }: { api: SheetApi }) {
  const { c } = api
  const [edit, setEdit] = useState<Recipe | null>(null)
  const [crafting, setCrafting] = useState<string | null>(null)
  const recipe = crafting ? c.recipes.find((r) => r.id === crafting) : undefined
  return (
    <>
      <section className="panel crafting" id="gear-crafting">
        <h3>
          {t('craft.title')}
          <button className="btn btn-small" onClick={() => setEdit(blankRecipe())}>
            + {t('craft.newRecipe')}
          </button>
        </h3>
        <div className="row craft-examples">
          <Select
            label={t('craft.fromExample')}
            value=""
            options={[{ value: '', label: '—' }, ...Object.entries(RECIPE_EXAMPLES).map(([k, r]) => ({ value: k, label: r.name }))]}
            onChange={(k) => k && setEdit(recipeFromExample(k))}
          />
        </div>
        {c.recipes.length === 0 ? <p className="muted">{t('craft.none')}</p> : null}
        <ul className="recipe-list">
          {c.recipes.map((r) => {
            const s = craftStatus(c, r)
            return (
              <li key={r.id} className={s.max > 0 ? 'can' : 'cannot'}>
                <div className="recipe-head">
                  <button className="link-btn recipe-name" onClick={() => setEdit(r)}>
                    {r.name}
                  </button>
                  <span className={`tag ${s.max > 0 ? 'craft-can' : 'craft-cannot'}`}>{s.max === Infinity ? t('craft.always') : s.max > 0 ? t('craft.canMake', { n: s.max }) : t('craft.cannot')}</span>
                  <button className="btn btn-small btn-primary" onClick={() => setCrafting(r.id)}>
                    {t('craft.craft')}
                  </button>
                </div>
                <div className="recipe-parts muted">
                  {s.parts.map((p, i) => (
                    <span key={i} className={p.short > 0 ? 'part short' : 'part'}>
                      {partText({ name: p.name, quantity: p.need })} <small>({qty(p.have)})</small>
                    </span>
                  ))}
                  <span className="part out">→ {partText(r.output)}</span>
                </div>
                {s.missing.length > 0 && <div className="warn recipe-missing">{t('craft.missing', { list: missingText(s.missing) })}</div>}
              </li>
            )
          })}
        </ul>
        <p className="hint">{t('craft.hint')}</p>
      </section>
      <CountersAdmin api={api} />
      {edit && <RecipeEditor api={api} initial={edit} onClose={() => setEdit(null)} />}
      {recipe && <CraftDialog api={api} recipe={recipe} onClose={() => setCrafting(null)} />}
    </>
  )
}

/** Which items are counters in Play: their order, unpin, pin by name. Pinning is also on each item row (⌖). */
function CountersAdmin({ api }: { api: SheetApi }) {
  const { c, update } = api
  const [name, setName] = useState('')
  const views = counterViews(c)
  return (
    <section className="panel counters-admin" id="gear-counters">
      <h3>{t('counter.title')}</h3>
      <p className="hint">{t('counter.hint')}</p>
      {views.length === 0 ? (
        <p className="muted">{t('counter.none')}</p>
      ) : (
        <ul className="counter-admin-list">
          {views.map((v, i) => (
            <li key={nameKey(v.counter.name)}>
              <span className="counter-name">{v.label}</span>
              <span className="qty">×{qty(v.count)}</span>
              <button className="mini-btn" disabled={i === 0} onClick={() => update((x) => movePin(x, v.counter.name, -1))} aria-label={t('counter.up', { name: v.label })}>
                ↑
              </button>
              <button className="mini-btn" disabled={i === views.length - 1} onClick={() => update((x) => movePin(x, v.counter.name, 1))} aria-label={t('counter.down', { name: v.label })}>
                ↓
              </button>
              <button className="mini-btn" onClick={() => update((x) => togglePin(x, v.counter.name))} aria-label={t('counter.unpin', { name: v.label })} title={t('counter.unpin', { name: v.label })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <TextField label={t('counter.pinByName')} value={name} list="counter-names" onChange={setName} />
        <NameList id="counter-names" items={c.inventory.items} />
        <button
          className="btn btn-small"
          disabled={!nameKey(name) || isPinned(c, name)}
          onClick={() => {
            update((x) => togglePin(x, name))
            setName('')
          }}
        >
          + {t('counter.pin')}
        </button>
      </div>
    </section>
  )
}

/** Craft ×N: how many times, what it takes and what is missing, where the output goes. One update = one Undo. */
export function CraftDialog({ api, recipe, onClose }: { api: SheetApi; recipe: Recipe; onClose: () => void }) {
  const { c } = api
  const max = craftStatus(c, recipe).max
  const [n, setN] = useState(1)
  const [to, setTo] = useState(recipe.containerId && findContainer(c, recipe.containerId) ? recipe.containerId : outputHome(c, recipe))
  const s = craftStatus(c, recipe, n)
  const amountOk = Number.isInteger(n) && n >= 1
  const run = () => {
    const r = craft(c, recipe.id, n, to)
    if (!r.ok) return
    api.update(() => r.character)
    api.toast({
      title: t('craft.done', { n: qty(r.made.quantity), name: r.made.name }),
      lines: [
        t('craft.into', { name: findContainer(c, r.made.containerId)?.name ?? '' }),
        ...(r.used.length ? [t('craft.used', { list: r.used.map(partText).join(', ') })] : []),
        t('craft.undoHint'),
      ],
      tone: 'good',
    })
    onClose()
  }
  return (
    <Modal
      title={t('craft.dialogTitle', { name: recipe.name })}
      onClose={onClose}
      className="craft-dialog"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!amountOk || s.missing.length > 0} onClick={run}>
            {t('craft.craftN', { n: amountOk ? n : '?' })}
          </button>
        </>
      }
    >
      <div className="editor">
        {(recipe.time || recipe.tool || recipe.dc) && (
          <dl className="spell-meta craft-meta">
            {recipe.time && (
              <>
                <dt>{t('craft.time')}</dt>
                <dd>{recipe.time}</dd>
              </>
            )}
            {recipe.tool && (
              <>
                <dt>{t('craft.tool')}</dt>
                <dd>{recipe.tool}</dd>
              </>
            )}
            {recipe.dc && (
              <>
                <dt>{t('craft.dc')}</dt>
                <dd>{recipe.dc}</dd>
              </>
            )}
          </dl>
        )}
        {recipe.note && <p className="hint">{recipe.note}</p>}
        <div className="row">
          <NumberField label={t('craft.times')} value={n} min={1} onChange={(v) => setN(Math.floor(v))} />
          <span className="muted craft-max">{max === Infinity ? t('craft.always') : max > 0 ? t('craft.canMake', { n: max }) : t('craft.cannot')}</span>
          {max !== Infinity && max > 1 && (
            <button className="btn btn-small" onClick={() => setN(max)}>
              {t('craft.max', { n: max })}
            </button>
          )}
        </div>
        {s.parts.length > 0 && (
          <table className="craft-parts">
            <thead>
              <tr>
                <th>{t('craft.input')}</th>
                <th>{t('craft.need')}</th>
                <th>{t('craft.have')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.parts.map((p, i) => (
                <tr key={i} className={p.short > 0 ? 'short' : ''}>
                  <td>{p.name}</td>
                  <td>{qty(p.need)}</td>
                  <td>{qty(p.have)}</td>
                  <td>{p.short > 0 ? t('craft.shortN', { n: qty(p.short) }) : '✓'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.missing.length > 0 && (
          <p className="warn" role="alert">
            {t('craft.missing', { list: missingText(s.missing) })}
          </p>
        )}
        <div className="row">
          <span>{t('craft.makes', { n: qty(recipe.output.quantity * (amountOk ? n : 1)), name: recipe.output.name })}</span>
          <Select label={t('craft.intoContainer')} value={to} options={c.inventory.containers.map((k) => ({ value: k.id, label: boxLabel(k) }))} onChange={setTo} />
        </div>
      </div>
    </Modal>
  )
}

/** The fields of one stack never go into a template. */
function templateOf(i: Item): ItemTemplate {
  const { id: _id, name: _n, quantity: _q, containerId: _k, equipped: _e, attuned: _a, ...rest } = structuredClone(i)
  void [_id, _n, _q, _k, _e, _a]
  return rest
}

function RecipeEditor({ api, initial, onClose }: { api: SheetApi; initial: Recipe; onClose: () => void }) {
  const { c } = api
  const [r, setR] = useState(initial)
  const exists = c.recipes.some((x) => x.id === r.id)
  const tpl = r.output.template
  const setTpl = (patch: ItemTemplate | undefined) => setR({ ...r, output: { ...r.output, template: patch } })
  const setInput = (i: number, patch: Partial<Recipe['inputs'][number]>) => setR({ ...r, inputs: r.inputs.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const categories = categoryList(c)
  // what the template has besides the three fields edited here (copied from an item)
  const extra = tpl ? Object.keys(tpl).filter((k) => !['category', 'weight', 'description'].includes(k)) : []
  const save = () => {
    api.update((x) => saveRecipe(x, r))
    onClose()
  }
  return (
    <EditorFrame
      title={exists ? t('craft.editRecipe') : t('craft.newRecipe')}
      onClose={onClose}
      onSave={save}
      canSave={!!(r.name.trim() || r.output.name.trim())}
      onDelete={exists ? () => (api.update((x) => deleteRecipe(x, r.id)), onClose()) : undefined}
    >
      <TextField label={t('common.name')} value={r.name} placeholder="Potion of Healing" onChange={(name) => setR({ ...r, name })} />
      <NameList id="recipe-names" items={c.inventory.items} />
      <fieldset className="recipe-inputs">
        <legend>{t('craft.inputs')}</legend>
        {r.inputs.map((p, i) => (
          <div className="row recipe-input" key={i}>
            <TextField label={t('craft.item')} value={p.name} list="recipe-names" onChange={(name) => setInput(i, { name })} />
            <NumberField label={t('craft.amount')} value={p.quantity} min={0} onChange={(quantity) => setInput(i, { quantity })} />
            <span className="muted">{t('craft.youHave', { n: qty(countOf(c, p.name)) })}</span>
            <button className="mini-btn" onClick={() => setR({ ...r, inputs: r.inputs.filter((_, j) => j !== i) })} aria-label={t('craft.removeInput')} title={t('craft.removeInput')}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-small" onClick={() => setR({ ...r, inputs: [...r.inputs, { name: '', quantity: 1 }] })}>
          + {t('craft.addInput')}
        </button>
      </fieldset>
      <fieldset className="recipe-output">
        <legend>{t('craft.output')}</legend>
        <div className="row">
          <TextField label={t('craft.item')} value={r.output.name} placeholder={r.name} list="recipe-names" onChange={(name) => setR({ ...r, output: { ...r.output, name } })} />
          <NumberField label={t('craft.amount')} value={r.output.quantity} min={0} onChange={(quantity) => setR({ ...r, output: { ...r.output, quantity } })} />
        </div>
        <details className="recipe-template" open={!!tpl}>
          <summary>{t('craft.template')}</summary>
          <p className="hint">{t('craft.templateHint')}</p>
          <div className="grid-3">
            <Select
              label={t('item.category')}
              value={tpl?.category ?? ''}
              options={[{ value: '', label: '—' }, ...categories.map((k) => ({ value: k.id, label: boxLabel(k) }))]}
              onChange={(category) => setTpl({ ...tpl, category: category || undefined })}
            />
            <NumberField label={t('item.weight')} value={tpl?.weight ?? 0} min={0} step={0.5} onChange={(weight) => setTpl({ ...tpl, weight: weight || undefined })} />
            <Select
              label={t('craft.copyFrom')}
              value=""
              options={[{ value: '', label: '—' }, ...c.inventory.items.map((i) => ({ value: i.id, label: i.name }))]}
              onChange={(id) => {
                const i = c.inventory.items.find((x) => x.id === id)
                if (i) setTpl(templateOf(i))
              }}
            />
          </div>
          <TextArea label={t('common.description')} rows={3} value={tpl?.description ?? ''} onChange={(description) => setTpl({ ...tpl, description: description || undefined })} />
          {extra.length > 0 && <p className="muted">{t('craft.templateAlso', { list: extra.join(', ') })}</p>}
          {tpl && (
            <button className="btn btn-small" onClick={() => setTpl(undefined)}>
              {t('craft.templateClear')}
            </button>
          )}
        </details>
      </fieldset>
      <div className="grid-3">
        <TextField label={t('craft.time')} value={r.time ?? ''} placeholder="1 day" onChange={(time) => setR({ ...r, time })} />
        <TextField label={t('craft.tool')} value={r.tool ?? ''} placeholder="Herbalism Kit" onChange={(tool) => setR({ ...r, tool })} />
        <TextField label={t('craft.dc')} value={r.dc ?? ''} placeholder="DC 15 Wisdom (Medicine)" onChange={(dc) => setR({ ...r, dc })} />
      </div>
      <TextArea label={t('craft.note')} rows={2} value={r.note ?? ''} onChange={(note) => setR({ ...r, note })} />
      <p className="hint">{t('craft.editorHint')}</p>
    </EditorFrame>
  )
}
