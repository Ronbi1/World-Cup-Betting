import { useTranslation } from 'react-i18next';
import TeamFlag from './TeamFlag';
import styles from './MatchCard.module.css';
import { MATCH_STATUS } from '../utils/constants';
import { formatMatchDate, formatMatchTime, formatKickoffCountdown } from '../utils/matchTime';

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

// `now` is supplied by the parent list page via `useMinuteTick()` so every
// card on the page re-renders against the same instant once per minute,
// avoiding N independent intervals. Standalone callers (e.g. tests, future
// solo use) can omit `now` and the helper falls back to `Date.now()`.
export default function MatchCard({ match, compact = false, onClick, now, userPrediction }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  const formatDate = (utcDate) => formatMatchDate(utcDate, locale);
  const formatTime = (utcDate) => formatMatchTime(utcDate, locale);

  const { key: stKey, cls: stCls } = statusKey(match.status);
  const isFinished = match.status === MATCH_STATUS.FINISHED;
  const isLive =
    match.status === MATCH_STATUS.IN_PLAY || match.status === MATCH_STATUS.PAUSED;
  const isKnockoutStage = match.stage && match.stage !== 'GROUP_STAGE';

  // Only show a countdown for upcoming matches. Postponed/cancelled keep
  // their badge and skip the countdown to avoid a misleading "Starts in
  // 3d" next to a "PPD" badge. `formatKickoffCountdown` also returns null
  // once kickoff is in the past, so live/finished naturally suppress.
  //
  // When `now` is omitted by the caller, the helper falls back to its
  // own `Date.now()` default; we deliberately don't read the clock here
  // in render to keep this component pure (react-hooks/purity rule).
  const isUpcoming =
    match.status === MATCH_STATUS.SCHEDULED || match.status === MATCH_STATUS.TIMED;
  const countdownText = isUpcoming
    ? formatKickoffCountdown(match.utcDate, t, now)
    : null;

  const hasUserPrediction = userPrediction != null;

  return (
    <article
      className={`${styles.card} ${compact ? styles.compact : ''} ${onClick ? styles.clickable : ''} ${hasUserPrediction ? styles.hasPrediction : ''}`}
      onClick={onClick ? () => onClick(match) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(match); } : undefined}
    >
      <div className={styles.meta}>
        <span className={`${styles.statusBadge} ${styles[stCls]}`}>{t(`matchStatus.${stKey}`)}</span>
        <span className={styles.date}>{formatDate(match.utcDate)}</span>
        {!isFinished && <span className={styles.time}>{formatTime(match.utcDate)}</span>}
        {countdownText && (
          <span className={styles.countdown}>{countdownText}</span>
        )}
        {isKnockoutStage && (
          <span className={styles.stageBadge}>{t(`stages.${match.stage}`)}</span>
        )}
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

      {hasUserPrediction && (
        <p className={styles.yourPick}>
          {t('matchCard.yourPick', { home: userPrediction.home, away: userPrediction.away })}
        </p>
      )}
    </article>
  );
}
