import { useRef, useState } from 'react'
import sampleJson from '../../examples/sample-character.json?raw'
import { SRD_ATTRIBUTION } from '../data/srd'
import { t } from '../i18n'
import { ImportError, importCharacterJson, newId } from '../model/normalize'
import { totalLevel } from '../model/rules'
import { deleteCharacter, listCharacters, saveCharacter, type Settings } from '../model/storage'
import type { Character } from '../model/types'
import { Confirm, Modal } from './common'
import { downloadJson } from './Sheet'
import { classLine } from './vitals'

interface Pending {
  character: Character
  warnings: string[]
  fileName: string
  clash: boolean
}

export function CharacterList(props: { onOpen: (id: string) => void; onNew: () => void; settings: Settings; setSettings: (s: Settings) => void; onRules: () => void }) {
  const [{ characters, broken }, setData] = useState(() => listCharacters())
  const [del, setDel] = useState<Character | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = () => setData(listCharacters())

  const stage = (text: string, fileName: string) => {
    try {
      const r = importCharacterJson(text)
      const clash = characters.some((c) => c.id === r.character.id)
      setPending((p) => [...p, { ...r, fileName, clash }])
    } catch (e) {
      setError(`${fileName}: ${e instanceof ImportError ? e.message : String(e)}`)
    }
  }

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      try {
        stage(await f.text(), f.name)
      } catch (e) {
        setError(`${f.name}: ${String(e)}`)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const commit = (p: Pending, asCopy: boolean) => {
    const c = asCopy ? { ...p.character, id: newId(), name: `${p.character.name} (${t('list.copy')})` } : p.character
    const st = saveCharacter(c)
    if (!st.ok) setError(st.error ?? '')
    setPending((all) => all.slice(1))
    refresh()
  }

  const current = pending[0]

  return (
    <div className="list-page">
      <header className="list-head">
        <div>
          <h1 className="app-title">{t('app.title')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={props.onRules}>
            {t('tab.rules')}
          </button>
          <button className="btn" onClick={() => props.setSettings({ ...props.settings, theme: props.settings.theme === 'dark' ? 'light' : 'dark' })} aria-label={t('app.toggleTheme')}>
            {props.settings.theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={props.onNew}>
          + {t('list.new')}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          {t('list.import')}
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button className="btn" onClick={() => stage(sampleJson, 'sample-character.json')}>
          {t('list.loadExample')}
        </button>
      </div>

      {characters.length === 0 && broken.length === 0 && (
        <div className="panel empty-state">
          <p>{t('list.empty')}</p>
        </div>
      )}

      <ul className="hero-list">
        {characters.map((c) => (
          <li key={c.id} className="hero-card">
            <button className="hero-open" onClick={() => props.onOpen(c.id)}>
              <span className="hero-level">{totalLevel(c)}</span>
              <span className="hero-text">
                <strong>{c.name}</strong>
                <span className="muted">{classLine(c)}</span>
                <small className="muted">{[c.species.name, c.background].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
            <div className="hero-actions">
              <button className="btn btn-small" onClick={() => downloadJson(c)}>
                {t('list.export')}
              </button>
              <button className="btn btn-small btn-danger" onClick={() => setDel(c)}>
                {t('common.delete')}
              </button>
            </div>
          </li>
        ))}
        {broken.map((b) => (
          <li key={b.id} className="hero-card broken">
            <span className="warn">{t('list.broken', { id: b.id, err: b.broken ?? '' })}</span>
            <button className="btn btn-small btn-danger" onClick={() => (deleteCharacter(b.id), refresh())}>
              {t('common.delete')}
            </button>
          </li>
        ))}
      </ul>

      <p className="storage-note muted">{t('list.storageNote')}</p>
      <p className="attribution muted">{SRD_ATTRIBUTION}</p>

      {del && (
        <Confirm
          title={t('list.deleteTitle')}
          message={t('list.deleteConfirm', { name: del.name })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setDel(null)}
          onConfirm={() => {
            deleteCharacter(del.id)
            setDel(null)
            refresh()
          }}
        />
      )}

      {current && (
        <Modal
          title={t('list.importTitle', { name: current.character.name })}
          onClose={() => setPending((p) => p.slice(1))}
          footer={
            <>
              <button className="btn" onClick={() => setPending((p) => p.slice(1))}>
                {t('common.cancel')}
              </button>
              {current.clash && (
                <button className="btn" onClick={() => commit(current, true)}>
                  {t('list.importCopy')}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => commit(current, false)}>
                {current.clash ? t('list.importReplace') : t('list.importOk')}
              </button>
            </>
          }
        >
          <p className="muted">{current.fileName}</p>
          <p>
            {classLine(current.character)} · {t('vitals.level', { n: totalLevel(current.character) })}
          </p>
          {current.clash && <p className="warn">{t('list.clash')}</p>}
          {current.warnings.length > 0 ? (
            <>
              <p>{t('list.importWarnings', { n: current.warnings.length })}</p>
              <ul className="warnings">
                {current.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="good">{t('list.importClean')}</p>
          )}
        </Modal>
      )}

      {error && (
        <Modal title={t('list.importError')} onClose={() => setError(null)}>
          <p className="warn">{error}</p>
        </Modal>
      )}
    </div>
  )
}
