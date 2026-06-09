import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import serverApi from '../services/serverApi';
import { MATCH_STATUS, REG_STATUS } from '../utils/constants';
import TeamFlag from './TeamFlag';
import styles from './LiveBetsReveal.module.css';

const isMatchLive = (status) =>
  status === MATCH_STATUS.IN_PLAY || status === MATCH_STATUS.PAUSED;

const isMatchStarted = (status) =>
  status === MATCH_STATUS.IN_PLAY ||
  status === MATCH_STATUS.PAUSED ||
  status === MATCH_STATUS.FINISHED;

const getPredictionResult = (prediction, liveScore) => {
  if (!prediction || liveScore.home === null) return 'pending';
  if (prediction.home === liveScore.home && prediction.away === liveScore.away) return 'exact';
  const predResult =
    prediction.home > prediction.away ? 'home' :
    prediction.home < prediction.away ? 'away' : 'draw';
  const liveResult =
    liveScore.home > liveScore.away ? 'home' :
    liveScore.home < liveScore.away ? 'away' : 'draw';
  if (predResult === liveResult) return 'result';
  return 'wrong';
};

export default function LiveBetsReveal({ matches, users, currentUserId }) {
  const { t } = useTranslation();
  // { [matchId]: { [userId]: { home, away } } }
  const [allPredictions, setAllPredictions] = useState({});

  // Only show matches that have already kicked off
  const startedMatches = matches.filter((m) => isMatchStarted(m.status));

  // Stable cache key — prevents re-fetching on every poll cycle.
  const startedMatchKey = startedMatches.map((m) => m.id).sort().join(',');

  useEffect(() => {
    if (!startedMatchKey) return;
    const fetchPredictions = async () => {
      try {
        const { data } = await serverApi.get('/predictions', {
          params: { matchIds: startedMatchKey },
        });
        const map = {};
        data.forEach((row) => {
          if (!map[row.match_id]) map[row.match_id] = {};
          map[row.match_id][row.user_id] = { home: row.home, away: row.away };
        });
        setAllPredictions(map);
      } catch (err) {
        console.error('[LiveBetsReveal] fetchPredictions error:', err.message);
      }
    };
    fetchPredictions();
  }, [startedMatchKey]);

  if (startedMatches.length === 0) return null;

  const approvedUsers = users.filter((u) => u.status === REG_STATUS.APPROVED);

  const resultIcon = {
    exact: '🎯',
    result: '✅',
    wrong: '❌',
    pending: '⏳',
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>
        🔴 {t('liveBets.title')}
        <span className={styles.subtitle}>{t('liveBets.subtitle')}</span>
      </h2>

      <div className={styles.matchesStack}>
        {startedMatches.map((match) => {
          const isLive = isMatchLive(match.status);
          const liveScore = match.score;
          const matchPreds = allPredictions[String(match.id)] ?? {};

          const rows = approvedUsers.map((u) => {
            const pred = matchPreds[u.id] ?? null;
            const result = pred ? getPredictionResult(pred, liveScore) : null;
            return { user: u, pred, result };
          });

          const anyPrediction = rows.some((r) => r.pred);

          return (
            <div key={match.id} className={styles.matchBlock}>
              <div className={styles.matchHeader}>
                <div className={styles.matchTeams}>
                  <div className={styles.teamInline}>
                    <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} size={22} />
                    <span>{match.homeTeam.shortName}</span>
                  </div>

                  <div className={styles.liveScore}>
                    {isLive && <span className={styles.liveDot} />}
                    <span className={isLive ? styles.scoreTextLive : styles.scoreText}>
                      {liveScore.home ?? 0} – {liveScore.away ?? 0}
                    </span>
                    {match.status === MATCH_STATUS.PAUSED && (
                      <span className={styles.htBadge}>{t('matchStatus.halfTime')}</span>
                    )}
                    {match.status === MATCH_STATUS.FINISHED && (
                      <span className={styles.ftBadge}>{t('matchStatus.finished')}</span>
                    )}
                  </div>

                  <div className={`${styles.teamInline} ${styles.teamRight}`}>
                    <span>{match.awayTeam.shortName}</span>
                    <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} size={22} />
                  </div>
                </div>
              </div>

              {!anyPrediction ? (
                <p className={styles.noPreds}>{t('liveBets.noPredictions')}</p>
              ) : (
                <table className={styles.predsTable}>
                  <thead>
                    <tr>
                      <th>{t('liveBets.table.player')}</th>
                      <th className={styles.thScore}>{t('liveBets.table.predictedScore')}</th>
                      <th className={styles.thStatus}>{t('liveBets.table.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .sort((a, b) => {
                        const order = { exact: 0, result: 1, wrong: 2, pending: 3, null: 4 };
                        return (order[a.result] ?? 4) - (order[b.result] ?? 4);
                      })
                      .map(({ user: u, pred, result }) => (
                        <tr
                          key={u.id}
                          className={`
                            ${u.id === currentUserId ? styles.youRow : ''}
                            ${result ? styles[`row_${result}`] : ''}
                          `}
                        >
                          <td className={styles.playerCell}>
                            <span className={styles.playerName}>{u.name}</span>
                            {u.id === currentUserId && (
                              <span className={styles.youTag}>{t('leaderboard.you')}</span>
                            )}
                          </td>

                          <td className={styles.predScore}>
                            {pred ? (
                              <span className={styles.scoreChip}>
                                {pred.home} – {pred.away}
                              </span>
                            ) : (
                              <span className={styles.noBet}>{t('liveBets.result.noBet')}</span>
                            )}
                          </td>

                          <td className={styles.resultCell}>
                            {pred ? (
                              <span className={`${styles.badge} ${styles[`badge_${result}`]}`}>
                                {resultIcon[result] ?? ''} {t(`liveBets.result.${result}`)}
                              </span>
                            ) : (
                              <span className={styles.badge}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
