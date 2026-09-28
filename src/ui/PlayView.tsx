import { useEffect, useMemo, useState } from 'react'
import { loadSrdSpells, type SrdSpell } from '../data/srd'
import { t } from '../i18n'
import {
  PLAY_KINDS,
  ZONES,
  castSpell,
  itemCard,
  manaRows,
  paymentOptions,
  findPower,
  playCards,
  playPassivePowers,
  playPassives,
  kindGroup,
  playHealingPotions,
  shortText,
  spendSlot,
  // plain function, not a React hook: the alias stops the linter from treating it as one
  useCard as spendCard,
  type Payment,
  type PlayCard,
  type PlayKind,
  type Zone,
} from '../model/play'
import { MAX_CREATED_SLOT_LEVEL, SLOT_COST, canPointsToSlot, canSlotToPoints, pointsToSlot, slotToPoints, slotsLeftAt, sorceryFeature, sorceryPoints } from '../model/sorcery'
import { attackStats } from '../model/rules'
import { healingDice, isScroll, potionLabel, readScroll, scrollInfo } from '../model/consumables'
import { attackTags, matchesTags, tagCounts } from '../model/tags'
import type { Character, Item } from '../model/types'
import { Modal, Pips, RichText, fmtMod, useMediaQuery } from './common'
import { FeatureEditor, ItemEditor, SpellEditor } from './editors'
import { FRAME_GLYPH, GameCard, POTION_GLYPH, SCROLL_GLYPH, type CardFace } from './GameCard'
import type { SheetApi } from './Sheet'
import { TagFilter, TagList } from './tags'

type HandFilter = Zone | 'all'
type KindFilter = PlayKind | 'all'

function attackFaces(c: Character): CardFace[] {
  return c.attacks.map((a) => {
    const s = attackStats(c, a)
    const dmg = a.damage ? `${a.damage}${s.dmgMod ? (s.dmgMod > 0 ? `+${s.dmgMod}` : s.dmgMod) : ''}` : ''
    return {
      key: `attack:${a.id}`,
      kind: 'attack',
      id: a.id,
      name: a.name,
      frame: 'attack',
      sourceLabel: [t('card.attack'), a.mastery && `${t('card.mastery')}: ${a.mastery}`].filter(Boolean).join(' · '),
      zone: 'action',
      cost: 'A',
      text: [a.damageType, a.notes].filter(Boolean).join(' · '),
      tapped: false,
      tags: attackTags(a),
      stat: (
        <>
          <b>{fmtMod(s.toHit)}</b> {t('card.toHit')} · <b>{dmg}</b>
        </>
      ),
    }
  })
}

// inside the "scroll" group, scrolls first, then potions
const ORDER: Record<string, number> = { attack: 0, feature: 1, spell: 2, scroll: 3, potion: 4, item: 5, power: 5 }

/** Something on the "Always on" row: a passive feature, or a passive power of an item. */
interface PassiveChip {
  key: string
  name: string
  glyph: string
  frame: string
  source: string
  description: string
}

/** Title of a group: the scroll group says what is in it ("Scrolls", "Potions" or "Scrolls & Potions"). */
function groupTitle(k: PlayKind, cards: CardFace[]): string {
  if (k !== 'scroll') return t(`kind.${k}`)
  const hasScroll = cards.some((x) => x.kind === 'scroll')
  const hasPotion = cards.some((x) => x.kind === 'potion')
  return hasScroll && hasPotion ? t('kind.scrollPotion') : hasPotion ? t('kind.potion') : t('kind.scroll')
}

