import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { STAGE_POINTS } from '../utils/scoring';
import { STAGE_ORDER } from '../utils/constants';
import styles from './RulesPage.module.css';

// Show stages in canonical tournament order. Drives both the desktop table
// and the mobile stacked-card layout — single source so neither drifts.
const STAGE_ROWS = STAGE_ORDER.map((stage) => ({
  stage,
  ...STAGE_POINTS[stage],
}));

export default function RulesPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const changesRef = useRef(null);

  // React Router doesn't auto-scroll to hash anchors. The HomePage banner
  // links to /rules#changes — handle the scroll here so the diff section
  // pops into view on arrival.
  useEffect(() => {
    if (location.hash === '#changes' && changesRef.current) {
      changesRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>🎲 {t('rules.pageTitle')}</h1>
        <p className={styles.sub}>{t('rules.pageSubtitle')}</p>
      </div>

      {/* ─── Section 1: v2.0 What's New (diff hero) ─────────────────────── */}
      <section
        id="changes"
        ref={changesRef}
        className={`${styles.card} ${styles.changesCard}`}
        aria-labelledby="rules-changes-title"
      >
        <span className={styles.changesEyebrow}>{t('rules.changesEyebrow')}</span>
        <h2 id="rules-changes-title" className={styles.changesTitle}>
          {t('rules.changesTitle')}
        </h2>

        <div className={styles.diffGrid} role="table" aria-label={t('rules.changesTitle')}>
          <div className={styles.diffHeadRow} role="row">
            <span className={styles.diffHeadSpacer} role="columnheader" />
            <span className={styles.diffHeadOld} role="columnheader">OLD</span>
            <span className={styles.diffHeadNew} role="columnheader">NEW</span>
          </div>

          {['knockout', 'regulation', 'group'].map((key) => (
            <div key={key} className={styles.diffRow} role="row">
              <span className={styles.diffLabel} role="rowheader">
                {t(`rules.diff.label.${key}`)}
              </span>
              <span className={styles.diffOld} role="cell">
                {t(`rules.diff.${key}.old`)}
              </span>
              <span className={styles.diffArrow} aria-hidden="true">→</span>
              <span className={styles.diffNew} role="cell">
                {t(`rules.diff.${key}.new`)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Section 2: Stage ladder table ──────────────────────────────── */}
      <section className={styles.card} aria-labelledby="rules-ladder-title">
        <h2 id="rules-ladder-title" className={styles.sectionTitle}>
          🪜 {t('rules.stageLadderTitle')}
        </h2>
        <p className={styles.intro}>{t('rules.stageLadderIntro')}</p>

        {/* Desktop / tablet: data table */}
        <div className={styles.tableWrap}>
          <table className={styles.stageTable}>
            <thead>
              <tr>
                <th>{t('rules.stageLadderHeaders.stage')}</th>
                <th className={styles.tNum}>{t('rules.stageLadderHeaders.correct')}</th>
                <th className={styles.tNum}>{t('rules.stageLadderHeaders.exact')}</th>
                <th className={styles.tNum}>{t('rules.stageLadderHeaders.exactHigh')}</th>
              </tr>
            </thead>
            <tbody>
              {STAGE_ROWS.map(({ stage, correct, exact, exactHighScoring }) => {
                const isGroup = stage === 'GROUP_STAGE';
                const isFinal = stage === 'FINAL';
                const rowClass = [
                  styles.stageRow,
                  isGroup ? styles.stageRowGroup : styles.stageRowKnockout,
                  isFinal ? styles.stageRowFinal : '',
                ].filter(Boolean).join(' ');
                return (
                  <tr key={stage} className={rowClass}>
                    <td className={styles.stageCell}>
                      {isGroup ? (
                        <span className={styles.stageChipGroup}>{t(`stages.${stage}`)}</span>
                      ) : (
                        <span className={styles.stageChipKnockout}>{t(`stages.${stage}`)}</span>
                      )}
                    </td>
                    <td className={`${styles.tNum} numerals ${isFinal ? styles.tNumFinal : ''}`}>{correct}</td>
                    <td className={`${styles.tNum} numerals ${isFinal ? styles.tNumFinal : ''}`}>{exact}</td>
                    <td className={`${styles.tNum} numerals ${isFinal ? styles.tNumFinal : ''}`}>{exactHighScoring}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards */}
        <ul className={styles.stageCards}>
          {STAGE_ROWS.map(({ stage, correct, exact, exactHighScoring }) => {
            const isGroup = stage === 'GROUP_STAGE';
            const isFinal = stage === 'FINAL';
            return (
              <li
                key={stage}
                className={`${styles.stageCardItem} ${isGroup ? styles.stageCardGroup : styles.stageCardKnockout} ${isFinal ? styles.stageCardFinal : ''}`}
              >
                {isGroup ? (
                  <span className={styles.stageChipGroup}>{t(`stages.${stage}`)}</span>
                ) : (
                  <span className={styles.stageChipKnockout}>{t(`stages.${stage}`)}</span>
                )}
                <dl className={styles.stageCardGrid}>
                  <div>
                    <dt>{t('rules.stageLadderHeaders.correct')}</dt>
                    <dd className={`numerals ${isFinal ? styles.tNumFinal : ''}`}>{correct}</dd>
                  </div>
                  <div>
                    <dt>{t('rules.stageLadderHeaders.exact')}</dt>
                    <dd className={`numerals ${isFinal ? styles.tNumFinal : ''}`}>{exact}</dd>
                  </div>
                  <div>
                    <dt>{t('rules.stageLadderHeaders.exactHigh')}</dt>
                    <dd className={`numerals ${isFinal ? styles.tNumFinal : ''}`}>{exactHighScoring}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ─── Section 3: Regulation-time rule ────────────────────────────── */}
      <section className={`${styles.card} ${styles.regCard}`} aria-labelledby="rules-reg-title">
        <h2 id="rules-reg-title" className={styles.sectionTitle}>
          <span className={styles.regChip}>90'</span>
          {t('rules.regulationTitle')}
        </h2>
        <p className={styles.body}>{t('rules.regulationBody')}</p>

        <div className={styles.regExamples}>
          <div className={styles.regExample}>
            <span className={styles.regExampleLabel}>{t('rules.regulationExampleBroadcast')}</span>
            <span className={`${styles.regExampleScoreBroadcast} numerals`}>
              {t('rules.regulationExampleFinal', { home: 2, away: 1 })}
            </span>
          </div>
          <div className={`${styles.regExample} ${styles.regExampleScored}`}>
            <span className={styles.regExampleLabel}>{t('rules.regulationExampleScored')}</span>
            <span className={`${styles.regExampleScore} numerals`}>
              {t('rules.regulationExampleScore', { home: 1, away: 1 })}
            </span>
          </div>
        </div>

        <p className={styles.regWarn}>⚠️ {t('rules.regulationUnresolved')}</p>
      </section>

      {/* ─── Section 4: Bonuses & tournament bets ───────────────────────── */}
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>🏆 {t('rules.bonusesTitle')}</h2>
        <ul className={styles.rulesList}>
          <li>
            <span className={styles.icon} aria-hidden="true">🎯</span>
            <span>{t('home.rules.exactScoreBonus')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">🏆</span>
            <span>{t('home.rules.tournamentWinner')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">⚽</span>
            <span>{t('home.rules.topScorer')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">🎯</span>
            <span>{t('home.rules.topAssist')}</span>
          </li>
        </ul>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>ℹ️ {t('rules.howScoringWorksTitle')}</h2>
        <p className={styles.body}>{t('rules.howScoringWorksBody')}</p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>🎯 {t('rules.exactScoreBonusTitle')}</h2>
        <p className={styles.body}>{t('rules.exactScoreBonusBody')}</p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>👁️ {t('rules.privacyTitle')}</h2>
        <p className={styles.body}>{t('rules.privacyBody')}</p>
      </section>
    </main>
  );
}
