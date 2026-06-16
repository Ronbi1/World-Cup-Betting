import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import serverApi from '../services/serverApi';
import { isTournamentStarted } from '../utils/constants';
import styles from './TopScorersPage.module.css';

export default function TopScorersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const started = isTournamentStarted();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(started);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!started) return;

    const fetchBets = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await serverApi.get('/users/tournament-bets');
        setRows(data ?? []);
      } catch (err) {
        console.error('[TopScorersPage] fetchBets error:', err.message);
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBets();
  }, [started]);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>⚽ {t('topScorers.title')}</h1>
        <p className={styles.sub}>{t('topScorers.subtitle')}</p>
      </div>

      {!started ? (
        <section className={styles.tableWrapper}>
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🔒</div>
            <h3>{t('topScorers.hiddenTitle')}</h3>
            <p>{t('topScorers.hiddenBody')}</p>
          </div>
        </section>
      ) : error ? (
        <div className={styles.errorBox}>{t('topScorers.fetchError')}</div>
      ) : loading ? (
        <section className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('topScorers.tableUser')}</th>
                <th>{t('topScorers.tableTournamentWinner')}</th>
                <th>{t('topScorers.tableTopScorer')}</th>
                <th>{t('topScorers.tableTopAssist')}</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className={styles.skeletonRow}>
                  <td><span className={`${styles.shimmer} ${styles.shimmerName}`} /></td>
                  <td><span className={`${styles.shimmer} ${styles.shimmerPick}`} /></td>
                  <td><span className={`${styles.shimmer} ${styles.shimmerPick}`} /></td>
                  <td><span className={`${styles.shimmer} ${styles.shimmerPick}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('topScorers.tableUser')}</th>
                <th>{t('topScorers.tableTournamentWinner')}</th>
                <th>{t('topScorers.tableTopScorer')}</th>
                <th>{t('topScorers.tableTopAssist')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isYou = row.id === user?.id;
                return (
                  <tr key={row.id} className={isYou ? styles.youRow : ''}>
                    <td>
                      <div className={styles.playerCell}>
                        <span className={styles.playerName}>{row.name}</span>
                        {isYou && (
                          <span className={styles.youTag}>{t('leaderboard.you')}</span>
                        )}
                      </div>
                    </td>
                    <td>{row.winningTeam ?? <span className={styles.na}>—</span>}</td>
                    <td>{row.topScorer ?? <span className={styles.na}>—</span>}</td>
                    <td>{row.topAssist ?? <span className={styles.na}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