export function PlayView({ api }: { api: SheetApi }) {
  const { c, update, settings, setSettings, toast } = api
  const wide = useMediaQuery('(min-width: 900px)')
  const [hand, setHand] = useState<HandFilter>(wide ? 'all' : 'action')
  const [kind, setKind] = useState<KindFilter>('all')
  const [open, setOpen] = useState<CardFace | null>(null)
  const [flexOpen, setFlexOpen] = useState(false)
  const [openPassive, setOpenPassive] = useState<PassiveChip | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const mode = settings.view
  const srd = useSrdForScrolls(c)

  const allCards: CardFace[] = useMemo(() => {
    const all: CardFace[] = [...attackFaces(c), ...playCards(c, srd)]
    return all.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.spellLevel ?? 0) - (b.spellLevel ?? 0) || a.name.localeCompare(b.name))
  }, [c, srd])
  const potions = playHealingPotions(c)
  const kindCards = kind === 'all' ? allCards : allCards.filter((x) => kindGroup(x.kind) === kind)
  // the tag filter works on top of the kind filter; its chips count the cards of the chosen kind
  const tagChips = tagCounts(kindCards.map((x) => x.tags))
  const cards = tags.length ? kindCards.filter((x) => matchesTags(x.tags, tags)) : kindCards
  const sp = sorceryPoints(c)
  const passives: PassiveChip[] = [
    ...playPassives(c).map((f) => ({ key: f.id, name: f.name, glyph: FRAME_GLYPH[f.source.type], frame: f.source.type, source: f.source.name || t(`source.${f.source.type}`), description: f.description })),
    ...playPassivePowers(c).map(({ item, power }) => ({ key: power.id, name: power.name, glyph: FRAME_GLYPH.item, frame: 'item', source: item.name, description: power.description })),
  ]
  const mana = manaRows(c)
  const conc = c.spellcasting.concentration
  const concSpell = c.spells.find((s) => s.name === conc)

  const use = (card: CardFace, delta = 1) => {
    if (card.kind === 'attack') return
    update((x) => spendCard(x, { kind: card.kind as PlayCard['kind'], id: card.id }, delta))
  }
  const readOneScroll = (card: CardFace) => {
    const r = readScroll(c, card.id, srd)
    if (!r) return
    update(() => r.character)
    toast({
      title: t('scroll.used', { name: card.name }),
      lines: [
        r.left > 0 ? t('scroll.left', { n: r.left }) : t('scroll.lastOne'),
        ...(r.droppedConcentration ? [t('cast.droppedConc', { name: r.droppedConcentration })] : []),
        ...(r.character.spellcasting.concentration === r.spell && r.spell && r.spell !== c.spellcasting.concentration ? [t('cast.nowConc')] : []),
      ],
    })
  }
  /** Any potion: one fewer. A healing potion also says what to roll. */
  const drink = (i: Item) => {
    if (i.quantity <= 0) return
    update((x) => spendCard(x, { kind: 'item', id: i.id }, 1))
    const dice = healingDice(i)
    const left = i.quantity - 1
    toast({ title: t('potion.used', { name: i.name }), lines: [...(dice ? [t('potion.roll', { dice })] : []), left > 0 ? t('scroll.left', { n: left }) : t('scroll.lastOne')] })
  }
  const drinkCard = (card: CardFace) => {
    const i = c.inventory.items.find((x) => x.id === card.id)
    if (i) drink(i)
  }

  const zonesToShow: Zone[] = hand === 'all' ? ZONES : [hand]
  const countIn = (z: Zone) => cards.filter((x) => x.zone === z).length
  const countKind = (k: PlayKind) => allCards.filter((x) => kindGroup(x.kind) === k).length

  const renderCard = (card: CardFace) => {
    if (card.kind === 'scroll')
      return <GameCard key={card.key} card={card} mode={mode} onOpen={() => setOpen(card)} onUse={() => readOneScroll(card)} useLabel={t('scroll.use')} />
    if (card.kind === 'potion')
      return <GameCard key={card.key} card={card} mode={mode} onOpen={() => setOpen(card)} onUse={() => drinkCard(card)} useLabel={t('scroll.use')} />
    const isSpell = card.kind === 'spell'
    const hasCounter = !!card.uses || card.quantity !== undefined
    return (
      <GameCard
        key={card.key}
        card={card}
        mode={mode}
        onOpen={() => setOpen(card)}
        onUse={isSpell ? () => setOpen(card) : hasCounter ? () => use(card) : undefined}
        onUndo={hasCounter && !isSpell ? () => use(card, -1) : isSpell && card.uses ? () => use(card, -1) : undefined}
        useLabel={isSpell ? t('card.cast') : undefined}
      />
    )
  }

  return (
    <div className="play">
      <div className="play-controls">
        <div className="segmented" role="tablist" aria-label={t('play.hands')}>
          {(['all', ...ZONES] as HandFilter[]).map((z) => (
            <button key={z} role="tab" aria-selected={hand === z} className={hand === z ? 'active' : ''} onClick={() => setHand(z)}>
              {t(`zone.${z}`)}
              {z !== 'all' && <span className="count">{countIn(z)}</span>}
            </button>
          ))}
        </div>
        <div className="segmented kind-filter" role="tablist" aria-label={t('play.kinds')}>
          {(['all', ...PLAY_KINDS] as KindFilter[]).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)} disabled={k !== 'all' && countKind(k) === 0}>
              {k === 'all' ? t('kind.all') : groupTitle(k, allCards)}
              {k !== 'all' && <span className="count">{countKind(k)}</span>}
            </button>
          ))}
        </div>
        <TagFilter tags={tagChips} selected={tags} onChange={setTags} />
        <div className="segmented small" aria-label={t('play.viewMode')}>
          <button className={mode === 'cards' ? 'active' : ''} onClick={() => setSettings({ ...settings, view: 'cards' })} aria-pressed={mode === 'cards'}>
            ▦ {t('play.cards')}
          </button>
          <button className={mode === 'list' ? 'active' : ''} onClick={() => setSettings({ ...settings, view: 'list' })} aria-pressed={mode === 'list'}>
            ☰ {t('play.list')}
          </button>
        </div>
      </div>

        {(mana.length > 0 || sp) && (
          <section className="mana panel">
            <h3>{t('play.mana')}</h3>
            {mana.map((r) => (
              <div key={`${r.kind}-${r.level}`} className={`mana-row mana-${r.kind}`}>
                <span className="mana-label">
                  {r.kind === 'pact' ? t('play.pactSlot', { n: r.level }) : t('play.slotLevel', { n: r.level })}
                  {r.bonus > 0 && (
                    <span className="tag bonus-slot" title={t('flex.createdHint')}>
                      +{r.bonus}
                    </span>
                  )}
                </span>
                <Pips
                  max={r.max}
                  left={r.max - r.used}
                  variant={r.kind === 'pact' ? 'pact' : 'mana'}
                  onSpend={() => update((x) => spendSlot(x, r.kind, r.level, 1))}
                  onRestore={() => update((x) => spendSlot(x, r.kind, r.level, -1))}
                  label={t('play.slotsLeft', { left: r.max - r.used, max: r.max })}
                />
              </div>
            ))}
            {sp && (
              <div className="mana-row mana-sorcery">
                <span className="mana-label">{t('flex.points')}</span>
                <Pips
                  max={sp.max}
                  left={sp.left}
                  variant="sorcery"
                  onSpend={() => update((x) => spendCard(x, { kind: 'feature', id: sp.featureId }, 1))}
                  onRestore={() => update((x) => spendCard(x, { kind: 'feature', id: sp.featureId }, -1))}
                  label={t('flex.pointsLeft', { left: sp.left, max: sp.max })}
                />
                <button className="btn btn-small flex-open" onClick={() => setFlexOpen(true)}>
                  {t('flex.convert')}
                </button>
              </div>
            )}
          </section>
        )}

        <section className={`in-play panel ${conc ? 'active' : ''}`}>
          <h3>{t('play.inPlay')}</h3>
          {conc ? (
            <div className="conc-card">
              <span className="glyph">{FRAME_GLYPH.spell}</span>
              <div>
                <strong>{conc}</strong>
                <div className="muted">{concSpell?.duration || t('spell.concentration')}</div>
              </div>
              <button className="btn btn-small" onClick={() => update((x) => ({ ...x, spellcasting: { ...x.spellcasting, concentration: '' } }))}>
                {t('play.endConcentration')}
              </button>
            </div>
          ) : (
            <div className="conc-empty">{t('play.notConcentrating')}</div>
          )}
          {/* the four healing potions live here: HP and Concentration are what you check mid-fight */}
          {potions.length > 0 && (
            <div className="heal-potions" role="group" aria-label={t('potion.healing')}>
              <h4>{t('potion.healing')}</h4>
              <div className="potion-list">
                {potions.map((i) => {
                  const dice = healingDice(i)
                  return (
                    <div key={i.id} className={`potion ${i.quantity <= 0 ? 'empty' : ''}`} role="group" aria-label={t('card.quantityOf', { name: i.name, n: i.quantity })}>
                      <button className="mini-btn" onClick={() => drink(i)} disabled={i.quantity <= 0} aria-label={t('card.useOneOf', { name: i.name })} title={t('potion.drink')}>
                        −
                      </button>
                      <button className="potion-name" onClick={() => setOpen(itemCard(c, i))} title={i.name}>
                        <span className="pn">{potionLabel(i.name)}</span>
                        {dice && <span className="pd">{dice}</span>}
                      </button>
                      <span className="pq">×{i.quantity}</span>
                      <button className="mini-btn" onClick={() => use(itemCard(c, i), -1)} aria-label={t('card.addOneOf', { name: i.name })} title={t('card.addOne')}>
                        +
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {passives.length > 0 && (
          <section className="battlefield panel">
            <h3>
              {t('play.battlefield')} <span className="muted">({passives.length})</span>
            </h3>
            <div className="passive-chips">
              {passives.map((f) => (
                <button key={f.key} className={`passive-chip frame-${f.frame}`} onClick={() => setOpenPassive(f)} title={shortText(f.description, 200)}>
                  <span className="glyph" aria-hidden="true">
                    {f.glyph}
                  </span>
                  {f.name}
                  {f.frame === 'item' && <span className="chip-source"> · {f.source}</span>}
                </button>
              ))}
            </div>
          </section>
        )}

      <div className={`hands hands-${zonesToShow.length > 1 ? 'multi' : 'single'} mode-${mode}`}>
        {zonesToShow.map((z) => {
          const zc = cards.filter((x) => x.zone === z)
          return (
            <section key={z} className={`zone zone-${z}`}>
              <h3 className="zone-title">
                <span className={`gem gem-${z}`}>{t(`zone.${z}.short`)}</span> {t(`zone.${z}`)}
              </h3>
              {zc.length === 0 ? (
                <p className="muted empty-zone">{t('play.emptyZone')}</p>
              ) : kind !== 'all' ? (
                <div className={mode === 'cards' ? 'card-grid' : 'card-list'}>{zc.map(renderCard)}</div>
              ) : (
                PLAY_KINDS.map((k) => {
                  const kc = zc.filter((x) => kindGroup(x.kind) === k)
                  if (kc.length === 0) return null
                  return (
                    <div key={k} className={`kind-group kind-${k}`}>
                      <h4 className="kind-title">
                        {groupTitle(k, kc)} <span className="muted">({kc.length})</span>
                      </h4>
                      <div className={mode === 'cards' ? 'card-grid' : 'card-list'}>{kc.map(renderCard)}</div>
                    </div>
                  )
                })
              )}
            </section>
          )
        })}
      </div>

      {allCards.length === 0 && passives.length === 0 && !sp && potions.length === 0 && (
        <div className="empty-state panel">
          <p>{t('play.emptyAll')}</p>
          <button className="btn" onClick={() => api.go('features')}>
            {t('tab.features')}
          </button>
          <button className="btn" onClick={() => api.go('spells')}>
            {t('tab.spells')}
          </button>
        </div>
      )}

      {flexOpen && <FlexibleCasting api={api} onClose={() => setFlexOpen(false)} />}
      {open && (
        <CardZoom
          api={api}
          face={allCards.find((x) => x.key === open.key) ?? open}
          onClose={() => setOpen(null)}
          onUse={(f, d = 1) => {
            const healing = f.kind === 'item' ? potions.find((i) => i.id === f.id) : undefined
            if (d > 0 && f.kind === 'scroll') readOneScroll(f)
            else if (d > 0 && f.kind === 'potion') drinkCard(f)
            else if (d > 0 && healing) drink(healing)
            else use(f, d)
          }}
          srd={srd}
        />
      )}
      {openPassive && (
        <Modal title={openPassive.name} onClose={() => setOpenPassive(null)}>
          <p className="muted">
            {openPassive.glyph} {openPassive.source} · {t('act.passive')}
          </p>
          <RichText text={openPassive.description} />
        </Modal>
      )}
    </div>
  )
}

// ---------------- SRD spells for scrolls ----------------

/** The SRD spell list (~350 KB, loaded on demand) is fetched only when the character has a scroll. */
function useSrdForScrolls(c: Character): SrdSpell[] | undefined {
  const [srd, setSrd] = useState<SrdSpell[] | undefined>()
  const hasScroll = c.inventory.items.some(isScroll)
  useEffect(() => {
    if (!hasScroll || srd) return
    let alive = true
    loadSrdSpells().then((s) => alive && setSrd(s))
    return () => {
      alive = false
    }
  }, [hasScroll, srd])
  return srd
}

// ---------------- zoomed card ----------------

function paymentLabel(p: Payment) {
  switch (p.kind) {
    case 'none':
      return t('cast.cantrip')
    case 'free':
      return t('cast.freeShort')
    case 'ritual':
      return t('cast.ritual')
    case 'pact':
      return t('cast.pact', { n: p.level })
    case 'slot':
      return t('cast.slot', { n: p.level })
  }
}

function CardZoom({ api, face, onClose, onUse, srd }: { api: SheetApi; face: CardFace; onClose: () => void; onUse: (f: CardFace, d?: number) => void; srd?: readonly SrdSpell[] }) {
  const { c, update, toast } = api
  const [editing, setEditing] = useState(false)
  const feature = face.kind === 'feature' ? c.features.find((f) => f.id === face.id) : undefined
  const spell = face.kind === 'spell' ? c.spells.find((s) => s.id === face.id) : undefined
  const item = face.kind === 'item' || face.kind === 'scroll' || face.kind === 'potion' ? c.inventory.items.find((i) => i.id === face.id) : undefined
  const scroll = face.kind === 'scroll' && item ? scrollInfo(c, item, srd) : undefined
  const power = face.kind === 'power' ? findPower(c, face.id) : undefined
  // what the spell table shows: the spell itself, or the spell a scroll holds
  const sm = spell ?? scroll
  const attack = face.kind === 'attack' ? c.attacks.find((a) => a.id === face.id) : undefined

  if (editing) {
    if (feature) return <FeatureEditor api={api} initial={feature} onClose={onClose} />
    if (spell) return <SpellEditor api={api} initial={spell} onClose={onClose} />
    if (item) return <ItemEditor api={api} initial={item} onClose={onClose} />
    if (power) return <ItemEditor api={api} initial={power.item} onClose={onClose} />
  }

  const cast = (p: Payment) => {
    if (!spell) return
    const r = castSpell(c, spell.id, p)
    update(() => r.character)
    const how = paymentLabel(p)
    toast({
      title: t('cast.done', { name: spell.name }),
      lines: [how, ...(r.droppedConcentration ? [t('cast.droppedConc', { name: r.droppedConcentration })] : []), ...(spell.concentration ? [t('cast.nowConc')] : [])],
    })
    onClose()
  }

  const description = feature?.description ?? spell?.description ?? scroll?.description ?? item?.description ?? power?.power.description ?? attack?.notes ?? ''
  const counter = feature?.uses ?? spell?.freeCasts ?? item?.charges ?? power?.power.uses ?? power?.item.charges

  return (
    <Modal title={<span className={`zoom-title frame-text-${face.frame}`}>{face.name}</span>} onClose={onClose} className={`zoom frame-${face.frame}`}>
      <div className="zoom-meta">
        <span>
          {scroll ? SCROLL_GLYPH : face.kind === 'potion' ? POTION_GLYPH : FRAME_GLYPH[face.frame]} {face.sourceLabel}
        </span>
        {feature && <span className={`gem gem-${face.zone}`}>{t(`act.${feature.activation}`)}</span>}
        {power && <span className={`gem gem-${face.zone}`}>{t(`act.${power.power.activation}`)}</span>}
        {sm && sm.level !== undefined && (
          <span className="gem gem-spell">
            {sm.level === 0 ? t('card.cantrip') : t('card.spellLevel', { n: sm.level })}
          </span>
        )}
      </div>
      {face.stat && <p className="zoom-stat">{face.stat}</p>}
      {sm && (
        <dl className="spell-meta">
          {sm.castingTime && (
            <>
              <dt>{t('spell.castingTime')}</dt>
              <dd>{sm.castingTime}</dd>
            </>
          )}
          {sm.range && (
            <>
              <dt>{t('spell.range')}</dt>
              <dd>{sm.range}</dd>
            </>
          )}
          {sm.components && (
            <>
              <dt>{t('spell.components')}</dt>
              <dd>{sm.components}</dd>
            </>
          )}
          {sm.duration && (
            <>
              <dt>{t('spell.duration')}</dt>
              <dd>
                {sm.concentration ? `${t('spell.concentration')}, ` : ''}
                {sm.duration}
              </dd>
            </>
          )}
        </dl>
      )}
      {scroll && <p className="hint scroll-source">{t(`scroll.from.${scroll.from}`, { name: scroll.spellName ?? '' })}</p>}
      {power && power.power.cost && power.item.charges ? (
        <p className="power-cost">
          {power.power.cost === 'all' ? t('power.costsAll', { item: power.item.name }) : t('power.costs', { n: power.power.cost, item: power.item.name })}
        </p>
      ) : null}
      <RichText text={description} />
      {scroll?.note && <RichText text={scroll.note} className="scroll-note" />}
      <TagList tags={face.tags} />

      {face.uses && face.uses.max > 0 && (
        <div className="zoom-uses">
          <span>{spell ? t('cast.freeCasts') : power && !power.power.uses ? t('power.pool', { item: power.item.name }) : counter?.note || t('card.uses')}</span>
          <Pips max={face.uses.max} left={face.uses.left} onSpend={() => onUse(face)} onRestore={() => onUse(face, -1)} />
          <span className="muted">
            {t(`recharge.${counter?.recharge ?? 'none'}`)}
            {counter?.regain ? ` (${counter.regain})` : ''}
          </span>
        </div>
      )}
      {item && !item.charges && (
        <div className="zoom-uses">
          <span>{t('item.quantity')}</span> <b>{item.quantity}</b>
          <button className={`btn ${scroll || face.kind === 'potion' ? 'btn-primary' : ''}`} disabled={item.quantity <= 0} onClick={() => onUse(face)}>
            {scroll || face.kind === 'potion' ? t('scroll.use') : t('card.useOne')}
          </button>
          <button className="btn" onClick={() => onUse(face, -1)}>
            {t('card.addOne')}
          </button>
        </div>
      )}

      {spell && (
        <section className="cast-options">
          <h3>{t('cast.title')}</h3>
          {paymentOptions(c, spell).length === 0 ? (
            <p className="warn">{t('cast.cannot')}</p>
          ) : (
            <div className="cast-buttons">
              {paymentOptions(c, spell).map((p, i) => (
                <button key={i} className={`btn cast-btn cast-${p.kind}`} onClick={() => cast(p)}>
                  {p.kind === 'free' ? t('cast.free', { left: face.uses?.left ?? 0 }) : paymentLabel(p)}
                </button>
              ))}
            </div>
          )}
          {spell.concentration && c.spellcasting.concentration && c.spellcasting.concentration !== spell.name && (
            <p className="hint">{t('cast.willDrop', { name: c.spellcasting.concentration })}</p>
          )}
        </section>
      )}

      <div className="zoom-actions">
        {face.uses && face.uses.max > 0 && !spell && (
          <>
            <button className="btn btn-primary" disabled={face.tapped} onClick={() => onUse(face)}>
              {t('card.use')}
            </button>
            <button className="btn" disabled={face.uses.left >= face.uses.max} onClick={() => onUse(face, -1)}>
              {t('card.undoUse')}
            </button>
          </>
        )}
        {(feature || spell || item || power) && (
          <button className="btn" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </button>
        )}
        {attack && (
          <button className="btn" onClick={() => api.go('stats')}>
            {t('common.edit')}
          </button>
        )}
      </div>
    </Modal>
  )
}

// ---------------- Flexible Casting (Sorcery Points <-> slots) ----------------

export function FlexibleCasting({ api, onClose }: { api: SheetApi; onClose: () => void }) {
  const { c, update, toast } = api
  const sp = sorceryPoints(c)
  const feature = sorceryFeature(c)
  if (!sp) return null
  const slotLevels = manaRows(c)
    .filter((r) => r.kind === 'slot')
    .map((r) => r.level)
  const createLevels = Array.from({ length: MAX_CREATED_SLOT_LEVEL }, (_, i) => i + 1)

  const toPoints = (level: number) => {
    const r = slotToPoints(c, level)
    if (!r) return
    update(() => r.character)
    toast({ title: t('flex.gotPoints', { n: r.gained ?? 0, level }), lines: (r.gained ?? 0) < level ? [t('flex.capped')] : [] })
  }
  const toSlot = (level: number) => {
    const r = pointsToSlot(c, level)
    if (!r) return
    update(() => r.character)
    toast({ title: t('flex.gotSlot', { level, cost: SLOT_COST[level] }), lines: [t('flex.createdHint')] })
  }

  return (
    <Modal title={t('flex.title')} onClose={onClose} className="flex-casting">
      <p className="flex-points">
        {t('flex.points')}: <b>{sp.left}</b> / {sp.max}
      </p>

      <section>
        <h3>{t('flex.toSlotTitle')}</h3>
        <p className="hint">{t('flex.toSlotHint')}</p>
        <div className="flex-buttons">
          {createLevels.map((level) => (
            <button key={level} className="btn" disabled={!canPointsToSlot(c, level)} onClick={() => toSlot(level)}>
              {t('flex.toSlot', { cost: SLOT_COST[level], level })}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>{t('flex.toPointsTitle')}</h3>
        <p className="hint">{t('flex.toPointsHint')}</p>
        {slotLevels.length === 0 ? (
          <p className="muted">{t('flex.noSlots')}</p>
        ) : (
          <div className="flex-buttons">
            {slotLevels.map((level) => (
              <button key={level} className="btn" disabled={!canSlotToPoints(c, level)} onClick={() => toPoints(level)}>
                {t('flex.toPoints', { level, left: slotsLeftAt(c, level) })}
              </button>
            ))}
          </div>
        )}
      </section>

      {feature?.description && (
        <details className="flex-rules">
          <summary>{feature.name}</summary>
          <RichText text={feature.description} />
        </details>
      )}
    </Modal>
  )
}
