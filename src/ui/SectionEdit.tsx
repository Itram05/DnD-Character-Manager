// "Edit" on a section of the Play screen (2026-10-11; asked for by the owner and by a player of the group).
// The small button opens a window with exactly what the section holds: each entry opens its own editor on
// the spot (the same editors the tabs use), "Add" makes a new one of that kind, and a last button goes to
// the tab where the whole list lives, scrolled to its place. Nothing here is a second way to store anything:
// every change goes through the editors and `update`, so Undo works as everywhere.
import { useState } from 'react'
import { t } from '../i18n'
import { counterViews, nameKey, togglePin } from '../model/crafting'
import { attackInPlay, itemInPlay, type Zone } from '../model/play'
import { playPrefs } from '../model/prefs'
import { attackStats, exhaustionEffects, spellSlots, usesMax } from '../model/rules'
import type { Activation, Attack, Character, Feature, Item, Spell } from '../model/types'
import { Check, Modal, fmtMod } from './common'
import { AttackEditor, FeatureEditor, ItemEditor, SpellEditor, blankAttack, blankFeature, blankItem, blankSpell } from './editors'
import type { SheetApi, Tab } from './Sheet'

/** One thing a section holds, by id (looked up again on every render, so the window never shows a stale copy). */
export type EntryRef = { kind: 'attack' | 'feature' | 'spell' | 'item'; id: string } | { kind: 'counter'; name: string }
export type AddKind = 'attack' | 'feature' | 'spell' | 'item'

export interface SectionSpec {
  /** The section's own title ("Attacks", "Always on"). */
  title: string
  entries: EntryRef[]
  /** What "Add" makes. Absent = no Add button. */
  add?: AddKind
  /** For a new feature: the hand it is added to ("passive" for Always on). */
  activation?: Activation
  /** The tab where the whole list lives, and the id of the place in it. */
  tab: Tab
  anchor?: string
  /** The spell slots section: the window also has the "my own number of slots" editor. */
  slots?: boolean
  /** The attacks section: rows can be moved up and down (the order of the cards, see preferences.play.attackOrder). */
  reorder?: boolean
}

/** The small Edit button of a section. Hidden when the character's preference says so. */
export function EditMark({ api, section, onClick }: { api: SheetApi; section: string; onClick: () => void }) {
  if (!playPrefs(api.c).editButtons) return null
  return (
    <button
      className="section-edit"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={t('section.editOf', { name: section })}
      title={t('section.editOf', { name: section })}
    >
      <span aria-hidden="true">✎</span> {t('common.edit')}
    </button>
  )
}

/** Moves an attack one place up or down in `attacks` (the order of the attack cards when it is "as I listed them"). */
export function moveAttack(c: Character, id: string, d: -1 | 1): Character {
  const i = c.attacks.findIndex((a) => a.id === id)
  const j = i + d
  if (i < 0 || j < 0 || j >= c.attacks.length) return c
  const attacks = [...c.attacks]
  ;[attacks[i], attacks[j]] = [attacks[j], attacks[i]]
  return { ...c, attacks }
}

/** The class tables' slots, without the character's own override. */
const tableSlots = (c: Character) => spellSlots({ ...c, spellcasting: { ...c.spellcasting, slotsOverride: undefined } })

