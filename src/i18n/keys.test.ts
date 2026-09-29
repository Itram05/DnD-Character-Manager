// Every static t('key') used in the source must exist in the English dictionary,
// so a future translation has a complete list of strings to translate.
import { describe, expect, it } from 'vitest'
import { FILTER_GROUPS } from '../model/filter'
import { BUILT_IN_TAGS } from '../model/tags'
import { en } from './en'

const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('i18n keys', () => {
  it('all static keys exist', () => {
    const missing: string[] = []
    for (const [file, text] of Object.entries(sources)) {
      if (file.endsWith('.test.ts')) continue
      for (const m of text.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in en)) missing.push(`${file}: ${m[1]}`)
    }
    expect(missing).toEqual([])
  })
  it('dynamic key families are complete', () => {
    const families: Record<string, string[]> = {
      'tab.': ['play', 'stats', 'spells', 'gear', 'features', 'story', 'level', 'edit'],
      'zone.': ['all', 'action', 'bonus', 'reaction', 'other', 'action.short', 'bonus.short', 'reaction.short', 'other.short'],
      'act.': ['passive', 'action', 'bonus', 'reaction', 'free', 'special'],
      'recharge.': ['short', 'long', 'dawn', 'other', 'none'],
      'source.': ['class', 'subclass', 'species', 'background', 'feat', 'item', 'other'],
      'caster.': ['full', 'half', 'third', 'pact', 'none'],
      'hp.event.': ['droppedToZero', 'massiveDamageDeath', 'deathSaveFail1', 'deathSaveFail2', 'dead'],
      'create.method.': ['standard', 'pointBuy', 'manual'],
      'create.kind.': ['ancestry', 'lineage', 'legacy'],
      'create.err.': ['class', 'customClass', 'background', 'customBackground', 'species', 'customSpecies', 'speciesOption', 'standardArray', 'pointBuy', 'manualRange', 'bonus'],
      'scroll.from.': ['character', 'srd', 'item'],
      'kind.': ['all', 'attack', 'feature', 'spell', 'scroll', 'potion', 'scrollPotion', 'item'],
      // built-in tags have labels; a missing one would show the raw id
      'tag.': [...BUILT_IN_TAGS],
      'filter.group.': FILTER_GROUPS,
      'strip.shape.': ['sphere', 'cone', 'cube', 'line', 'cylinder', 'emanation', 'radius', 'square'],
      'rules.': ['turn', 'actions', 'conditions', 'rest', 'concentration', 'dying', 'changes', 'about'],
    }
    const missing = Object.entries(families).flatMap(([p, ks]) => ks.map((k) => p + k).filter((k) => !(k in en)))
    expect(missing).toEqual([])
  })
})
