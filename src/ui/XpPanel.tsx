// Experience: the session's XP for the whole group, split between the players; the total; how far
// to the next level; the log with Undo of the last entry; a hand correction. Lives on the Level Up
// tab (after a session, never in the way during a fight). The level itself is raised with Level Up.
import { useState } from 'react'
import { t } from '../i18n'
import { addSessionXp, correctXp, setPartySize, splitXp, undoLastXp, xpProgress } from '../model/xp'
import { fmtXp } from './progressText'
import type { SheetApi } from './Sheet'

export function XpPanel({ api }: { api: SheetApi }) {
  const { c, update, toast } = api
  const [group, setGroup] = useState('')
  const [fix, setFix] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const p = xpProgress(c)
  const groupXp = Math.max(0, Math.floor(Number(group) || 0))
  const { share, rest } = splitXp(groupXp, c.partySize)
  const last = c.xpLog[c.xpLog.length - 1]

  const add = () => {
    if (share <= 0) return
    const before = p.levelsReady
    const next = addSessionXp(c, groupXp)
    update(() => next)
    const ready = xpProgress(next).levelsReady
    toast({
      title: t('xp.added', { n: fmtXp(share) }),
      lines: [t('xp.total', { n: fmtXp(next.xp) }), ...(ready > before ? [ready === 1 ? t('xp.readyOne') : t('xp.readyMany', { n: ready })] : [])],
      tone: ready > before ? 'good' : 'info',
    })
    setGroup('')
  }
  const undo = () => {
    if (!last) return
    update((x) => undoLastXp(x))
    toast({ title: t('xp.undone', { n: fmtXp(Math.abs(last.amount)), sign: last.amount >= 0 ? '−' : '+' }) })
  }

  return (
    <section className="panel xp-panel" aria-labelledby="xp-title">
      <div className="xp-head">
        <h3 id="xp-title">{t('xp.title')}</h3>
        <span className="xp-total">
          <b>{fmtXp(p.xp)}</b> XP
        </span>
      </div>

      {p.next !== null && !p.belowLevel && (
        <div className={`xp-progress ${p.levelsReady ? 'ready' : ''}`}>
          <div className="xp-bar" role="progressbar" aria-valuemin={p.from} aria-valuemax={p.next} aria-valuenow={Math.min(p.xp, p.next)} aria-label={t('xp.toNext', { n: p.level + 1 })}>
            <span className="xp-fill" style={{ width: `${Math.round(p.fraction * 100)}%` }} />
          </div>
          <div className="xp-scale">
            <span>
              {t('xp.levelN', { n: p.level })} · {fmtXp(p.from)}
            </span>
            <span>
              {t('xp.levelN', { n: p.level + 1 })} · {fmtXp(p.next)}
            </span>
          </div>
          {p.levelsReady > 0 ? (
            <p className="xp-ready">
              <b>⇪ {p.levelsReady === 1 ? t('xp.readyOne') : t('xp.readyMany', { n: p.levelsReady })}</b> {t('xp.readyHint')}
            </p>
          ) : (
            <p className="muted xp-missing">{t('xp.missing', { n: fmtXp(p.missing), level: p.level + 1 })}</p>
          )}
        </div>
      )}
      {p.next === null && <p className="muted">{t('xp.max')}</p>}
      {p.belowLevel && <p className="warn">{t('xp.below', { xp: fmtXp(p.xp), level: p.level, need: fmtXp(p.from) })}</p>}

      <div className="xp-add">
        <label className="field">
          <span>{t('xp.session')}</span>
          <input type="number" inputMode="numeric" min={0} placeholder="0" value={group} onChange={(e) => setGroup(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </label>
        <label className="field xp-players">
          <span>{t('xp.players')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={c.partySize}
            onChange={(e) => e.target.value !== '' && update((x) => setPartySize(x, Number(e.target.value)))}
          />
        </label>
        {groupXp > 0 && (
          <p className="xp-sum" aria-live="polite">
            {fmtXp(groupXp)} ÷ {c.partySize} = <b>{fmtXp(share)}</b> {t('xp.each')}
            {rest > 0 && <span className="muted"> {t('xp.rest', { n: rest })}</span>}
            {share > 0 && <span className="muted"> · {t('xp.after', { n: fmtXp(c.xp + share) })}</span>}
          </p>
        )}
        <button className="btn btn-primary" onClick={add} disabled={share <= 0}>
          {share > 0 ? t('xp.addN', { n: fmtXp(share) }) : t('xp.add')}
        </button>
      </div>

      <div className="xp-tools">
        {last && (
          <button className="btn btn-small" onClick={undo} title={t('xp.undoTitle')}>
            ↶ {t('xp.undoLast', { sign: last.amount >= 0 ? '+' : '−', n: fmtXp(Math.abs(last.amount)) })}
          </button>
        )}
        {c.xpLog.length > 0 && (
          <button className="link-btn" onClick={() => setShowLog((s) => !s)} aria-expanded={showLog}>
            {showLog ? t('xp.hideLog') : t('xp.showLog', { n: c.xpLog.length })}
          </button>
        )}
        <span className="spacer" />
        {fix === null ? (
          <button className="link-btn" onClick={() => setFix(String(c.xp))}>
            {t('xp.correct')}
          </button>
        ) : (
          <span className="xp-fix">
            <input className="small-input" type="number" inputMode="numeric" min={0} value={fix} autoFocus onChange={(e) => setFix(e.target.value)} aria-label={t('xp.correctLabel')} />
            <button
              className="btn btn-small"
              onClick={() => {
                update((x) => correctXp(x, Number(fix)))
                setFix(null)
              }}
            >
              {t('xp.set')}
            </button>
            <button className="btn btn-small" onClick={() => setFix(null)}>
              {t('common.cancel')}
            </button>
          </span>
        )}
      </div>

      {showLog && c.xpLog.length > 0 && (
        <ol className="xp-log" reversed>
          {[...c.xpLog].reverse().map((e) => (
            <li key={e.id}>
              <span className="xp-log-date">{e.date}</span>
              <span className="xp-log-what">
                {e.kind === 'session' && e.groupXp !== undefined
                  ? t('xp.logSession', { g: fmtXp(e.groupXp), p: e.players ?? '?' })
                  : t('xp.logCorrection')}
              </span>
              <b className={e.amount < 0 ? 'danger' : 'good'}>
                {e.amount >= 0 ? '+' : '−'}
                {fmtXp(Math.abs(e.amount))}
              </b>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
