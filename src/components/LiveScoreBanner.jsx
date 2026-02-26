import TeamFlag from './TeamFlag';
import { MATCH_STATUS } from '../utils/constants';
import styles from './LiveScoreBanner.module.css';

const isLive = (status) =>
  status === MATCH_STATUS.IN_PLAY || status === MATCH_STATUS.PAUSED;

const formatLastUpdated = (date) => {
  if (!date) return '';
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
};

/**
 * Full-width banner that shows live match scores at the top of the home page.
 * Only renders when at least one match is IN_PLAY or PAUSED.
 *
 * Props:
 *   matches      – today's matches array
 *   lastUpdated  – Date of last successful fetch
 *   onRefresh    – callback to manually trigger re-fetch
 */
export default function LiveScoreBanner({ matches, lastUpdated, onRefresh }) {
  const liveMatches = matches.filter((m) => isLive(m.status));

  if (liveMatches.length === 0) return null;

  return (
    <div className={styles.banner}>
      {/* Header bar */}
      <div className={styles.bannerHeader}>
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          <span className={styles.liveText}>LIVE NOW</span>
          <span className={styles.matchCount}>
            {liveMatches.length} match{liveMatches.length > 1 ? 'es' : ''}
          </span>
        </div>

        <div className={styles.updateInfo}>
          <span className={styles.lastUpdated}>
            Updated {formatLastUpdated(lastUpdated)}
          </span>
          <button
            className={styles.refreshBtn}
            onClick={onRefresh}
            title="Refresh scores"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Match score cards */}
      <div className={styles.scoresRow}>
        {liveMatches.map((match) => (
          <div key={match.id} className={styles.scoreCard}>
            {/* Home team */}
            <div className={styles.team}>
              <TeamFlag
                crest={match.homeTeam.crest}
                tla={match.homeTeam.tla}
                name={match.homeTeam.name}
                size={36}
              />
              <span className={styles.teamName}>{match.homeTeam.shortName}</span>
            </div>

            {/* Score */}
            <div className={styles.scoreBlock}>
              <div className={styles.score}>
                <span className={styles.scoreNum}>{match.score.home ?? 0}</span>
                <span className={styles.scoreDash}>–</span>
                <span className={styles.scoreNum}>{match.score.away ?? 0}</span>
              </div>
              <div className={styles.statusRow}>
                {match.status === MATCH_STATUS.PAUSED ? (
                  <span className={styles.htBadge}>HALF TIME</span>
                ) : (
                  <span className={styles.inPlayBadge}>
                    <span className={styles.dot} />
                    IN PLAY
                  </span>
                )}
              </div>
              {/* Half-time score if available */}
              {match.score.halfHome !== null && (
                <div className={styles.htScore}>
                  HT: {match.score.halfHome} – {match.score.halfAway}
                </div>
              )}
            </div>

            {/* Away team */}
            <div className={`${styles.team} ${styles.teamRight}`}>
              <TeamFlag
                crest={match.awayTeam.crest}
                tla={match.awayTeam.tla}
                name={match.awayTeam.name}
                size={36}
              />
              <span className={styles.teamName}>{match.awayTeam.shortName}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
