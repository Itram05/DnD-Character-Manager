// Day timers on the Play screen, under the hands: countdowns in days, fewest days first. A Long Rest
// takes 1 day off (rest.ts); "Days pass" takes several off (travel). A timer at 0 is marked as ended
// and stays until deleted or restarted.
import { useState } from 'react'
import { t } from '../i18n'
import { addTimer, editTimer, nudgeTimer, passDays, removeTimer, restartTimer, sortedTimers } from '../model/timers'
import type { DayTimer } from '../model/types'
import { Modal, NumberField, TextField } from './common'
import { daysText, timerLines } from './progressText'
import type { SheetApi } from './Sheet'

export function TimersPanel({ api, id }: { api: SheetApi; id: string }) {
  const { c, update, toast } = api
  const [editing, setEditing] = useState<DayTimer | 'new' | null>(null)
  const [pass, setPass] = useState('')
  const timers = sortedTimers(c.timers)
  const running = c.timers.filter((x) => x.days > 0).length
  const n = Math.max(0, Math.floor(Number(pass) || 0))

  const passN = () => {
    if (!n) return
    const r = passDays(c, n)
    update(() => r.character)
    toast({ title: t('days.passed', { n: daysText(n) }), lines: [...timerLines(r.changes), t('days.undoHint')], tone: r.changes.some((x) => x.ended) ? 'bad' : 'info' })
    setPass('')
  }

  return (
    <section id={id} className="panel timers nav-target" aria-labelledby={`${id}-title`}>
      <div className="timers-head">
        <h3 id={`${id}-title`}>
          {t('days.title')} {c.timers.length > 0 && <span className="muted">({c.timers.length})</span>}
        </h3>
        <button className="btn btn-small" onClick={() => setEditing('new')}>
          + {t('days.add')}
        </button>
      </div>

      {timers.length === 0 ? (
        <p className="hint">{t('days.empty')}</p>
      ) : (
        <ul className="timer-list">
          {timers.map((tm) => {
            const ended = tm.days <= 0
            return (
              <li key={tm.id} className={`timer ${ended ? 'ended' : tm.days <= 3 ? 'soon' : ''}`}>
                <button className="timer-name" onClick={() => setEditing(tm)} title={t('days.edit')}>
                  <b>{tm.name}</b>
                  {tm.note && <span className="muted timer-note">{tm.note}</span>}
                </button>
                {ended ? (
                  <span className="timer-ended">{t('days.ended')}</span>
                ) : (
                  <span className="timer-days">
                    <b>{tm.days}</b> <span className="muted">{tm.days === 1 ? t('days.dayWord') : t('days.daysWord')}</span>
                  </span>
                )}
                <span className="timer-btns">
                  {ended ? (
                    <>
                      <button className="btn btn-small" onClick={() => update((x) => restartTimer(x, tm.id))} title={t('days.restartTitle', { n: tm.start })} disabled={tm.start <= 0}>
                        {t('days.restart')}
                      </button>
                      <button className="btn btn-small btn-danger" onClick={() => update((x) => removeTimer(x, tm.id))}>
                        {t('common.delete')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="mini-btn" onClick={() => update((x) => nudgeTimer(x, tm.id, -1))} aria-label={t('days.minus', { name: tm.name })}>
                        −
                      </button>
                      <button className="mini-btn" onClick={() => update((x) => nudgeTimer(x, tm.id, 1))} aria-label={t('days.plus', { name: tm.name })}>
                        +
                      </button>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {running > 0 && (
        <div className="days-pass">
          <span className="muted">{t('days.passLabel')}</span>
          <input className="small-input" type="number" inputMode="numeric" min={1} placeholder="10" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && passN()} aria-label={t('days.passLabel')} />
          <button className="btn btn-small" onClick={passN} disabled={!n}>
            {t('days.pass')}
          </button>
          <span className="hint">{t('days.longRestHint')}</span>
        </div>
      )}

      {editing && <TimerEditor api={api} timer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function TimerEditor({ api, timer, onClose }: { api: SheetApi; timer: DayTimer | null; onClose: () => void }) {
  const { update } = api
  const [name, setName] = useState(timer?.name ?? '')
  const [days, setDays] = useState(timer?.days ?? 7)
  const [note, setNote] = useState(timer?.note ?? '')
  const save = () => {
    if (!name.trim()) return
    update((x) => (timer ? editTimer(x, timer.id, { name, days, note }) : addTimer(x, { name, days, note })))
    onClose()
  }
  return (
    <Modal
      title={timer ? t('days.editTitle') : t('days.newTitle')}
      onClose={onClose}
      footer={
        <>
          {timer && (
            <button
              className="btn btn-danger left"
              onClick={() => {
                update((x) => removeTimer(x, timer.id))
                onClose()
              }}
            >
              {t('common.delete')}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <TextField label={t('days.name')} value={name} placeholder={t('days.namePlaceholder')} onChange={setName} />
      <NumberField label={t('days.daysLeft')} value={days} min={0} onChange={(v) => setDays(Math.max(0, Math.floor(v)))} />
      <TextField label={t('days.note')} value={note} placeholder={t('days.notePlaceholder')} onChange={setNote} />
      <p className="hint">{t('days.editorHint')}</p>
    </Modal>
  )
}
