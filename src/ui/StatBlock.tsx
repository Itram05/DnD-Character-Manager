// A creature's stat block, for reading (the editor is CreatureEditor.tsx). The same block is shown in a
// creature's panel in Play (with that creature's uses as dots) and on the Creatures tab (no creature: the
// limits are text). Laid out for a phone first: three chips, the six abilities in one row, then the lines of
// the block as short boxes grouped the way a stat block prints them.
import { t } from '../i18n'
import { actionNumbers, actionUses, canRoll, creatureInitiative, creatureMod, creatureNumber, creatureSave, rollAction } from '../model/creatures'
import { ABILITIES, CREATURE_TEXT_FIELDS, type Activation, type Character, type Creature, type CreatureAction, type CreatureInstance } from '../model/types'
import { Pips, RichText, fmtMod, type ToastMsg } from './common'

/** The sections of a stat block, in the order it prints them. Free and special lines share the last one. */
const GROUPS: { key: string; of: Activation[] }[] = [
  { key: 'traits', of: ['passive'] },
  { key: 'actions', of: ['action'] },
  { key: 'bonus', of: ['bonus'] },
  { key: 'reactions', of: ['reaction'] },
  { key: 'other', of: ['free', 'special'] },
]

/** "+10 to hit · 2d10+7 Piercing" and "DEX save DC 18": the numbers of one action, as short texts. */
export function actionLine(c: Character, a: CreatureAction): string[] {
  const n = actionNumbers(c, a)
  const out: string[] = []
  if (n.toHit) out.push(t('creature.toHit', { n: n.toHit }))
  if (n.saveDc !== undefined || n.saveAbility)
    out.push(n.saveAbility ? t('creature.saveLine', { ability: t(`ability.${n.saveAbility}`), dc: Number.isNaN(n.saveDc ?? NaN) ? '?' : String(n.saveDc) }) : t('creature.dcLine', { dc: Number.isNaN(n.saveDc ?? NaN) ? '?' : String(n.saveDc) }))
  if (n.damage) out.push([n.damage, n.damageType].filter(Boolean).join(' '))
  else if (n.damageType) out.push(n.damageType)
  return out
}

/** What the Roll button says: one toast. */
export function rollToast(c: Character, creatureName: string, a: CreatureAction, rng?: () => number): Omit<ToastMsg, 'id'> {
  const r = rollAction(c, a, rng)
  const lines: string[] = []
  if (r.attack) lines.push(t(r.attack.d20 === 20 ? 'creature.rollHit20' : r.attack.d20 === 1 ? 'creature.rollHit1' : 'creature.rollHit', { total: r.attack.total, d20: r.attack.d20, bonus: fmtMod(r.attack.bonus) }))
  if (r.damage) lines.push(t('creature.rollDamage', { total: r.damage.total, type: a.damageType ? ` ${a.damageType}` : '', detail: r.damage.detail }))
  if (a.saveDc !== undefined) {
    const dc = creatureNumber(c, a.saveDc)
    lines.push(a.saveAbility ? t('creature.saveLine', { ability: t(`ability.${a.saveAbility}`), dc: Number.isNaN(dc) ? '?' : String(dc) }) : t('creature.dcLine', { dc: Number.isNaN(dc) ? '?' : String(dc) }))
  }
  return { title: `${creatureName}: ${a.name}`, lines, tone: r.critical ? 'good' : 'info' }
}

