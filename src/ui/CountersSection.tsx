// Play: the items the player pinned as counters (materials, arrows, rations...), each the total of all its
// stacks with − and +. Which items, and their order, is chosen in Gear (CraftingPanel.tsx, and 📌 on a row).
import { t } from '../i18n'
import { bumpCounter, counterViews, nameKey } from '../model/crafting'
import type { SheetApi } from './Sheet'

const qty = (n: number) => String(Math.round(n * 1000) / 1000)

export function CountersSection({ api, id }: { api: SheetApi; id: string }) {
  const views = counterViews(api.c)
  if (!views.length) return null
  return (
    <section id={id} className="play-counters panel nav-target">
      <h3>
        {t('counter.title')}
        <button className="link-btn counter-edit" onClick={() => api.go('gear')}>
          {t('counter.edit')}
        </button>
      </h3>
      <div className="counter-list">
        {views.map((v) => (
          <div key={nameKey(v.counter.name)} className={`counter ${v.count <= 0 ? 'empty' : ''}`} role="group" aria-label={t('card.quantityOf', { name: v.label, n: qty(v.count) })}>
            <button className="mini-btn" disabled={v.count < 1} onClick={() => api.update((x) => bumpCounter(x, v.counter.name, -1))} aria-label={t('card.useOneOf', { name: v.label })}>
              −
            </button>
            <span className="counter-name" title={v.label}>
              {v.label}
            </span>
            <b className="counter-n">{qty(v.count)}</b>
            <button className="mini-btn" onClick={() => api.update((x) => bumpCounter(x, v.counter.name, 1))} aria-label={t('card.addOneOf', { name: v.label })}>
              +
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
