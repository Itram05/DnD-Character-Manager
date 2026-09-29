// The Play screen's sections as data: the hands split by kind, the group titles, and the list the
// quick navigation shows (SectionNav). Kept apart from PlayView.tsx so that file exports only components.
import { t } from '../i18n'
import { PLAY_KINDS, kindGroup, type PlayKind, type Zone } from '../model/play'
import type { CardFace } from './GameCard'
import type { NavSection } from './SectionNav'

/** Title of a group: the scroll group says what is in it ("Scrolls", "Potions" or "Scrolls & Potions"). */
export function groupTitle(k: PlayKind, cards: CardFace[]): string {
  if (k !== 'scroll') return t(`kind.${k}`)
  const hasScroll = cards.some((x) => x.kind === 'scroll')
  const hasPotion = cards.some((x) => x.kind === 'potion')
  return hasScroll && hasPotion ? t('kind.scrollPotion') : hasPotion ? t('kind.potion') : t('kind.scroll')
}

/** DOM id of a Play section: a panel ("mana", "conc", "field", "days"), a hand, or a kind inside a hand. */
export const sectionId = (part: string, kind?: PlayKind) => `play-${part}${kind ? `-${kind}` : ''}`

/** One hand as shown: its cards after the filter, split by kind unless a single kind is selected. */
export interface HandView {
  zone: Zone
  cards: CardFace[]
  groups?: { kind: PlayKind; cards: CardFace[] }[]
}

export function playHands(zones: Zone[], cards: CardFace[], grouped: boolean): HandView[] {
  return zones.map((zone) => {
    const zc = cards.filter((x) => x.zone === zone)
    const groups = grouped ? PLAY_KINDS.map((kind) => ({ kind, cards: zc.filter((x) => kindGroup(x.kind) === kind) })).filter((g) => g.cards.length > 0) : undefined
    return { zone, cards: zc, groups }
  })
}

/**
 * The list for the quick navigation, in the order the screen shows it. A hand left empty by the
 * filter is not listed (its "No cards here." is not worth a jump). `passivesFirst`: on a computer
 * "Always on" sits in the top row; on a phone it comes after the hands. `resources`: the phone's one
 * Resources block (ResourcesBlock.tsx) stands for slots and concentration, so it is one entry.
 * `days`: the day timers panel at the very end (its number = timers); absent = no entry.
 */
export function playSections(p: { mana: boolean; passives: number; hands: HandView[]; passivesFirst: boolean; resources?: boolean; days?: number }): NavSection[] {
  const field: NavSection[] = p.passives > 0 ? [{ id: sectionId('field'), label: t('play.battlefield'), n: p.passives }] : []
  const hands = p.hands
    .filter((h) => h.cards.length > 0)
    .flatMap((h): NavSection[] => [
      { id: sectionId(h.zone), label: t(`zone.${h.zone}`), n: h.cards.length },
      ...(h.groups ?? []).map((g) => ({ id: sectionId(h.zone, g.kind), label: groupTitle(g.kind, g.cards), n: g.cards.length, sub: true })),
    ])
  const top: NavSection[] = p.resources
    ? [{ id: sectionId('res'), label: t('res.title') }]
    : [...(p.mana ? [{ id: sectionId('mana'), label: t('play.mana') }] : []), { id: sectionId('conc'), label: t('play.inPlay') }]
  return [
    ...top,
    ...(p.passivesFirst ? field : []),
    ...hands,
    ...(p.passivesFirst ? [] : field),
    ...(p.days !== undefined ? [{ id: sectionId('days'), label: t('days.title'), n: p.days || undefined }] : []),
  ]
}

