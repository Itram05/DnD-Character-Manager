import { t } from '../i18n'
import { setCoinShown, shownCoins } from '../model/money'
import { ATTACK_ORDERS, PHONE_STARTS, playPrefs, setPlayPref } from '../model/prefs'
import { COINS, type AttackOrder, type PhoneStart } from '../model/types'
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
    </section>
  )
}
