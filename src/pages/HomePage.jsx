import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { STORAGE_KEYS } from '../utils/constants';
import { useTodayMatches } from '../hooks/useTodayMatches';
import MatchCard from '../components/MatchCard';
import SkeletonCard from '../components/SkeletonCard';
import BetModal from '../components/BetModal';
import LiveBetsReveal from '../components/LiveBetsReveal';
import LiveScoreBanner from '../components/LiveScoreBanner';
import styles from './HomePage.module.css';

// ─── Score table helpers ──────────────────────────────────────────────────────
const loadScores = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SCORES) || '[]'); }
  catch { return []; }
};

export default function HomePage() {
  const { user, users } = useAuth();

  // Polling hook — auto-refreshes every 60s during live matches
  const { matches: todayMatches, loading: loadingMatches, error: matchError, lastUpdated, refresh } = useTodayMatches();

  const [scores] = useState(loadScores);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [modalOpened, setModalOpened] = useState(false);

  const handleMatchClick = (match) => {
    setSelectedMatch(match);
    setModalOpened(true);
  };

  // Build leaderboard from users + scores
  const leaderboard = users
    .filter((u) => u.status === 'approved')
    .map((u) => {
      const userScore = scores.find((s) => s.userId === u.id);
      return {
        id: u.id,
        name: u.name,
        points: userScore?.points ?? 0,
        correctResults: userScore?.correctResults ?? 0,
        isCurrentUser: u.id === user?.id,
      };
    })
    .sort((a, b) => b.points - a.points);

  return (
    <main className={styles.page}>
      {/* ── Welcome banner ──────────────────────────────────────────────── */}
      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>
          Welcome back, <span className={styles.accent}>{user?.name}</span> 👋
        </h1>
        <p className={styles.welcomeSub}>
          World Cup 2026 · Jun 11 – Jul 19, 2026 · USA, Canada &amp; Mexico
        </p>
      </section>

      {/* ── Live Score Banner (only visible during live matches) ──────── */}
      <LiveScoreBanner
        matches={todayMatches}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
      />

      <div className={styles.grid}>
        {/* ── Gamble Info ───────────────────────────────────────────────── */}
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>🎲 How Betting Works</h2>
          <div className={styles.gambleInfo}>
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
              exercitation ullamco laboris.
            </p>
            <ul className={styles.betRules}>
              <li>
                <strong>Correct Score</strong> — Predict the exact final score of a match.
              </li>
              <li>
                <strong>Correct Result</strong> — Predict the winner (home / draw / away).
              </li>
              <li>
                <strong>Tournament Winner</strong> — Bonus points for picking the champion.
              </li>
              <li>
                <strong>Top Scorer</strong> — Bonus points for picking the golden boot winner.
              </li>
            </ul>
            <p className={styles.comingSoon}>
              ⚠️ Full betting rules and point system coming soon.
            </p>
          </div>
        </section>

        {/* ── Today's Matches ───────────────────────────────────────────── */}
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>📅 Today&apos;s Matches</h2>
          {loadingMatches && (
            <div className={styles.matchList}>
              {[1, 2, 3].map((n) => <SkeletonCard key={n} compact />)}
            </div>
          )}
          {matchError && (
            <div className={styles.apiError}>
              <p>Could not load today&apos;s matches.</p>
              <small>{matchError}</small>
            </div>
          )}
          {!loadingMatches && !matchError && todayMatches.length === 0 && (
            <div className={styles.noMatches}>
              <p>No matches scheduled for today.</p>
              <p className={styles.noMatchesSub}>Check the <a href="/games">All Games</a> page for upcoming fixtures.</p>
            </div>
          )}
          {!loadingMatches && todayMatches.length > 0 && (
            <div className={styles.matchList}>
              {todayMatches.map((m) => <MatchCard key={m.id} match={m} compact onClick={handleMatchClick} />)}
            </div>
          )}
        </section>

        {/* ── Live Bets Reveal ──────────────────────────────────────────── */}
        {!loadingMatches && todayMatches.length > 0 && (
          <section className={`${styles.card} ${styles.fullWidth}`}>
            <LiveBetsReveal
              matches={todayMatches}
              users={users}
              currentUserId={user?.id}
            />
          </section>
        )}

        {/* ── Score Table / Leaderboard ─────────────────────────────────── */}
        <section className={`${styles.card} ${styles.fullWidth}`}>
          <h2 className={styles.sectionTitle}>🏅 Leaderboard</h2>
          {leaderboard.length === 0 ? (
            <p className={styles.empty}>No participants yet.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Winner Bet</th>
                    <th>Top Scorer Bet</th>
                    <th>Correct Results</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => {
                    const fullUser = users.find((u) => u.id === row.id);
                    return (
                      <tr
                        key={row.id}
                        className={row.isCurrentUser ? styles.currentUserRow : ''}
                      >
                        <td className={styles.rank}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </td>
                        <td className={styles.playerName}>
                          {row.name}
                          {row.isCurrentUser && <span className={styles.youTag}>you</span>}
                        </td>
                        <td>{fullUser?.bet?.winningTeam ?? <span className={styles.missing}>—</span>}</td>
                        <td>{fullUser?.bet?.topScorer ?? <span className={styles.missing}>—</span>}</td>
                        <td className={styles.center}>{row.correctResults}</td>
                        <td className={styles.points}>{row.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <BetModal
        match={selectedMatch}
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
      />
    </main>
  );
}
