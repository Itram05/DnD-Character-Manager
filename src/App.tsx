import { useEffect, useState } from 'react'
import { t } from './i18n'
import { loadCharacter, loadSettings, saveSettings, type Settings } from './model/storage'
import { CharacterList } from './ui/CharacterList'
import { RulesView } from './ui/RulesView'
import { Sheet, type Tab } from './ui/Sheet'

// Hash routes (work on GitHub Pages without server config):
//   #/                   character list
//   #/c/<id>/<tab>       character sheet
//   #/rules              rules reference
type Route = { page: 'list' } | { page: 'sheet'; id: string; tab: Tab } | { page: 'rules' }

const TABS: Tab[] = ['play', 'stats', 'spells', 'gear', 'features', 'story', 'level', 'edit']

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/')
  if (parts[0] === 'c' && parts[1]) return { page: 'sheet', id: decodeURIComponent(parts[1]), tab: (TABS as string[]).includes(parts[2]) ? (parts[2] as Tab) : 'play' }
  if (parts[0] === 'rules') return { page: 'rules' }
  return { page: 'list' }
}

const nav = (hash: string) => {
  window.location.hash = hash
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [settings, setSettingsState] = useState<Settings>(loadSettings)

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const setSettings = (s: Settings) => {
    setSettingsState(s)
    saveSettings(s)
  }

  if (route.page === 'rules') return <RulesView onBack={() => (window.history.length > 1 ? window.history.back() : nav('#/'))} />

  if (route.page === 'sheet') {
    const c = loadCharacter(route.id)
    if (!c)
      return (
        <div className="list-page">
          <p className="warn">{t('app.notFound')}</p>
          <button className="btn" onClick={() => nav('#/')}>
            {t('nav.allCharacters')}
          </button>
        </div>
      )
    return (
      <Sheet
        key={c.id}
        initial={c}
        tab={route.tab}
        onTab={(tab) => nav(`#/c/${encodeURIComponent(c.id)}/${tab}`)}
        onBack={() => nav('#/')}
        settings={settings}
        setSettings={setSettings}
        onRules={() => nav('#/rules')}
      />
    )
  }

  return <CharacterList onOpen={(id) => nav(`#/c/${encodeURIComponent(id)}/play`)} settings={settings} setSettings={setSettings} onRules={() => nav('#/rules')} />
}