/** "My own number of spell slots": writes spellcasting.slotsOverride (homebrew, a 2014 table, a boon); off = the class tables. */
function SlotsEditor({ api }: { api: SheetApi }) {
  const { c, update } = api
  const own = c.spellcasting.slotsOverride
  const set = (slots: number[] | undefined) =>
    update((x) => {
      const { slotsOverride: _old, ...rest } = x.spellcasting
      void _old
      return { ...x, spellcasting: slots ? { ...rest, slotsOverride: slots } : rest }
    })
  const shown = own?.length ? [...own, 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 9) : tableSlots(c)
  return (
    <fieldset className="slots-editor">
      <Check label={t('section.slotsOwn')} checked={!!own?.length} onChange={(on) => set(on ? tableSlots(c) : undefined)} />
      <div className="slots-grid">
        {shown.map((n, i) => (
          <label key={i} className="field slot-field">
            <span>{t('section.slotLevel', { n: i + 1 })}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={9}
              value={n}
              disabled={!own?.length}
              aria-label={t('play.slotLevel', { n: i + 1 })}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (e.target.value === '' || !Number.isFinite(v)) return
                set(shown.map((x, j) => (j === i ? Math.max(0, Math.min(9, Math.round(v))) : x)))
              }}
            />
          </label>
        ))}
      </div>
      <p className="hint">{t(own?.length ? 'section.slotsOwnHint' : 'section.slotsTableHint')}</p>
    </fieldset>
  )
}

type Editing = { kind: 'attack'; value: Attack } | { kind: 'feature'; value: Feature } | { kind: 'spell'; value: Spell } | { kind: 'item'; value: Item }

const ZONE_ACTIVATION: Record<Zone, Activation> = { action: 'action', bonus: 'bonus', reaction: 'reaction', other: 'free' }
export const zoneActivation = (z: Zone) => ZONE_ACTIVATION[z]

const ADD_LABEL: Record<AddKind, string> = { attack: 'attack.add', feature: 'feature.add', spell: 'spell.add', item: 'item.add' }

