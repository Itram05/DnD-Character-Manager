import { useState } from 'react'
import { CHANGES, REST_TIPS, TURN_SUMMARY } from '../content/rulesHelp.en'
import { SRD_ATTRIBUTION, SRD_CONDITIONS, SRD_META, glossary } from '../data/srd'
import { t } from '../i18n'
import { RichText } from './common'

const ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize']
const SECTIONS = ['turn', 'actions', 'conditions', 'rest', 'concentration', 'dying', 'changes', 'about'] as const
type Section = (typeof SECTIONS)[number]

function Entry({ name, text }: { name: string; text: string }) {
  return (
    <details className="entry">
      <summary>{name}</summary>
      <RichText text={text} />
    </details>
  )
}

export function RulesView({ onBack }: { onBack: () => void }) {
  const [sec, setSec] = useState<Section>('turn')
  return (
    <div className="rules-page">
      <header className="list-head">
        <button className="btn" onClick={onBack}>
          ‹ {t('common.back')}
        </button>
        <h1>{t('rules.title')}</h1>
      </header>
      <nav className="rules-nav segmented wrap" aria-label={t('rules.title')}>
        {SECTIONS.map((s) => (
          <button key={s} className={sec === s ? 'active' : ''} onClick={() => setSec(s)}>
            {t(`rules.${s}`)}
          </button>
        ))}
      </nav>

      <article className="panel rules-body">
        {sec === 'turn' && (
          <>
            <h2>{t('rules.turn')}</h2>
            <ul className="big-list">
              {TURN_SUMMARY.map((l, i) => (
                <li key={i}>
                  <RichText text={l} />
                </li>
              ))}
            </ul>
            <Entry name="Bonus Action" text={glossary('Bonus Action')} />
            <Entry name="Reaction" text={glossary('Reaction')} />
            <Entry name="Opportunity Attacks" text={glossary('Opportunity Attacks')} />
            <Entry name="Initiative" text={glossary('Initiative')} />
            <Entry name="Surprise" text={glossary('Surprise')} />
            <Entry name="Advantage" text={glossary('Advantage')} />
            <Entry name="Disadvantage" text={glossary('Disadvantage')} />
            <Entry name="Critical Hit" text={glossary('Critical Hit')} />
            <Entry name="Heroic Inspiration" text={glossary('Heroic Inspiration')} />
          </>
        )}
        {sec === 'actions' && (
          <>
            <h2>{t('rules.actions')}</h2>
            <RichText text={glossary('Action')} />
            {ACTIONS.map((a) => (
              <Entry key={a} name={a} text={glossary(a)} />
            ))}
            <Entry name="Unarmed Strike (Grapple, Shove)" text={glossary('Unarmed Strike')} />
            <Entry name="Grappling" text={glossary('Grappling')} />
          </>
        )}
        {sec === 'conditions' && (
          <>
            <h2>{t('rules.conditions')}</h2>
            {SRD_CONDITIONS.map((c) => (
              <Entry key={c.id} name={c.name} text={c.text} />
            ))}
          </>
        )}
        {sec === 'rest' && (
          <>
            <h2>{t('rules.rest')}</h2>
            <ul className="big-list">
              {REST_TIPS.map((l, i) => (
                <li key={i}>
                  <RichText text={l} />
                </li>
              ))}
            </ul>
            <Entry name="Short Rest" text={glossary('Short Rest')} />
            <Entry name="Long Rest" text={glossary('Long Rest')} />
            <Entry name="Hit Point Dice" text={glossary('Hit Point Dice')} />
          </>
        )}
        {sec === 'concentration' && (
          <>
            <h2>{t('rules.concentration')}</h2>
            <RichText text={glossary('Concentration')} />
            <p className="hint">{t('rules.concentrationApp')}</p>
          </>
        )}
        {sec === 'dying' && (
          <>
            <h2>{t('rules.dying')}</h2>
            <RichText text={glossary('Death Saving Throw')} />
            <ul className="big-list">
              <li>{t('rules.dying.1')}</li>
              <li>{t('rules.dying.2')}</li>
              <li>{t('rules.dying.3')}</li>
              <li>{t('rules.dying.4')}</li>
            </ul>
            <Entry name="Stable" text={glossary('Stable')} />
            <Entry name="Dead" text={glossary('Dead')} />
            <Entry name="Temporary Hit Points" text={glossary('Temporary Hit Points')} />
            <Entry name="Bloodied" text={glossary('Bloodied')} />
          </>
        )}
        {sec === 'changes' && (
          <>
            <h2>{t('rules.changes')}</h2>
            <p className="hint">{t('rules.changesIntro')}</p>
            <div className="changes-list">
              {CHANGES.map((ch) => (
                <div key={ch.topic} className="change">
                  <h3>{ch.topic}</h3>
                  <p className="before">
                    <span className="label">2014</span> {ch.before}
                  </p>
                  <p className="now">
                    <span className="label">2024</span> {ch.now}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
        {sec === 'about' && (
          <>
            <h2>{t('rules.about')}</h2>
            <p>{SRD_ATTRIBUTION}</p>
            <p className="hint">{t('rules.aboutChanges')}</p>
            <p className="muted">
              {t('rules.dataSource')}: {SRD_META.source} ({SRD_META.license})
            </p>
            <p className="muted">{t('rules.compat')}</p>
          </>
        )}
      </article>
    </div>
  )
}
