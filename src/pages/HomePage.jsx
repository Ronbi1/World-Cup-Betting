import { useState, useEffect, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { REG_STATUS, MATCH_STATUS } from '../utils/constants';
import { useTodayMatches } from '../hooks/useTodayMatches';
import MatchCard from '../components/MatchCard';
import SkeletonCard from '../components/SkeletonCard';
import BetModal from '../components/BetModal';
import LiveBetsReveal from '../components/LiveBetsReveal';
import LiveScoreBanner from '../components/LiveScoreBanner';
import styles from './HomePage.module.css';

const LIVE_SCORE_POLL_MS = 60_000;

export default function HomePage() {
  const { user, users, scores, isAdmin, recalculateScores, refreshScores } = useAuth();
  const { t } = useTranslation();

  // Refresh the leaderboard the moment any match flips to FINISHED. The
  // GET /api/scores endpoint computes dynamically with a 30 s cache, so
  // this is cheap and gives users a near-instant update.
  const handleMatchFinished = useCallback(() => {
    refreshScores();
  }, [refreshScores]);

  const {
    matches: todayMatches,
    loading: loadingMatches,
    error: matchError,
    lastUpdated,
    refresh: refreshMatches,
  } = useTodayMatches({ onMatchFinished: handleMatchFinished });

  // Opportunistic 60 s leaderboard poll while any match is live. Pairs
  // with the 30 s server cache, so concurrent calls are cheap.
  useEffect(() => {
    const hasLive = todayMatches.some(
      (m) => m.status === MATCH_STATUS.IN_PLAY || m.status === MATCH_STATUS.PAUSED,
    );
    if (!hasLive) return undefined;

    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refreshScores();
    }, LIVE_SCORE_POLL_MS);
    return () => clearInterval(id);
  }, [todayMatches, refreshScores]);

  const [selectedMatch, setSelectedMatch] = useState(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusTournamentWinner, setBonusTournamentWinner] = useState('');
  const [bonusTopScorer, setBonusTopScorer] = useState('');
  const [bonusTopAssist, setBonusTopAssist] = useState('');

  const handleMatchClick = (match) => {
    setSelectedMatch(match);
    setModalOpened(true);
  };

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    setRecalcMsg('');
    const tournamentBets = {
      tournamentWinner: bonusTournamentWinner.trim() || undefined,
      actualTopScorer: bonusTopScorer.trim() || undefined,
      actualTopAssist: bonusTopAssist.trim() || undefined,
    };
    const result = await recalculateScores(tournamentBets);
    setRecalcLoading(false);
    setRecalcMsg(result.success ? `✅ ${t('home.recalcSuccess')}` : `❌ ${result.error}`);
    setTimeout(() => setRecalcMsg(''), 4000);
  };

  // Build leaderboard:
  //   - admin sees the union of all approved users (so empty rows show even
  //     before any match has finished and scores have been calculated)
  //   - regular users see the /scores response, which contains every approved
  //     user already
  const leaderboard = (isAdmin
    ? users
        .filter((u) => u.status === REG_STATUS.APPROVED && u.role !== 'ADMIN')
        .map((u) => {
          const s = scores.find((sc) => sc.userId === u.id);
          return {
            id: u.id,
            name: u.name,
            bet: u.bet ?? null,
            points: s?.points ?? 0,
            correctResults: s?.correctResults ?? 0,
            exactScores: s?.exactScores ?? 0,
            exactScoreBonus: s?.exactScoreBonus ?? 0,
            isCurrentUser: false,
          };
        })
    : scores.map((s) => ({
        id: s.userId,
        name: s.name,
        bet: null,
        points: s.points ?? 0,
        correctResults: s.correctResults ?? 0,
        exactScores: s.exactScores ?? 0,
        exactScoreBonus: s.exactScoreBonus ?? 0,
        isCurrentUser: s.userId === user?.id,
      }))
  ).sort((a, b) => b.points - a.points || b.exactScores - a.exactScores);

  return (
    <main className={styles.page}>
      {!loadingMatches && todayMatches.length > 0 && (
        <LiveScoreBanner
          matches={todayMatches}
          lastUpdated={lastUpdated}
          onRefresh={refreshMatches}
        />
      )}

      <section className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>
          <Trans
            i18nKey="home.welcomeBack"
            values={{ name: user?.name ?? '' }}
            components={{ accent: <span className={styles.accent} /> }}
          >
            Welcome back, <span className={styles.accent}>{user?.name}</span>
          </Trans>
          {' '}👋
        </h1>
        <p className={styles.welcomeSub}>{t('app.tagline')}</p>
      </section>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.fullWidth}`}>
          <h2 className={styles.sectionTitle}>📅 {t('home.todayMatches')}</h2>
          {loadingMatches && (
            <div className={styles.matchList}>
              {[1, 2, 3].map((n) => <SkeletonCard key={n} compact />)}
            </div>
          )}
          {matchError && (
            <div className={styles.apiError}>
              <p>{t('home.loadError')}</p>
              <small>{matchError}</small>
            </div>
          )}
          {!loadingMatches && !matchError && todayMatches.length === 0 && (
            <div className={styles.noMatches}>
              <p>{t('home.noMatchesToday')}</p>
              <p className={styles.noMatchesSub}>{t('home.noMatchesTodaySub')}</p>
            </div>
          )}
          {!loadingMatches && todayMatches.length > 0 && (
            <div className={styles.matchList}>
              {todayMatches.map((m) => <MatchCard key={m.id} match={m} compact onClick={handleMatchClick} />)}
            </div>
          )}
        </section>

        {!loadingMatches && todayMatches.length > 0 && (
          <section className={`${styles.card} ${styles.fullWidth}`}>
            <LiveBetsReveal
              matches={todayMatches}
              users={users}
              currentUserId={user?.id}
            />
          </section>
        )}

        <section className={`${styles.card} ${styles.fullWidth}`}>
          <div className={styles.leaderboardHeader}>
            <h2 className={styles.sectionTitle}>🏅 {t('home.leaderboard')}</h2>
            {isAdmin && (
              <div className={styles.recalcWrap}>
                {recalcMsg && <span className={styles.recalcMsg}>{recalcMsg}</span>}
                <button
                  className={styles.recalcToggleBtn}
                  onClick={() => setShowBonusForm((v) => !v)}
                  title={t('home.bonusToggle')}
                >
                  🏆
                </button>
                <button
                  className={styles.recalcBtn}
                  onClick={handleRecalculate}
                  disabled={recalcLoading}
                  title={t('home.recalc')}
                >
                  {recalcLoading ? `⏳ ${t('home.recalcCalculating')}` : `🔄 ${t('home.recalc')}`}
                </button>
              </div>
            )}
            {isAdmin && showBonusForm && (
              <div className={styles.bonusForm}>
                <p className={styles.bonusNote}>{t('home.bonusNote')}</p>
                <div className={styles.bonusFields}>
                  <input
                    className={styles.bonusInput}
                    placeholder={`🏆 ${t('home.bonusWinningTeam')}`}
                    value={bonusTournamentWinner}
                    onChange={(e) => setBonusTournamentWinner(e.target.value)}
                  />
                  <input
                    className={styles.bonusInput}
                    placeholder={`⚽ ${t('home.bonusTopScorer')}`}
                    value={bonusTopScorer}
                    onChange={(e) => setBonusTopScorer(e.target.value)}
                  />
                  <input
                    className={styles.bonusInput}
                    placeholder={`🎯 ${t('home.bonusTopAssist')}`}
                    value={bonusTopAssist}
                    onChange={(e) => setBonusTopAssist(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {leaderboard.length === 0 ? (
            <p className={styles.empty}>{t('home.leaderboardEmpty')}</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('leaderboard.rank')}</th>
                    <th>{t('leaderboard.player')}</th>
                    <th className={styles.colWinner}>{t('leaderboard.winnerBet')}</th>
                    <th className={styles.colTopScorer}>{t('leaderboard.topScorer')}</th>
                    <th className={styles.colTopAssist}>{t('leaderboard.topAssist')}</th>
                    <th className={styles.center}>🎯 {t('leaderboard.exact')}</th>
                    <th className={styles.center}>✅ {t('leaderboard.results')}</th>
                    <th className={styles.center}>{t('leaderboard.points')}</th>
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
                      <td className={styles.playerCell}>
                        <span className={styles.playerInner}>
                          <span className={styles.playerName} title={row.name}>{row.name}</span>
                          {row.isCurrentUser && <span className={styles.youTag}>{t('leaderboard.you')}</span>}
                        </span>
                      </td>
                      <td className={styles.colWinner}>{row.bet?.winningTeam ?? <span className={styles.missing}>—</span>}</td>
                      <td className={styles.colTopScorer}>{row.bet?.topScorer ?? <span className={styles.missing}>—</span>}</td>
                      <td className={styles.colTopAssist}>{row.bet?.topAssist ?? <span className={styles.missing}>—</span>}</td>
                      <td className={styles.center}>{row.exactScores}</td>
                      <td className={styles.center}>{row.correctResults}</td>
                      <td className={styles.points}>
                        <span className={styles.pointsCell}>
                          <span>{row.points}</span>
                          {row.exactScoreBonus > 0 && (
                            <span
                              className={styles.bonusChip}
                              title={t('leaderboard.exactBonusTooltip')}
                              aria-label={t('leaderboard.exactBonusTooltip')}
                            >
                              {t('leaderboard.exactBonusBadge')}
                            </span>
                          )}
                        </span>
                      </td>
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
