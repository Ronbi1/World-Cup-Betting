import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TeamFlag from './TeamFlag';
import { formatMatchDate } from '../utils/matchTime';
import styles from './ChaosPickSpotlight.module.css';
import layout from './spotlightLayout.module.css';

function ChaosBody({ entry, isYou, t, villainLabel, compact }) {
  const { match, prediction, name } = entry;
  const home = match.homeTeam;
  const away = match.awayTeam;
  const actualHome = match.score.fullTime.home;
  const actualAway = match.score.fullTime.away;

  return (
    <div className={`${styles.stage} ${isYou ? styles.stageYou : ''}`}>
      <div className={`${styles.winnerHero} ${compact ? layout.compactWinnerHero : ''}`}>
        <span className={styles.winnerLabel}>{villainLabel}</span>
        <h3 className={`${styles.winnerName} ${compact ? layout.compactWinnerName : ''}`} title={name}>{name}</h3>
        {isYou && <span className={styles.youTag}>{t('chaos.yikesYou')}</span>}
      </div>

      <div className={styles.scoreboard}>
        <div className={`${styles.scoreboardInner} ${layout.scoreboardZone}`}>
          <div className={styles.teamSide}>
            <TeamFlag crest={home.crest} tla={home.tla} name={home.name} size={40} />
            <span className={styles.teamName}>{home.shortName || home.name}</span>
          </div>

          <div className={styles.scoreCenter}>
            <div className={styles.guessBlock}>
              <span className={styles.scoreLabel}>{t('chaos.guessed')}</span>
              <div className={styles.guessLine} aria-label={`${prediction.home} – ${prediction.away}`}>
                <span className={`${styles.guessDigit} numerals`}>{prediction.home}</span>
                <span className={styles.scoreDash} aria-hidden="true">–</span>
                <span className={`${styles.guessDigit} numerals`}>{prediction.away}</span>
              </div>
            </div>
            <span className={styles.arrow} aria-hidden="true">↓</span>
            <div className={styles.finalBlock}>
              <span className={styles.scoreLabel}>{t('chaos.final')}</span>
              <div className={styles.finalLine} aria-label={`${actualHome} – ${actualAway}`}>
                <span className={`${styles.finalDigit} numerals`}>{actualHome}</span>
                <span className={styles.scoreDash} aria-hidden="true">–</span>
                <span className={`${styles.finalDigit} numerals`}>{actualAway}</span>
              </div>
            </div>
            <span className={styles.missBadge}>{t('chaos.missBadge')}</span>
          </div>

          <div className={styles.teamSide}>
            <TeamFlag crest={away.crest} tla={away.tla} name={away.name} size={40} />
            <span className={styles.teamName}>{away.shortName || away.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ entry, locale }) {
  const home = entry.match.homeTeam;
  const away = entry.match.awayTeam;
  const actual = entry.match.score.fullTime;
  const pred = entry.prediction;

  return (
    <li className={`${layout.historyRow} ${styles.historyRow}`}>
      <span className={`${styles.historyDate} numerals`}>
        {formatMatchDate(`${entry.date}T12:00:00.000Z`, locale, { day: 'numeric', month: 'short' })}
      </span>
      <span className={styles.historyName} title={entry.name}>{entry.name}</span>
      <span className={styles.historyTeams}>
        {pred.home}–{pred.away} → {actual.home}–{actual.away}
      </span>
      <span className={styles.historyMeta}>
        {home.tla ?? home.shortName} vs {away.tla ?? away.shortName}
      </span>
    </li>
  );
}

export default function ChaosPickSpotlight({ data, loading, currentUserId, compact }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';
  const [historyOpen, setHistoryOpen] = useState(false);

  const villainLabel = useMemo(() => {
    const options = t('chaos.villain', { returnObjects: true });
    if (!Array.isArray(options) || options.length === 0) return String(t('chaos.villain'));
    if (!data?.primary?.date) return options[0];
    return options[Math.floor(Math.random() * options.length)];
  }, [t, i18n.resolvedLanguage, data?.primary?.date]);

  if (loading) {
    return (
      <article className={`${styles.card} ${layout.cardShell} ${styles.cardSkeleton}`} aria-busy="true" aria-label={villainLabel}>
        <div className={styles.skelTitle} />
        <div className={styles.skelScore} />
      </article>
    );
  }

  if (!data?.primary) return null;

  const { primary, history } = data;
  const isYou = primary.userId === currentUserId;

  const contextLine = t('chaos.context', {
    predHome: primary.prediction.home,
    predAway: primary.prediction.away,
    actualHome: primary.match.score.fullTime.home,
    actualAway: primary.match.score.fullTime.away,
    gap: primary.goalGap,
  });

  return (
    <article className={`${styles.card} ${layout.cardShell} ${isYou ? styles.cardYou : ''}`} aria-label={villainLabel}>
      <div className={styles.glow} aria-hidden="true" />

      <div className={layout.cardMain}>
        <ChaosBody entry={primary} isYou={isYou} t={t} villainLabel={villainLabel} compact={compact} />
      </div>

      <div className={layout.cardFooter}>
        <p className={`${styles.context} ${layout.contextBlock}`}>{contextLine}</p>

        {history.length > 0 && (
          <div className={layout.historyBlock}>
            <button
              type="button"
              className={`${layout.historyToggle} ${styles.historyToggle}`}
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
            >
              <span>{t('chaos.pastPicks', { count: history.length })}</span>
              <span className={`${styles.chevron} ${historyOpen ? styles.chevronOpen : ''}`} aria-hidden="true">
                ▾
              </span>
            </button>
            {historyOpen && (
              <ol className={layout.historyList}>
                {history.map((entry) => (
                  <HistoryRow key={entry.date} entry={entry} locale={locale} />
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
