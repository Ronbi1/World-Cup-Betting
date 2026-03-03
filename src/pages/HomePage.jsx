import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { REG_STATUS } from '../utils/constants';
import { useTodayMatches } from '../hooks/useTodayMatches';
import MatchCard from '../components/MatchCard';
import SkeletonCard from '../components/SkeletonCard';
import BetModal from '../components/BetModal';
import LiveBetsReveal from '../components/LiveBetsReveal';
import LiveScoreBanner from '../components/LiveScoreBanner';
import styles from './HomePage.module.css';

export default function HomePage() {
  const { user, users, scores, isAdmin, recalculateScores } = useAuth();

  const { matches: todayMatches, loading: loadingMatches, error: matchError, lastUpdated, refresh } = useTodayMatches();

  const [selectedMatch, setSelectedMatch] = useState(null);
  const [modalOpened, setModalOpened]     = useState(false);
  const [recalcLoading, setRecalcLoading]       = useState(false);
  const [recalcMsg, setRecalcMsg]               = useState('');
  const [showBonusForm, setShowBonusForm]       = useState(false);
  const [bonusTournamentWinner, setBonusTournamentWinner] = useState('');
  const [bonusTopScorer, setBonusTopScorer]     = useState('');
  const [bonusTopAssist, setBonusTopAssist]     = useState('');

  const handleMatchClick = (match) => {
    setSelectedMatch(match);
    setModalOpened(true);
  };

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    setRecalcMsg('');
    const tournamentBets = {
      tournamentWinner: bonusTournamentWinner.trim() || undefined,
      actualTopScorer:  bonusTopScorer.trim()        || undefined,
      actualTopAssist:  bonusTopAssist.trim()         || undefined,
    };
    const result = await recalculateScores(tournamentBets);
    setRecalcLoading(false);
    setRecalcMsg(result.success ? '✅ Scores updated!' : `❌ ${result.error}`);
    setTimeout(() => setRecalcMsg(''), 4000);
  };

  // Build leaderboard:
  // - Admin has the full `users` list → use that as the source so all approved
  //   users are always visible even before any scores are recalculated,
  //   then join scores for points.
  // - Regular users only have `scores` (fetched from /scores for everyone),
  //   which contains userId + name for every approved user.
  const leaderboard = (isAdmin
    ? users
        .filter((u) => u.status === REG_STATUS.APPROVED && u.role !== 'ADMIN')
        .map((u) => {
          const s = scores.find((sc) => sc.userId === u.id);
          return {
            id:             u.id,
            name:           u.name,
            bet:            u.bet ?? null,
            points:         s?.points         ?? 0,
            correctResults: s?.correctResults ?? 0,
            exactScores:    s?.exactScores    ?? 0,
            isCurrentUser:  false,
          };
        })
    : scores.map((s) => ({
        id:             s.userId,
        name:           s.name,
        bet:            null,
        points:         s.points         ?? 0,
        correctResults: s.correctResults ?? 0,
        exactScores:    s.exactScores    ?? 0,
        isCurrentUser:  s.userId === user?.id,
      }))
  ).sort((a, b) => b.points - a.points || b.exactScores - a.exactScores);

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
              Predict the score of every World Cup match before it kicks off.
              The more accurate your predictions, the more points you earn!
            </p>
            <ul className={styles.betRules}>
              <li>
                <strong>🎯 Exact Score</strong> — Predict the exact final score → <strong>3 pts</strong>
              </li>
              <li>
                <strong>🔥 Exact Score (5+ goals)</strong> — High-scoring game, exact score → <strong>5 pts</strong>
              </li>
              <li>
                <strong>✅ Correct Result</strong> — Right winner or draw, wrong score → <strong>1 pt</strong>
              </li>
              <li>
                <strong>🏆 Tournament Winner</strong> — Pick the World Cup champion → <strong>15 pts</strong>
              </li>
              <li>
                <strong>⚽ Top Scorer</strong> — Pick the Golden Boot winner → <strong>5 pts</strong>
              </li>
              <li>
                <strong>🎯 Top Assist</strong> — Pick the most assists player → <strong>5 pts</strong>
              </li>
            </ul>
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
          <div className={styles.leaderboardHeader}>
            <h2 className={styles.sectionTitle}>🏅 Leaderboard</h2>
            {isAdmin && (
              <div className={styles.recalcWrap}>
                {recalcMsg && <span className={styles.recalcMsg}>{recalcMsg}</span>}
                <button
                  className={styles.recalcToggleBtn}
                  onClick={() => setShowBonusForm(v => !v)}
                  title="Add tournament bonus results"
                >
                  🏆
                </button>
                <button
                  className={styles.recalcBtn}
                  onClick={handleRecalculate}
                  disabled={recalcLoading}
                  title="Recalculate all scores based on finished matches"
                >
                  {recalcLoading ? '⏳ Calculating…' : '🔄 Recalculate Scores'}
                </button>
              </div>
            )}
            {isAdmin && showBonusForm && (
              <div className={styles.bonusForm}>
                <p className={styles.bonusNote}>
                  Optional — fill in only at end of tournament to award bonus points:
                </p>
                <div className={styles.bonusFields}>
                  <input
                    className={styles.bonusInput}
                    placeholder="🏆 Winning team (15 pts)"
                    value={bonusTournamentWinner}
                    onChange={e => setBonusTournamentWinner(e.target.value)}
                  />
                  <input
                    className={styles.bonusInput}
                    placeholder="⚽ Top scorer name (5 pts)"
                    value={bonusTopScorer}
                    onChange={e => setBonusTopScorer(e.target.value)}
                  />
                  <input
                    className={styles.bonusInput}
                    placeholder="🎯 Top assist name (5 pts)"
                    value={bonusTopAssist}
                    onChange={e => setBonusTopAssist(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

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
                    <th>Top Scorer</th>
                    <th>Top Assist</th>
                    <th className={styles.center}>🎯 Exact</th>
                    <th className={styles.center}>✅ Results</th>
                    <th className={styles.center}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => (
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
                      <td>{row.bet?.winningTeam ?? <span className={styles.missing}>—</span>}</td>
                      <td>{row.bet?.topScorer   ?? <span className={styles.missing}>—</span>}</td>
                      <td>{row.bet?.topAssist   ?? <span className={styles.missing}>—</span>}</td>
                      <td className={styles.center}>{row.exactScores}</td>
                      <td className={styles.center}>{row.correctResults}</td>
                      <td className={styles.points}>{row.points}</td>
                    </tr>
                  ))}
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
