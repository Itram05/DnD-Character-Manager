import { useState } from 'react'
import { t } from '../i18n'
import { newId } from '../model/normalize'
import type { Roleplay, SessionNote } from '../model/types'
import { Confirm, TextArea, TextField } from './common'
import type { SheetApi } from './Sheet'

const FIELDS: (keyof Roleplay)[] = ['appearance', 'personality', 'ideals', 'bonds', 'flaws', 'voice', 'mannerisms', 'goals', 'backstory', 'allies', 'notes']

export function StoryView({ api }: { api: SheetApi }) {
  const { c, update } = api
  const [editing, setEditing] = useState(false)
  const [del, setDel] = useState<string | null>(null)
  const set = (k: keyof Roleplay, v: string) => update((x) => ({ ...x, roleplay: { ...x.roleplay, [k]: v } }))
  const setNote = (id: string, patch: Partial<SessionNote>) => update((x) => ({ ...x, sessionNotes: x.sessionNotes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
  const filled = FIELDS.filter((k) => c.roleplay[k].trim())

  return (
    <div className="story">
      <div className="toolbar">
        <button className="btn" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          {editing ? t('story.done') : t('common.edit')}
        </button>
      </div>
      {editing ? (
        <section className="panel story-edit">
          {FIELDS.map((k) => (
            <TextArea key={k} label={t(`story.${k}`)} hint={t(`story.${k}.hint`)} rows={k === 'backstory' || k === 'notes' ? 8 : 3} value={c.roleplay[k]} onChange={(v) => set(k, v)} />
          ))}
        </section>
      ) : (
        <section className="panel story-read">
          <div className="who">
            <h2>{c.name}</h2>
            <p className="muted">{[c.species.name, c.background, c.alignment].filter(Boolean).join(' · ')}</p>
          </div>
          {filled.length === 0 && <p className="muted">{t('story.empty')}</p>}
          {filled.map((k) => (
            <div key={k} className={`story-block story-${k}`}>
              <h3>{t(`story.${k}`)}</h3>
              {c.roleplay[k].split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="panel sessions">
        <h3>
          {t('story.sessions')}
          <button
            className="btn btn-small"
            onClick={() =>
              update((x) => ({
                ...x,
                sessionNotes: [{ id: newId(), date: new Date().toISOString().slice(0, 10), title: t('story.sessionN', { n: x.sessionNotes.length + 1 }), text: '' }, ...x.sessionNotes],
              }))
            }
          >
            + {t('common.add')}
          </button>
        </h3>
        {c.sessionNotes.length === 0 && <p className="muted">{t('story.noSessions')}</p>}
        {c.sessionNotes.map((n) => (
          <article key={n.id} className="session-note">
            <div className="grid-2">
              <TextField label={t('story.sessionTitle')} value={n.title} onChange={(title) => setNote(n.id, { title })} />
              <label className="field">
                <span>{t('story.date')}</span>
                <input type="date" value={n.date} onChange={(e) => setNote(n.id, { date: e.target.value })} />
              </label>
            </div>
            <TextArea label={t('story.whatHappened')} rows={4} value={n.text} onChange={(text) => setNote(n.id, { text })} />
            <button className="link-btn danger" onClick={() => setDel(n.id)}>
              {t('common.delete')}
            </button>
          </article>
        ))}
      </section>
      {del && (
        <Confirm
          title={t('common.delete')}
          message={t('common.confirmDelete')}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setDel(null)}
          onConfirm={() => {
            update((x) => ({ ...x, sessionNotes: x.sessionNotes.filter((y) => y.id !== del) }))
            setDel(null)
          }}
        />
      )}
    </div>
  )
}
