// The "New version ready" row: a small bar at the bottom of the screen, shown when a newer build has
// been downloaded and is waiting (see src/pwa.ts). It never appears by itself in dev or without a
// service worker. "Later" hides it until the app is opened again, which applies the update anyway.
import { useState, useSyncExternalStore } from 'react'
import { t } from '../i18n'
import { applyUpdate, updateStore } from '../pwa'

export function UpdateBar() {
  const ready = useSyncExternalStore(updateStore.subscribe, updateStore.ready, updateStore.never)
  const [later, setLater] = useState(false)
  if (!ready || later) return null
  return <UpdateRow onReload={applyUpdate} onLater={() => setLater(true)} />
}

export function UpdateRow({ onReload, onLater }: { onReload: () => void; onLater: () => void }) {
  return (
    <div className="update-bar" role="status">
      <span title={t('update.hint')}>{t('update.ready')}</span>
      <button className="btn btn-small btn-primary" onClick={onReload}>
        {t('update.reload')}
      </button>
      <button className="update-later" onClick={onLater} aria-label={t('update.later')} title={t('update.later')}>
        ✕
      </button>
    </div>
  )
}
