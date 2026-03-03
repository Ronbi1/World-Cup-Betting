import { useState, useEffect } from 'react';
import serverApi from '../services/serverApi';
import { MATCH_STATUS, REG_STATUS } from '../utils/constants';
import TeamFlag from './TeamFlag';
import styles from './LiveBetsReveal.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isMatchLive = (status) =>
  status === MATCH_STATUS.IN_PLAY || status === MATCH_STATUS.PAUSED;

const isMatchStarted = (status) =>
  status === MATCH_STATUS.IN_PLAY ||
  status === MATCH_STATUS.PAUSED ||
  status === MATCH_STATUS.FINISHED;

// Decide who "won" the prediction battle based on current live score
const getPredictionResult = (prediction, liveScore) => {
  if (!prediction || liveScore.home === null) return 'pending';
  // Exact score match so far
  if (prediction.home === liveScore.home && prediction.away === liveScore.away) return 'exact';
  // Correct result direction
  const predResult =
    prediction.home > prediction.away ? 'home' :
    prediction.home < prediction.away ? 'away' : 'draw';
  const liveResult =
    liveScore.home > liveScore.away ? 'home' :
    liveScore.home < liveScore.away ? 'away' : 'draw';
  if (predResult === liveResult) return 'result';
  return 'wrong';
};

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * Shows all users' predictions for matches that have already kicked off.
 * Bets are hidden (locked) until the match starts — only revealed once live.
 *
 * Props:
 *   matches        – all today's matches (or all matches)
 *   users          – approved users from AuthContext
 *   currentUserId  – to highlight the current user's row
 */
export default function LiveBetsReveal({ matches, users, currentUserId }) {
  // { [matchId]: { [userId]: { home, away } } }
  const [allPredictions, setAllPredictions] = useState({});

  // Only show matches that have already started (live or finished today)
  const startedMatches = matches.filter((m) => isMatchStarted(m.status));

  // Use a stable key: sorted comma-separated IDs of started matches.
  // This prevents re-fetching on every poll cycle when the match list hasn't changed.
  const startedMatchKey = startedMatches.map((m) => m.id).sort().join(',');

  // Fetch predictions from Express for all started matches
  useEffect(() => {
    if (!startedMatchKey) return;

    const fetchPredictions = async () => {
      try {
        const { data } = await serverApi.get('/predictions', {
          params: { matchIds: startedMatchKey },
        });
        // Build nested map: { [matchId]: { [userId]: { home, away } } }
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

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>
        🔴 Live Predictions Revealed
        <span className={styles.subtitle}>Bets are shown once a match kicks off</span>
      </h2>

      <div className={styles.matchesStack}>
        {startedMatches.map((match) => {
          const isLive = isMatchLive(match.status);
          const liveScore = match.score;
          const matchPreds = allPredictions[String(match.id)] ?? {};

          // Collect predictions from every approved user for this match
          const rows = approvedUsers.map((u) => {
            const pred = matchPreds[u.id] ?? null;
            const result = pred ? getPredictionResult(pred, liveScore) : null;
            return { user: u, pred, result };
          });

          const anyPrediction = rows.some((r) => r.pred);

          return (
            <div key={match.id} className={styles.matchBlock}>
              {/* Match header */}
              <div className={styles.matchHeader}>
                <div className={styles.matchTeams}>
                  <div className={styles.teamInline}>
                    <TeamFlag
                      crest={match.homeTeam.crest}
                      tla={match.homeTeam.tla}
                      name={match.homeTeam.name}
                      size={22}
                    />
                    <span>{match.homeTeam.shortName}</span>
                  </div>

                  <div className={styles.liveScore}>
                    {isLive && <span className={styles.liveDot} />}
                    <span className={isLive ? styles.scoreTextLive : styles.scoreText}>
                      {liveScore.home ?? 0} – {liveScore.away ?? 0}
                    </span>
                    {match.status === MATCH_STATUS.PAUSED && (
                      <span className={styles.htBadge}>HT</span>
                    )}
                    {match.status === MATCH_STATUS.FINISHED && (
                      <span className={styles.ftBadge}>FT</span>
                    )}
                  </div>

                  <div className={`${styles.teamInline} ${styles.teamRight}`}>
                    <span>{match.awayTeam.shortName}</span>
                    <TeamFlag
                      crest={match.awayTeam.crest}
                      tla={match.awayTeam.tla}
                      name={match.awayTeam.name}
                      size={22}
                    />
                  </div>
                </div>
              </div>

              {/* Predictions table */}
              {!anyPrediction ? (
                <p className={styles.noPreds}>Nobody placed a prediction for this match.</p>
              ) : (
                <table className={styles.predsTable}>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th className={styles.thScore}>Predicted Score</th>
                      <th className={styles.thStatus}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .sort((a, b) => {
                        // Sort: exact → result → wrong → no bet
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
                              <span className={styles.youTag}>you</span>
                            )}
                          </td>

                          <td className={styles.predScore}>
                            {pred ? (
                              <span className={styles.scoreChip}>
                                {pred.home} – {pred.away}
                              </span>
                            ) : (
                              <span className={styles.noBet}>No bet</span>
                            )}
                          </td>

                          <td className={styles.resultCell}>
                            {pred ? (
                              <span className={`${styles.badge} ${styles[`badge_${result}`]}`}>
                                {result === 'exact'   && '🎯 Exact!'}
                                {result === 'result'  && '✅ Correct result'}
                                {result === 'wrong'   && '❌ Wrong'}
                                {result === 'pending' && '⏳ Pending'}
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