export function StatBlock(props: {
  c: Character
  creature: Creature
  /** The creature in play whose uses are shown as dots. Without it the limits are text. */
  instance?: CreatureInstance
  onSpend?: (actionId: string, delta: number) => void
  /** The Roll button of an action. Absent = no button (the preference, or a place where it makes no sense). */
  onRoll?: (a: CreatureAction) => void
  /** The top row (AC, speed, Initiative) is left out when the caller shows it itself. */
  noChips?: boolean
}) {
  const { c, creature: k, instance } = props
  const ac = creatureNumber(c, k.ac)
  const hp = creatureNumber(c, k.hp)
  const texts = CREATURE_TEXT_FIELDS.filter((f) => k[f])
  return (
    <div className="statblock">
      {!props.noChips && (
        <div className="sb-chips">
          <div className="sb-chip">
            <span>{t('vitals.ac')}</span>
            <b>{Number.isNaN(ac) ? '?' : ac}</b>
          </div>
          {!instance && (
            <div className="sb-chip">
              <span>{t('hp.hp')}</span>
              <b>{Number.isNaN(hp) ? '?' : hp}</b>
            </div>
          )}
          <div className="sb-chip">
            <span>{t('creature.initiative')}</span>
            <b>{fmtMod(creatureInitiative(k))}</b>
          </div>
          <div className="sb-chip sb-chip-wide">
            <span>{t('vitals.speed')}</span>
            <b>{k.speed || '—'}</b>
          </div>
        </div>
      )}
      {k.hitDice && <p className="sb-hitdice muted">{t('creature.hitDiceLine', { dice: k.hitDice })}</p>}
      <div className="sb-abilities" role="group" aria-label={t('stats.abilities')}>
        {ABILITIES.map((a) => (
          <div key={a} className="sb-ability">
            <span className="sb-ab-name">{t(`ability.${a}`)}</span>
            <b>{k.abilities[a]}</b>
            <span className="sb-ab-mod">{fmtMod(creatureMod(k, a))}</span>
            <span className={`sb-ab-save ${k.saves?.[a] !== undefined ? 'own' : ''}`} title={t('creature.saveOf', { ability: t(`ability.long.${a}`) })}>
              {fmtMod(creatureSave(k, a))}
            </span>
          </div>
        ))}
      </div>
      <p className="sb-legend muted">
        {t('creature.abilityLegend')} <span className="sb-ab-save own">{t('creature.abilityLegendSave')}</span>
      </p>
      {(texts.length > 0 || !!k.extra?.length) && (
        <dl className="sb-lines">
          {texts.map((f) => (
            <div key={f}>
              <dt>{t(`creature.field.${f}`)}</dt>
              <dd>{k[f]}</dd>
            </div>
          ))}
          {k.extra?.map((x, i) => (
            <div key={`x${i}`} className="sb-extra">
              <dt>{x.label || t('creature.extraNoLabel')}</dt>
              <dd>{x.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {GROUPS.map((g) => {
        const list = k.actions.filter((a) => g.of.includes(a.activation))
        if (!list.length) return null
        return (
          <section key={g.key} className={`sb-group sb-group-${g.key}`}>
            <h4 className="sb-group-title">{t(`creature.group.${g.key}`)}</h4>
            {list.map((a) => {
              const nums = actionLine(c, a)
              const uses = instance ? actionUses(c, a, instance) : undefined
              const spent = !!uses && uses.max > 0 && uses.left === 0
              return (
                <div key={a.id} className={`sb-act ${spent ? 'spent' : ''}`}>
                  <div className="sb-act-top">
                    <b className="sb-act-name">{a.name}</b>
                    {g.key === 'other' && <span className="tag">{t(`act.${a.activation}`)}</span>}
                    {nums.length > 0 && <span className="sb-act-nums">{nums.join(' · ')}</span>}
                    {props.onRoll && canRoll(c, a) && (
                      <button className="btn btn-small sb-roll" onClick={() => props.onRoll!(a)} aria-label={t('creature.rollOf', { name: a.name })}>
                        {t('creature.roll')}
                      </button>
                    )}
                  </div>
                  {a.uses && (
                    <div className="sb-act-uses">
                      {uses && uses.max > 0 ? (
                        <Pips max={uses.max} left={uses.left} size="sm" onSpend={props.onSpend && (() => props.onSpend!(a.id, 1))} onRestore={props.onSpend && (() => props.onSpend!(a.id, -1))} label={t('creature.usesOf', { name: a.name, left: uses.left, max: uses.max })} />
                      ) : (
                        <span className="tag">{t('creature.usesMax', { n: String(a.uses.max) })}</span>
                      )}
                      <span className="muted">{a.uses.note || t(`recharge.${a.uses.recharge}`)}</span>
                    </div>
                  )}
                  <RichText text={a.description} />
                </div>
              )
            })}
          </section>
        )
      })}
      {k.description && (
        <section className="sb-group sb-notes">
          <h4 className="sb-group-title">{t('creature.notes')}</h4>
          <RichText text={k.description} />
        </section>
      )}
    </div>
  )
}
