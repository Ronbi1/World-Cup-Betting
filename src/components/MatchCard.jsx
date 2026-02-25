import TeamFlag from './TeamFlag';
import styles from './MatchCard.module.css';
import { MATCH_STATUS } from '../utils/constants';

const statusLabel = (status) => {
  switch (status) {
    case MATCH_STATUS.FINISHED: return { text: 'FT', cls: styles.finished };
    case MATCH_STATUS.IN_PLAY: return { text: 'LIVE', cls: styles.live };
    case MATCH_STATUS.PAUSED: return { text: 'HT', cls: styles.live };
    case MATCH_STATUS.POSTPONED: return { text: 'PPD', cls: styles.postponed };
    case MATCH_STATUS.CANCELLED: return { text: 'CNX', cls: styles.postponed };
    default: return { text: 'SCH', cls: styles.scheduled };
  }
};

const formatDate = (utcDate) => {
  const d = new Date(utcDate);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (utcDate) => {
  const d = new Date(utcDate);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export default function MatchCard({ match, compact = false }) {
  const { text: stTxt, cls: stCls } = statusLabel(match.status);
  const isFinished = match.status === MATCH_STATUS.FINISHED;
  const isLive =
    match.status === MATCH_STATUS.IN_PLAY || match.status === MATCH_STATUS.PAUSED;

  return (
    <article className={`${styles.card} ${compact ? styles.compact : ''}`}>
      <div className={styles.meta}>
        <span className={`${styles.statusBadge} ${stCls}`}>{stTxt}</span>
        <span className={styles.date}>{formatDate(match.utcDate)}</span>
        {!isFinished && <span className={styles.time}>{formatTime(match.utcDate)}</span>}
        {match.group && <span className={styles.group}>{match.group}</span>}
      </div>

      <div className={styles.teams}>
        {/* Home */}
        <div className={styles.team}>
          <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} />
          <span className={styles.teamName}>{match.homeTeam.shortName}</span>
        </div>

        {/* Score or VS */}
        <div className={`${styles.score} ${isLive ? styles.scoreLive : ''}`}>
          {isFinished || isLive
            ? `${match.score.home ?? 0} – ${match.score.away ?? 0}`
            : 'vs'}
        </div>

        {/* Away */}
        <div className={`${styles.team} ${styles.teamRight}`}>
          <span className={styles.teamName}>{match.awayTeam.shortName}</span>
          <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} />
        </div>
      </div>

      {isFinished && match.score.halfHome !== null && !compact && (
        <p className={styles.ht}>
          Half-time: {match.score.halfHome} – {match.score.halfAway}
        </p>
      )}
    </article>
  );
}
