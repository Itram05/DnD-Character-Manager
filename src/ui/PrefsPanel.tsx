import { t } from '../i18n'
import { setCoinShown, shownCoins } from '../model/money'
import { ATTACK_ORDERS, MAP_LAYERS, MARK_SIZES, PHONE_STARTS, layerShown, mapPrefs, playPrefs, setLayerShown, setMapPref, setPlayPref } from '../model/prefs'
import { COINS, type AttackOrder, type MarkSize, type PhoneStart } from '../model/types'
import { Check, Select } from './common'
import type { SheetApi } from './Sheet'

/** DOM id of the panel, so other screens can send the player straight to it. */
export const PREFS_PANEL_ID = 'sheet-settings'

/**
 * "How this sheet looks": the character's own display choices, in one place (the Edit tab). They are saved
 * with the character and travel in its file. Each is also reachable where it applies (the Money panel has
 * its own "Coins shown").
 */
export function PrefsPanel({ api }: { api: SheetApi }) {
  const { c, update } = api
  const play = playPrefs(c)
  const coins = shownCoins(c)
  const maps = mapPrefs(c)
  return (
    <section className="panel prefs-panel" id={PREFS_PANEL_ID}>
      <h3>{t('prefs.title')}</h3>
      <p className="hint">{t('prefs.hint')}</p>

      <h4>{t('prefs.play')}</h4>
      <div className="grid-2">
        <Select<AttackOrder> label={t('prefs.attackOrder')} value={play.attackOrder} options={ATTACK_ORDERS.map((v) => ({ value: v, label: t(`prefs.attackOrder.${v}`) }))} onChange={(v) => update((x) => setPlayPref(x, 'attackOrder', v))} />
        <Select<PhoneStart> label={t('prefs.phoneStart')} value={play.phoneStart} options={PHONE_STARTS.map((v) => ({ value: v, label: t(`prefs.phoneStart.${v}`) }))} onChange={(v) => update((x) => setPlayPref(x, 'phoneStart', v))} />
      </div>
      <p className="hint">{t('prefs.phoneStartHint')}</p>
      <Check label={t('prefs.editButtons')} checked={play.editButtons} onChange={(on) => update((x) => setPlayPref(x, 'editButtons', on))} />

      <h4>{t('prefs.money')}</h4>
      <div className="checks">
        {COINS.map((k) => (
          <Check key={k} label={`${k.toUpperCase()} · ${t(`money.coin.${k}`)}`} checked={coins.includes(k)} onChange={(on) => update((x) => setCoinShown(x, k, on))} />
        ))}
      </div>
      <p className="hint">{t('money.coinsHint')}</p>

      <h4>{t('prefs.maps')}</h4>
      <div className="grid-2">
        <Select<MarkSize> label={t('prefs.maps.size')} value={maps.size} options={MARK_SIZES.map((v) => ({ value: v, label: t(`maps.size.${v}`) }))} onChange={(v) => update((x) => setMapPref(x, 'size', v))} />
      </div>
      <Check label={t('maps.names')} checked={maps.names} onChange={(on) => update((x) => setMapPref(x, 'names', on))} />
      <div className="checks">
        {MAP_LAYERS.map((l) => (
          <Check key={l} label={t('prefs.maps.show', { what: t(`maps.layer.${l}`).toLowerCase() })} checked={layerShown(c, l)} onChange={(on) => update((x) => setLayerShown(x, l, on))} />
        ))}
      </div>
      <p className="hint">{t('prefs.maps.hint')}</p>
    </section>
  )
}
