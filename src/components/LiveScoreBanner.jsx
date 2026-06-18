import { useTranslation } from 'react-i18next';
import TeamFlag from './TeamFlag';
import MatchTimeline from './MatchTimeline';
import { MATCH_STATUS } from '../utils/constants';
import styles from './LiveScoreBanner.module.css';

const isLive = (status) =>
  status === MATCH_STATUS.IN_PLAY || status === MATCH_STATUS.PAUSED;

export default function LiveScoreBanner({ matches }) {
  const { t } = useTranslation();
  const liveMatches = matches.filter((m) => isLive(m.status));

  if (liveMatches.length === 0) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.scoresRow}>
        {liveMatches.map((match) => {
          const events = (match.events || []).filter(
            (e) => e.kind === 'goal' || e.kind === 'yellow' || e.kind === 'red',
          );
          return (
            <div key={match.id} className={styles.scoreCard}>
              <div className={styles.scoreCardMain}>
                <div className={styles.team}>
                  <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} size={36} />
                  <span className={styles.teamName}>{match.homeTeam.shortName}</span>
                </div>

                <div className={styles.scoreBlock}>
                  <div className={styles.score}>
                    <span className={styles.scoreNum}>{match.score.home ?? 0}</span>
                    <span className={styles.scoreDash}>–</span>
                    <span className={styles.scoreNum}>{match.score.away ?? 0}</span>
                  </div>
                  <div className={styles.statusRow}>
                    {match.status === MATCH_STATUS.PAUSED ? (
                      <span className={styles.htBadge}>{t('matchStatus.halfTime')}</span>
                    ) : (
                      <span className={styles.inPlayBadge}>
                        <span className={styles.dot} />
                        {match.timeElapsed
                          ? `${match.timeElapsed}'`
                          : t('matchStatus.live')}
                      </span>
                    )}
                  </div>
                  {match.score.halfHome !== null && (
                    <div className={styles.htScore}>
                      {t('matchStatus.halfTime')}: {match.score.halfHome} – {match.score.halfAway}
                    </div>
                  )}
                </div>

                <div className={`${styles.team} ${styles.teamRight}`}>
                  <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} size={36} />
                  <span className={styles.teamName}>{match.awayTeam.shortName}</span>
                </div>
              </div>

              {events.length > 0 && (
                <div className={styles.bannerEvents}>
                  <MatchTimeline events={events} match={match} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
