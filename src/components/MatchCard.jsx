import { useTranslation } from 'react-i18next';
import TeamFlag from './TeamFlag';
import styles from './MatchCard.module.css';
import { MATCH_STATUS } from '../utils/constants';

const statusKey = (status) => {
  switch (status) {
    case MATCH_STATUS.FINISHED: return { key: 'finished', cls: 'finished' };
    case MATCH_STATUS.IN_PLAY: return { key: 'live', cls: 'live' };
    case MATCH_STATUS.PAUSED: return { key: 'halfTime', cls: 'live' };
    case MATCH_STATUS.POSTPONED: return { key: 'postponed', cls: 'postponed' };
    case MATCH_STATUS.CANCELLED: return { key: 'cancelled', cls: 'postponed' };
    default: return { key: 'scheduled', cls: 'scheduled' };
  }
};

export default function MatchCard({ match, compact = false, onClick }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  const formatDate = (utcDate) =>
    new Date(utcDate).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const formatTime = (utcDate) =>
    new Date(utcDate).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const { key: stKey, cls: stCls } = statusKey(match.status);
  const isFinished = match.status === MATCH_STATUS.FINISHED;
  const isLive =
    match.status === MATCH_STATUS.IN_PLAY || match.status === MATCH_STATUS.PAUSED;

  return (
    <article
      className={`${styles.card} ${compact ? styles.compact : ''} ${onClick ? styles.clickable : ''}`}
      onClick={onClick ? () => onClick(match) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(match); } : undefined}
    >
      <div className={styles.meta}>
        <span className={`${styles.statusBadge} ${styles[stCls]}`}>{t(`matchStatus.${stKey}`)}</span>
        <span className={styles.date}>{formatDate(match.utcDate)}</span>
        {!isFinished && <span className={styles.time}>{formatTime(match.utcDate)}</span>}
        {match.group && <span className={styles.group}>{match.group}</span>}
      </div>

      <div className={styles.teams}>
        <div className={styles.team}>
          <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} />
          <span className={styles.teamName}>{match.homeTeam.shortName}</span>
        </div>

        <div className={`${styles.score} ${isLive ? styles.scoreLive : ''}`}>
          {isFinished || isLive
            ? `${match.score.home ?? 0} – ${match.score.away ?? 0}`
            : t('matchCard.vs')}
        </div>

        <div className={`${styles.team} ${styles.teamRight}`}>
          <span className={styles.teamName}>{match.awayTeam.shortName}</span>
          <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} />
        </div>
      </div>

      {isFinished && match.score.halfHome !== null && !compact && (
        <p className={styles.ht}>
          {t('matchCard.halfTime')}: {match.score.halfHome} – {match.score.halfAway}
        </p>
      )}
    </article>
  );
}
