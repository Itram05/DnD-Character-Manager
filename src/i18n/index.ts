// UI text lookup. All interface strings live in one dictionary per language (en.ts).
// To add Bulgarian later: copy en.ts to bg.ts, translate the values, and add it to LANGS.
// Keys are checked by src/i18n/keys.test.ts (every t(key) call in the code must exist).
import { en } from './en'

export type Dict = Record<string, string>
const LANGS: Record<string, Dict> = { en }
let current: Dict = en

export function setLanguage(lang: string) {
  current = LANGS[lang] ?? en
}

/** t('hp.damage') or t('rest.restored', { n: 3 }) -> replaces {n}. Missing keys fall back to English, then to the key. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = current[key] ?? en[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  return s
}