/** The window behind a section's Edit button. */
export function SectionEditor({ api, spec, onClose, initiallyEditing }: { api: SheetApi; spec: SectionSpec; onClose: () => void; /** For tests: the index of the entry whose editor is open. */ initiallyEditing?: number }) {
  const { c, update } = api
  const find = (e: EntryRef): Editing | undefined => {
    if (e.kind === 'attack') {
      const value = c.attacks.find((a) => a.id === e.id)
      return value && { kind: 'attack', value }
    }
    if (e.kind === 'feature') {
      const value = c.features.find((f) => f.id === e.id)
      return value && { kind: 'feature', value }
    }
    if (e.kind === 'spell') {
      const value = c.spells.find((s) => s.id === e.id)
      return value && { kind: 'spell', value }
    }
    if (e.kind === 'item') {
      const value = c.inventory.items.find((i) => i.id === e.id)
      return value && { kind: 'item', value }
    }
    return undefined
  }
  /** What was added from this window, so it shows in the list without closing it. */
  const [added, setAdded] = useState<EntryRef[]>([])
  const [editing, setEditing] = useState<Editing | null>(() => (initiallyEditing === undefined ? null : (find(spec.entries[initiallyEditing]) ?? null)))

  if (editing) {
    // closing an editor (saved, cancelled or deleted) comes back to the list
    const back = () => setEditing(null)
    if (editing.kind === 'attack') return <AttackEditor api={api} initial={editing.value} onClose={back} />
    if (editing.kind === 'feature') return <FeatureEditor api={api} initial={editing.value} onClose={back} />
    if (editing.kind === 'spell') return <SpellEditor api={api} initial={editing.value} onClose={back} />
    return <ItemEditor api={api} initial={editing.value} onClose={back} />
  }

  const add = () => {
    const made: Editing | undefined =
      spec.add === 'attack'
        ? { kind: 'attack', value: blankAttack() }
        : spec.add === 'feature'
          ? { kind: 'feature', value: { ...blankFeature(), activation: spec.activation ?? 'action' } }
          : spec.add === 'spell'
            ? { kind: 'spell', value: blankSpell() }
            : spec.add === 'item'
              ? { kind: 'item', value: blankItem() }
              : undefined
    if (!made) return
    // listed once it is saved (a cancelled one is not found, so it never shows)
    setAdded((a) => [...a, { kind: made.kind, id: made.value.id }])
    setEditing(made)
  }
  const exh = exhaustionEffects(c)
  const byName = playPrefs(c).attackOrder === 'name'
  // attacks are listed in the order of the file, all of them: that is the order this window changes
  const entries: EntryRef[] = spec.reorder ? c.attacks.map((a) => ({ kind: 'attack', id: a.id })) : [...spec.entries, ...added]
  const counters = counterViews(c)

  const row = (e: EntryRef, i: number) => {
    if (e.kind === 'counter') {
      const v = counters.find((x) => nameKey(x.counter.name) === nameKey(e.name))
      if (!v) return null
      return (
        <li key={`counter:${e.name}`}>
          <span className="se-name">{v.label}</span>
          <span className="muted se-sub">×{v.count}</span>
          <button className="btn btn-small" onClick={() => update((x) => togglePin(x, v.counter.name))}>
            {t('section.unpin')}
          </button>
        </li>
      )
    }
    const hit = find(e)
    if (!hit) return null
    let sub = ''
    let hidden = false
    if (hit.kind === 'attack') {
      const s = attackStats(c, hit.value)
      sub = `${fmtMod(s.toHit - exh.d20Penalty)} · ${hit.value.damage}${s.dmgMod ? fmtMod(s.dmgMod) : ''}`
      hidden = !attackInPlay(c, hit.value)
    } else if (hit.kind === 'feature') {
      const u = hit.value.uses
      sub = [hit.value.source.name || t(`source.${hit.value.source.type}`), u ? `${usesMax(c, u.max) - Math.min(u.used, usesMax(c, u.max))}/${usesMax(c, u.max)}` : ''].filter(Boolean).join(' · ')
    } else if (hit.kind === 'spell') {
      sub = hit.value.level === 0 ? t('card.cantrip') : t('card.spellLevel', { n: hit.value.level })
    } else {
      sub = hit.value.quantity !== 1 ? `×${hit.value.quantity}` : ''
      hidden = !itemInPlay(hit.value)
    }
    return (
      <li key={`${e.kind}:${e.id}`}>
        <button className="link-btn se-name" onClick={() => setEditing(hit)}>
          {hit.value.name || t('section.unnamed')}
        </button>
        {sub && <span className="muted se-sub">{sub}</span>}
        {hidden && <span className="tag muted">{t('section.notInPlay')}</span>}
        {spec.reorder && hit.kind === 'attack' && !byName && (
          <span className="se-move">
            <button className="mini-btn" disabled={i === 0} onClick={() => update((x) => moveAttack(x, hit.value.id, -1))} aria-label={t('section.moveUp', { name: hit.value.name })}>
              ↑
            </button>
            <button className="mini-btn" disabled={i === entries.length - 1} onClick={() => update((x) => moveAttack(x, hit.value.id, 1))} aria-label={t('section.moveDown', { name: hit.value.name })}>
              ↓
            </button>
          </span>
        )}
      </li>
    )
  }

  const rows = entries.map(row).filter(Boolean)
  return (
    <Modal
      title={t('section.editOf', { name: spec.title })}
      onClose={onClose}
      className="section-editor"
      footer={
        <>
          <button
            className="btn left"
            onClick={() => {
              onClose()
              api.go(spec.tab, spec.anchor)
            }}
          >
            {t('section.openTab', { tab: t(`tab.${spec.tab}`) })}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            {t('section.done')}
          </button>
        </>
      }
    >
      {spec.slots && <SlotsEditor api={api} />}
      {(rows.length > 0 || spec.add) && <p className="hint">{t(spec.reorder ? (byName ? 'section.hintAttacksByName' : 'section.hintAttacks') : 'section.hint')}</p>}
      {rows.length > 0 && <ul className="se-rows">{rows}</ul>}
      {spec.add && (
        <button className="btn btn-small se-add" onClick={add}>
          + {t(ADD_LABEL[spec.add])}
        </button>
      )}
    </Modal>
  )
}
