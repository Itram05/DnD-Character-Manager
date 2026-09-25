import { useState } from 'react'
import { t } from '../i18n'
import {
  abilityMod,
  attackStats,
  castingStats,
  exhaustionD20Penalty,
  passiveScore,
  savingThrow,
  savingThrowProficiencies,
  skillMod,
} from '../model/rules'
import { ABILITIES, SKILL_IDS, SKILLS, type Ability, type Attack, type SkillProficiency } from '../model/types'
import { fmtMod } from './common'
import { AttackEditor, blankAttack } from './editors'
import type { SheetApi } from './Sheet'

const NEXT: Record<SkillProficiency, SkillProficiency> = { none: 'proficient', proficient: 'expertise', expertise: 'none' }

export function StatsView({ api }: { api: SheetApi }) {
  const { c, update } = api
  const [editAttack, setEditAttack] = useState<Attack | null>(null)
  const saveProfs = savingThrowProficiencies(c)
  const exh = exhaustionD20Penalty(c)

  const cycleSkill = (s: (typeof SKILL_IDS)[number]) =>
    update((x) => ({ ...x, proficiencies: { ...x.proficiencies, skills: { ...x.proficiencies.skills, [s]: NEXT[x.proficiencies.skills[s] ?? 'none'] } } }))
  const toggleSave = (a: Ability) =>
    update((x) => {
      const cur = savingThrowProficiencies(x)
      const next = cur.includes(a) ? cur.filter((y) => y !== a) : [...cur, a]
      return { ...x, proficiencies: { ...x.proficiencies, savingThrows: next } }
    })

  return (
    <div className="stats">
      {exh > 0 && <p className="warn banner">{t('stats.exhaustionBanner', { p: exh })}</p>}

      <section className="panel abilities">
        <h3>{t('stats.abilities')}</h3>
        <div className="ability-grid">
          {ABILITIES.map((a) => (
            <div key={a} className="ability">
              <span className="ab-name">{t(`ability.${a}`)}</span>
              <span className="ab-mod">{fmtMod(abilityMod(c.abilities[a]))}</span>
              <span className="ab-score">{c.abilities[a]}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="stats-cols">
        <section className="panel saves">
          <h3>{t('stats.saves')}</h3>
          <ul className="check-list">
            {ABILITIES.map((a) => {
              const s = savingThrow(c, a)
              return (
                <li key={a}>
                  <button className={`prof-dot ${saveProfs.includes(a) ? 'prof' : ''}`} onClick={() => toggleSave(a)} aria-label={t('stats.toggleProf')} />
                  <span className="li-name">{t(`ability.long.${a}`)}</span>
                  <b>{fmtMod(s.mod)}</b>
                </li>
              )
            })}
          </ul>
          <p className="hint">{t('stats.savesHint')}</p>
        </section>

        <section className="panel skills">
          <h3>{t('stats.skills')}</h3>
          <ul className="check-list">
            {SKILL_IDS.map((s) => {
              const p = c.proficiencies.skills[s] ?? 'none'
              return (
                <li key={s}>
                  <button className={`prof-dot ${p}`} onClick={() => cycleSkill(s)} aria-label={t('stats.cycleProf')} title={t(`prof.${p}`)} />
                  <span className="li-name">
                    {t(`skill.${s}`)} <small className="muted">{t(`ability.${SKILLS[s]}`)}</small>
                  </span>
                  <b>{fmtMod(skillMod(c, s))}</b>
                </li>
              )
            })}
          </ul>
          <p className="hint">{t('stats.skillsHint')}</p>
        </section>

        <div className="stats-side">
          <section className="panel passives">
            <h3>{t('stats.passives')}</h3>
            <ul className="check-list">
              {(['perception', 'insight', 'investigation'] as const).map((s) => (
                <li key={s}>
                  <span className="li-name">{t(`skill.${s}`)}</span>
                  <b>{passiveScore(c, s)}</b>
                </li>
              ))}
            </ul>
          </section>

          {castingStats(c).length > 0 && (
            <section className="panel casting">
              <h3>{t('stats.spellcasting')}</h3>
              <table className="breakdown">
                <thead>
                  <tr>
                    <th />
                    <th>{t('stats.ability')}</th>
                    <th>{t('stats.saveDc')}</th>
                    <th>{t('stats.spellAttack')}</th>
                  </tr>
                </thead>
                <tbody>
                  {castingStats(c).map((s) => (
                    <tr key={s.classId}>
                      <td>{s.className}</td>
                      <td>{t(`ability.${s.ability}`)}</td>
                      <td>
                        <b>{s.saveDc}</b>
                      </td>
                      <td>
                        <b>{fmtMod(s.attack)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="panel profs">
            <h3>{t('stats.proficiencies')}</h3>
            <dl>
              {(['armor', 'weapons', 'tools', 'languages'] as const).map((k) =>
                c.proficiencies[k] ? (
                  <div key={k}>
                    <dt>{t(`prof.${k}`)}</dt>
                    <dd>{c.proficiencies[k]}</dd>
                  </div>
                ) : null,
              )}
              {c.proficiencies.weaponMasteries.length > 0 && (
                <div>
                  <dt>{t('prof.masteries')}</dt>
                  <dd>{c.proficiencies.weaponMasteries.join(', ')}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>

      <section className="panel attacks">
        <h3>
          {t('stats.attacks')}
          <button className="btn btn-small" onClick={() => setEditAttack(blankAttack())}>
            + {t('common.add')}
          </button>
        </h3>
        {c.attacks.length === 0 ? (
          <p className="muted">{t('stats.noAttacks')}</p>
        ) : (
          <table className="breakdown attacks-table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('card.toHit')}</th>
                <th>{t('attack.damage')}</th>
              </tr>
            </thead>
            <tbody>
              {c.attacks.map((a) => {
                const s = attackStats(c, a)
                return (
                  <tr key={a.id} onClick={() => setEditAttack(a)} className="clickable">
                    <td>
                      {a.name}
                      {a.mastery && <small className="muted"> · {a.mastery}</small>}
                    </td>
                    <td>
                      <b>{fmtMod(s.toHit)}</b>
                    </td>
                    <td>
                      {a.damage}
                      {s.dmgMod ? fmtMod(s.dmgMod) : ''} {a.damageType}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
      {editAttack && <AttackEditor api={api} initial={editAttack} onClose={() => setEditAttack(null)} />}
    </div>
  )
}
