// The Images tab: maps of the campaign and other pictures kept with the character. A grid of thumbnails
// with the name under each; a tap opens the picture on the whole screen (ImageViewer). Adding, renaming,
// reordering and deleting all happen here; the pictures travel inside the exported file.
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { addImages, formatBytes, imagesBytes, imagesOf, moveImage, removeImage, renameImage } from '../model/images'
import { exportWithoutImages, imageStore } from '../model/imageStore'
import { fileNameFor, loadImageMaxSide, saveImageMaxSide } from '../model/storage'
import type { CharacterImage } from '../model/types'
import { Modal, TextField } from './common'
import { MAX_SIDES, prepareImage, type MaxSide } from './imageCodec'
import { ImageViewer } from './ImageViewer'
import { downloadJson, downloadText, type SheetApi } from './Sheet'

export function ImagesView({ api }: { api: SheetApi }) {
  const { c, update, toast } = api
  const images = imagesOf(c)
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [maxSide, setMaxSide] = useState<MaxSide>(loadImageMaxSide)
  // which pictures this browser really has (an entry can arrive without its picture: a file exported elsewhere without it)
  const [present, setPresent] = useState<Set<string> | null>(null)
  const idsKey = images.map((i) => i.id).join(',')
  useEffect(() => {
    let alive = true
    imageStore()
      .ids(c.id)
      .then((ids) => alive && setPresent(new Set(ids)))
      .catch(() => alive && setPresent(null))
    return () => {
      alive = false
    }
  }, [c.id, idsKey])

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    const failed: string[] = []
    const added: CharacterImage[] = []
    // ask the browser not to clear this site's storage when the disk runs low (it may say no; nothing depends on it)
    void navigator.storage?.persist?.().catch(() => false)
    for (const [i, f] of list.entries()) {
      setBusy(t('images.adding', { n: i + 1, of: list.length }))
      try {
        const p = await prepareImage(f, f.name, maxSide)
        await imageStore().put(c.id, p.entry.id, p.stored)
        added.push(p.entry)
      } catch (e) {
        failed.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setBusy('')
    if (fileRef.current) fileRef.current.value = ''
    update((x) => addImages(x, added))
    if (failed.length) toast({ title: t('images.addFailed'), lines: failed, tone: 'bad' })
    else if (added.length) toast({ title: t('images.added', { n: added.length }), lines: [formatBytes(added.reduce((s, x) => s + (x.bytes ?? 0), 0))], tone: 'info' })
  }

  const openIndex = open ? images.findIndex((i) => i.id === open) : -1
  const edited = editing ? images.find((i) => i.id === editing) : undefined
  const missingCount = present ? images.filter((i) => !present.has(i.id)).length : 0

  return (
    <div className="images-view">
      <section className="panel images" aria-labelledby="images-title">
        <div className="images-head">
          <h3 id="images-title">
            {t('images.title')} {images.length > 0 && <span className="muted">({images.length})</span>}
          </h3>
          <label className="images-size">
            <span className="muted">{t('images.sizeLabel')}</span>
            <select
              value={maxSide}
              onChange={(e) => {
                const v = Number(e.target.value) as MaxSide
                setMaxSide(v)
                saveImageMaxSide(v)
              }}
            >
              {MAX_SIDES.map((s) => (
                <option key={s} value={s}>
                  {s ? t('images.sizePx', { n: s }) : t('images.sizeOriginal')}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-small btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            + {t('images.add')}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
        </div>
        {busy && <p className="hint">{busy}</p>}

        {images.length === 0 ? (
          <p className="hint">{t('images.empty')}</p>
        ) : (
          <ul className="image-grid">
            {images.map((im) => {
              const gone = !!present && !present.has(im.id)
              return (
                <li key={im.id} className={`image-tile ${gone ? 'gone' : ''}`}>
                  <button className="image-open" onClick={() => setOpen(im.id)} title={t('images.open', { name: im.name })}>
                    <span className="image-thumb">{im.thumb ? <img src={im.thumb} alt="" loading="lazy" draggable={false} /> : <span className="image-nothumb">▦</span>}</span>
                    <span className="image-name">{im.name}</span>
                    {gone && <span className="image-gone">{t('images.missing')}</span>}
                  </button>
                  <button className="image-edit" onClick={() => setEditing(im.id)} aria-label={t('images.editOne', { name: im.name })} title={t('images.editOne', { name: im.name })}>
                    ✎
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {missingCount > 0 && <p className="warn images-note">{t('images.missingLong')}</p>}
        {images.length > 0 && (
          <div className="images-foot">
            <p className="hint">{t('images.fileNote', { size: formatBytes(Math.round(imagesBytes(c) * 1.37)) })}</p>
            <div className="images-export">
              <button
                className="btn btn-small"
                onClick={() => void downloadJson(c).then((m) => m.length && toast({ title: t('images.exportMissing'), lines: m, tone: 'bad' }))}
              >
                {t('images.exportWith')}
              </button>
              <button className="btn btn-small" onClick={() => downloadText(exportWithoutImages(c), fileNameFor(c).replace(/\.json$/, '-no-images.json'))}>
                {t('images.exportWithout')}
              </button>
            </div>
          </div>
        )}
      </section>

      {openIndex >= 0 && <ImageViewer characterId={c.id} images={images} index={openIndex} onIndex={(i) => setOpen(images[i]?.id ?? null)} onClose={() => setOpen(null)} />}
      {edited && <ImageEditor key={edited.id} api={api} image={edited} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ImageEditor({ api, image, onClose }: { api: SheetApi; image: CharacterImage; onClose: () => void }) {
  const { c, update } = api
  const images = imagesOf(c)
  const at = images.findIndex((i) => i.id === image.id)
  const [name, setName] = useState(image.name)
  const save = () => {
    update((x) => renameImage(x, image.id, name))
    onClose()
  }
  const move = (by: number) => update((x) => moveImage(x, image.id, by))
  return (
    <Modal
      title={t('images.editTitle')}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-danger left"
            onClick={() => {
              // the picture itself stays in the browser until the sheet is opened next time, so Undo (↶) brings the image back
              update((x) => removeImage(x, image.id))
              onClose()
            }}
          >
            {t('common.delete')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <TextField label={t('common.name')} value={name} onChange={setName} />
      <div className="image-order">
        <span className="muted">{t('images.position', { n: at + 1, of: images.length })}</span>
        <button className="btn btn-small" onClick={() => move(-images.length)} disabled={at <= 0}>
          ⇤ {t('images.first')}
        </button>
        <button className="btn btn-small" onClick={() => move(-1)} disabled={at <= 0}>
          ← {t('images.earlier')}
        </button>
        <button className="btn btn-small" onClick={() => move(1)} disabled={at >= images.length - 1}>
          {t('images.later')} →
        </button>
        <button className="btn btn-small" onClick={() => move(images.length)} disabled={at >= images.length - 1}>
          {t('images.last')} ⇥
        </button>
      </div>
      <p className="hint">
        {[image.width && image.height ? `${image.width} × ${image.height} px` : '', image.bytes ? formatBytes(image.bytes) : ''].filter(Boolean).join(' · ')}
      </p>
      <p className="hint">{t('images.deleteHint')}</p>
    </Modal>
  )
}
