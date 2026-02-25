import { useState, useEffect } from 'react';
import { fetchScorers, parseApiError } from '../services/footballService';
import TeamFlag from '../components/TeamFlag';
import styles from './TopScorersPage.module.css';

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <tr className={styles.skeletonRow}>
      <td><div className={`${styles.shimmer}`} style={{ width: 24, height: 16, borderRadius: 4 }} /></td>
      <td>
        <div className={styles.playerCell}>
          <div className={`${styles.shimmer}`} style={{ width: 140, height: 16, borderRadius: 4 }} />
          <div className={`${styles.shimmer}`} style={{ width: 80, height: 12, borderRadius: 4, marginTop: 4 }} />
        </div>
      </td>
      <td>
        <div className={styles.teamCellSkeleton}>
          <div className={`${styles.shimmer}`} style={{ width: 24, height: 24, borderRadius: 4 }} />
          <div className={`${styles.shimmer}`} style={{ width: 100, height: 16, borderRadius: 4 }} />
        </div>
      </td>
      <td><div className={`${styles.shimmer}`} style={{ width: 28, height: 16, borderRadius: 4 }} /></td>
      <td><div className={`${styles.shimmer}`} style={{ width: 28, height: 16, borderRadius: 4 }} /></td>
      <td><div className={`${styles.shimmer}`} style={{ width: 28, height: 16, borderRadius: 4 }} /></td>
    </tr>
  );
}

const rankEmoji = (idx) => {
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return idx + 1;
};

export default function TopScorersPage() {
  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchScorers();
        if (!cancelled) setScorers(data);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>⚽ Golden Boot</h1>
        <p className={styles.sub}>FIFA World Cup 2026 · Top Scorers</p>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorBox}>
          <p>Failed to load scorers: {error}</p>
        </div>
      )}

      {/* Empty state (no data yet) */}
      {!loading && !error && scorers.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📊</div>
          <h3>No Scorer Data Yet</h3>
          <p>
            Top scorer data will be available once the tournament begins on{' '}
            <strong>June 11, 2026</strong>.
          </p>
        </div>
      )}

      {/* Table */}
      {(loading || scorers.length > 0) && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thRank}>#</th>
                <th>Player</th>
                <th>Team</th>
                <th className={styles.thStat} title="Goals">⚽</th>
                <th className={styles.thStat} title="Assists">🎯</th>
                <th className={styles.thStat} title="Penalty goals">🅿️</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                : scorers.map((scorer, idx) => (
                    <tr key={scorer.id ?? idx} className={idx < 3 ? styles.topThree : ''}>
                      <td className={styles.rank}>{rankEmoji(idx)}</td>
                      <td>
                        <div className={styles.playerCell}>
                          <span className={styles.playerName}>{scorer.name}</span>
                          {scorer.nationality && (
                            <span className={styles.nationality}>{scorer.nationality}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.teamCell}>
                          <TeamFlag
                            crest={scorer.teamCrest}
                            tla={scorer.team?.slice(0, 3).toUpperCase()}
                            name={scorer.team}
                            size={24}
                          />
                          <span className={styles.teamName}>{scorer.team}</span>
                        </div>
                      </td>
                      <td className={styles.goals}>{scorer.goals}</td>
                      <td className={styles.stat}>{scorer.assists ?? 0}</td>
                      <td className={styles.stat}>{scorer.penalties ?? 0}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.note}>
        Stats update after each match. Penalty goals are included in the total goals count.
      </p>
    </main>
  );
}
