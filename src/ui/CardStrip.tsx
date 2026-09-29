// The icon strip on the cards of spells, scrolls and item powers (the values come from model/strip.ts):
// how it is cast, range, area, damage and saving throw, one small icon each, in one row under the type line.
// A value that is not known is simply not there. Every icon has its meaning as a tooltip and for screen
// readers, since not all of them explain themselves. Colours: the hand colours (--z-*) for the action,
// the damage type colours (--dmg-*) for damage, the save colour of the text highlighting; all are defined
// for both themes.
import type { ReactNode } from 'react'
import { t } from '../i18n'
import { damageClass } from '../model/highlight'
import type { AreaShape, CardStrip as Strip, StripAction } from '../model/strip'
import { stripEmpty } from '../model/strip'
import { tagLabel } from './tags'

// simple shapes on a 16x16 grid, like the category icons (categoryMarks.tsx)
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ACTION_ICON: Record<StripAction, ReactNode> = {
  // the usual game shapes: a circle for an action, a triangle for a bonus action
  action: <circle cx="8" cy="8" r="5.5" fill="currentColor" />,
  bonus: <path d="M8 2.2l6.3 11H1.7z" fill="currentColor" />,
  // an arrow turning back: in answer to something
  reaction: (
    <>
      <path d="M12.8 9.2A5 5 0 1 1 8 3h3" {...stroke} />
      <path d="M9.2 0.9L11.6 3 9.2 5.1" {...stroke} />
    </>
  ),
  free: <circle cx="8" cy="8" r="5" {...stroke} />,
  special: <path d="M8 2v12M2.8 5l10.4 6M2.8 11l10.4-6" {...stroke} />,
  // a clock: a longer casting time
  time: (
    <>
      <circle cx="8" cy="8" r="6" {...stroke} />
      <path d="M8 4.5V8l2.5 1.8" {...stroke} />
    </>
  ),
}

// a candle
const RITUAL_ICON = (
  <>
    <rect x="5.5" y="7" width="5" height="7.5" rx="0.8" fill="currentColor" />
    <path d="M8 1.2c1.7 1.7 2 3 1 4.1a1.4 1.4 0 0 1-2 0C6 4.2 6.3 2.9 8 1.2z" fill="currentColor" />
  </>
)
// an arrow reaching out
const RANGE_ICON = <path d="M1.8 8h11.4M9.6 4.4L13.2 8l-3.6 3.6" {...stroke} />

const AREA_ICON: Record<AreaShape, ReactNode> = {
  sphere: (
    <>
      <circle cx="8" cy="8" r="6" {...stroke} />
      <path d="M2 8c1.5 1.6 10.5 1.6 12 0" {...stroke} strokeWidth={1.2} />
    </>
  ),
  // a circle with its radius drawn: "all around"
  radius: (
    <>
      <circle cx="8" cy="8" r="6" {...stroke} strokeDasharray="2.4 1.6" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </>
  ),
  emanation: (
    <>
      <circle cx="8" cy="8" r="6" {...stroke} strokeDasharray="2.4 1.6" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </>
  ),
  cone: <path d="M1.8 8L14 2.5v11z" {...stroke} />,
  cube: (
    <>
      <path d="M2.5 5.2L8 2.5l5.5 2.7v6L8 13.8l-5.5-2.6z" {...stroke} />
      <path d="M2.5 5.2L8 7.9l5.5-2.7M8 7.9v5.9" {...stroke} strokeWidth={1.2} />
    </>
  ),
  square: <rect x="2.5" y="2.5" width="11" height="11" {...stroke} />,
  line: <rect x="1.5" y="6" width="13" height="4" rx="1" {...stroke} />,
  cylinder: (
    <>
      <ellipse cx="8" cy="4" rx="5.5" ry="2" {...stroke} />
      <path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" {...stroke} />
    </>
  ),
}

// a burst, as on the Damage category
const DAMAGE_ICON = <path d="M8 1l1.6 4.2L14 4l-2.6 3.6L15 10l-4.4.2L10 15l-2-3.8L6 15l-.6-4.8L1 10l3.6-2.4L2 4l4.4 1.2z" fill="currentColor" />
// a d20: a roll the target makes
const SAVE_ICON = (
  <>
    <path d="M8 1.3l5.9 3.4v6.6L8 14.7l-5.9-3.4V4.7z" {...stroke} />
    <path d="M8 4.3l3.4 5.9H4.6z" {...stroke} strokeWidth={1.2} />
  </>
)

/** Number and unit kept together with a narrow space, so "120 ft" never breaks and takes less room. */
const tight = (s: string) => s.replace(/ /g, ' ')

function Item({ cls, label, icon, children }: { cls: string; label: string; icon: ReactNode; children?: ReactNode }) {
  return (
    <span className={`strip-item ${cls}`} role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        {icon}
      </svg>
      {children !== undefined && <span className="strip-val" aria-hidden="true">{children}</span>}
    </span>
  )
}

const ZONE_CLASS: Record<StripAction, string> = { action: 'z-action', bonus: 'z-bonus', reaction: 'z-reaction', free: 'z-other', special: 'z-other', time: 'z-other' }

/** The strip itself; nothing at all when there is nothing to show. */
export function CardStrip({ strip }: { strip?: Strip }) {
  if (!strip || stripEmpty(strip)) return null
  const { action, ritual, range, area, damage, save } = strip
  const dmgText = damage ? (damage.dice ?? (damage.type ? tagLabel(damage.type) : '')) : ''
  const dmgLabel = damage ? t('strip.damage', { damage: [damage.dice, damage.type ? tagLabel(damage.type) : ''].filter(Boolean).join(' ') }) : ''
  return (
    <div className="card-strip" role="group" aria-label={t('strip.label')}>
      {action && (
        <Item cls={`strip-action ${ZONE_CLASS[action.kind]}`} label={action.kind === 'time' ? t('strip.castingTime', { time: action.label ?? '' }) : t(`act.${action.kind}`)} icon={ACTION_ICON[action.kind]}>
          {action.kind === 'time' ? tight(action.label ?? '') : undefined}
        </Item>
      )}
      {ritual && <Item cls="strip-ritual" label={t('strip.ritual')} icon={RITUAL_ICON} />}
      {range && (
        <Item cls="strip-range" label={t('strip.range', { range })} icon={RANGE_ICON}>
          {tight(range)}
        </Item>
      )}
      {area && (
        <Item cls="strip-area" label={t('strip.area', { size: area.size, shape: t(`strip.shape.${area.shape}`) })} icon={AREA_ICON[area.shape]}>
          {/* feet are the default unit of an area: the number alone saves room next to the range; miles keep "mi" */}
          {tight(area.size.replace(/ ft$/, ''))}
        </Item>
      )}
      {damage && (
        <Item cls={`strip-damage ${damage.type ? damageClass(damage.type) : 'dmg-untyped'}`} label={dmgLabel} icon={DAMAGE_ICON}>
          {dmgText}
        </Item>
      )}
      {save && (
        <Item cls="strip-save" label={t('strip.save', { ability: t(`ability.long.${save}`) })} icon={SAVE_ICON}>
          {t(`ability.${save}`)}
        </Item>
      )}
    </div>
  )
}
