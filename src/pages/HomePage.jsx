import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { REG_STATUS, MATCH_STATUS } from '../utils/constants';
import { isSimulationMode } from '../utils/simulation';
import { useTodayMatches } from '../hooks/useTodayMatches';
import { useMinuteTick } from '../hooks/useMinuteTick';
import { useUserPredictions } from '../hooks/useUserPredictions';
import { formatKickoffCountdown, formatMatchTime, hasMatchStarted } from '../utils/matchTime';
import MatchCard from '../components/MatchCard';
import SkeletonCard from '../components/SkeletonCard';
import BetModal from '../components/BetModal';
import LiveBetsModal from '../components/LiveBetsModal';
import LiveScoreBanner from '../components/LiveScoreBanner';
import Podium from '../components/Podium';
import SpotlightPair from '../components/SpotlightPair';
import { useSpotlight } from '../hooks/useSpotlight';
import styles from './HomePage.module.css';

const LIVE_SCORE_POLL_MS = 60_000;

export default function HomePage() {
  const { user, users, scores, isAdmin, recalculateScores, refreshScores } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  // Refresh the leaderboard the moment any match flips to FINISHED. The
  // GET /api/scores endpoint computes dynamically with a 30 s cache, so
  // this is cheap and gives users a near-instant update.
  const { data: spotlight, loading: loadingSpotlight, refresh: refreshSpotlight } = useSpotlight();

  const handleMatchFinished = useCallback(() => {
    refreshScores();
    refreshSpotlight();
  }, [refreshScores, refreshSpotlight]);

  const {
    matches: todayMatches,
    loading: loadingMatches,
    error: matchError,
    lastUpdated,
    refresh: refreshMatches,
  } = useTodayMatches({ onMatchFinished: handleMatchFinished });

  // Single shared minute-tick for all MatchCards rendered on this page.
  // Each card uses it to compute its own countdown text without spawning
  // its own interval.
  const now = useMinuteTick();
  const { predictions, upsertPrediction } = useUserPredictions();

  // Opportunistic 60 s leaderboard poll while any match is live. Pairs
  // with the 30 s server cache, so concurrent calls are cheap.
  useEffect(() => {
    const hasLive = todayMatches.some(
      (m) => m.status === MATCH_STATUS.IN_PLAY || m.status === MATCH_STATUS.PAUSED,
    );
    if (!hasLive) return undefined;

    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        refreshScores();
        refreshSpotlight();
      }
    }, LIVE_SCORE_POLL_MS);
    return () => clearInterval(id);
  }, [todayMatches, refreshScores, refreshSpotlight]);

  const [selectedMatch, setSelectedMatch] = useState(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [liveBetsMatch, setLiveBetsMatch] = useState(null);
  const [liveBetsOpened, setLiveBetsOpened] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusTournamentWinner, setBonusTournamentWinner] = useState('');
  const [bonusTopScorer, setBonusTopScorer] = useState('');
  const [bonusTopAssist, setBonusTopAssist] = useState('');

  // Click branching:
  //   • pre-match (not started)  → BetModal: place / edit your prediction
  //   • started (live or final) → LiveBetsModal: see what everyone bet
  // The server gate is authoritative; this is purely UX so the two modals
  // don't both fire for the same fixture.
  const handleMatchClick = (match) => {
    if (hasMatchStarted(match)) {
      setLiveBetsMatch(match);
      setLiveBetsOpened(true);
    } else {
      setSelectedMatch(match);
      setModalOpened(true);
    }
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
  const leaderboard = (isSimulationMode || !isAdmin
    ? scores.map((s) => ({
        id: s.userId,
        name: s.name,
        bet: null,
        points: s.points ?? 0,
        correctResults: s.correctResults ?? 0,
        exactScores: s.exactScores ?? 0,
        exactScoreBonus: s.exactScoreBonus ?? 0,
        isCurrentUser: s.userId === user?.id,
      }))
    : users
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
  ).sort((a, b) => b.points - a.points || b.exactScores - a.exactScores);

  // LiveBetsModal needs approved-user rows. AuthContext.users is fetched
  // admin-only, so non-admin viewers (and simulation mode) get an empty
  // array — fall back to scores, which is loaded for everyone and already
  // contains every approved player.
  const revealUsers = users.length > 0
    ? users
    : scores.map((s) => ({
        id: s.userId,
        name: s.name,
        status: REG_STATUS.APPROVED,
      }));

  // Hero ticker: first upcoming match today (scheduled/timed, not finished
  // or in-play). Used to render "KICKOFF · {home} vs {away} · IN {ctd}" —
  // pure derivation from already-fetched data, no extra network call.
  const nextMatch = useMemo(() => {
    const upcoming = todayMatches
      .filter(
        (m) =>
          m.status === MATCH_STATUS.SCHEDULED ||
          m.status === MATCH_STATUS.TIMED,
      )
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    return upcoming[0] ?? null;
  }, [todayMatches]);

  const nextMatchCountdown = nextMatch
    ? formatKickoffCountdown(nextMatch.utcDate, t, now)
    : null;
  const nextMatchTime = nextMatch ? formatMatchTime(nextMatch.utcDate, locale) : null;

  // Current-user rank derived from the same leaderboard we render below —
  // 1-indexed, null if the user isn't in the table (e.g. admin without a row).
  const currentUserEntry = leaderboard.findIndex((r) => r.id === user?.id);
  const currentUserRank = currentUserEntry >= 0 ? currentUserEntry + 1 : null;
  const currentUserPoints =
    currentUserRank != null ? leaderboard[currentUserEntry].points : null;

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <main className={styles.page}>
      {!loadingMatches && todayMatches.length > 0 && (
        <LiveScoreBanner
          matches={todayMatches}
          lastUpdated={lastUpdated}
          onRefresh={refreshMatches}
        />
      )}

      <section className={styles.hero}>
        <div className={styles.heroScanlines} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroNameBlock}>
            <span className={styles.heroEyebrow}>{t('home.welcomeBack', { name: '' }).replace(/[,\s]+$/, '')}</span>
            <h1 className={styles.heroName}>{user?.name ?? ''}</h1>
            <p className={`${styles.heroTicker} numerals`}>
              <span className={styles.heroTickerLabel}>
                {nextMatch
                  ? t('home.hero.kickoff').toUpperCase()
                  : t('home.hero.noUpcoming').toUpperCase()}
              </span>
              {nextMatch && (
                <>
                  <span className={styles.heroTickerDot} aria-hidden="true">·</span>
                  <span className={styles.heroTickerMatch}>
                    {nextMatch.homeTeam.tla ?? nextMatch.homeTeam.shortName}
                    {' '}vs{' '}
                    {nextMatch.awayTeam.tla ?? nextMatch.awayTeam.shortName}
                  </span>
                  <span className={styles.heroTickerDot} aria-hidden="true">·</span>
                  <span className={styles.heroTickerCountdown}>
                    {nextMatchCountdown ?? nextMatchTime}
                  </span>
                </>
              )}
            </p>
          </div>

          {currentUserRank != null && (
            <div className={styles.heroChip}>
              <span className={styles.heroChipLabel}>{t('home.hero.you').toUpperCase()}</span>
              <div className={styles.heroChipFigures}>
                <div className={styles.heroChipFigure}>
                  <span className={`${styles.heroChipValue} numerals`}>#{currentUserRank}</span>
                  <span className={styles.heroChipUnit}>{t('home.hero.rank').toUpperCase()}</span>
                </div>
                <div className={styles.heroChipDivider} aria-hidden="true" />
                <div className={styles.heroChipFigure}>
                  <span className={`${styles.heroChipValue} numerals`}>{currentUserPoints}</span>
                  <span className={styles.heroChipUnit}>{t('home.hero.pts')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <SpotlightPair
        data={spotlight}
        loading={loadingSpotlight}
        currentUserId={user?.id}
      />

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
              {todayMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  compact
                  onClick={handleMatchClick}
                  now={now}
                  userPrediction={predictions[String(m.id)]}
                />
              ))}
            </div>
          )}
        </section>

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
            <>
              <Podium top3={top3} currentUserId={user?.id} />
              {rest.length > 0 && (
                <LeaderboardTable
                  rows={rest}
                  startRank={top3.length + 1}
                  styles={styles}
                  t={t}
                />
              )}
            </>
          )}
        </section>
      </div>

      <BetModal
        match={selectedMatch}
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onSaved={upsertPrediction}
      />

      <LiveBetsModal
        match={liveBetsMatch}
        users={revealUsers}
        currentUserId={user?.id}
        opened={liveBetsOpened}
        onClose={() => setLiveBetsOpened(false)}
      />
    </main>
  );
}

// Snapshot of the previous leaderboard order, keyed per visit. Used so the
// table can show a small ▲/▼ chevron beside each rank without any backend
// change. The snapshot updates on each render that produces a non-empty
// list, so the "previous" state is "what I last saw" rather than a server
// truth — pure UX.
const RANK_SNAPSHOT_KEY = 'wc26:lastLeaderboardRanks';

function loadRankSnapshot() {
  try {
    const raw = localStorage.getItem(RANK_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRankSnapshot(snapshot) {
  try {
    localStorage.setItem(RANK_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* localStorage unavailable — ignore */
  }
}

function LeaderboardTable({ rows, startRank, styles, t }) {
  const [expandedId, setExpandedId] = useState(null);
  // Read once on mount; we compare against this for the lifetime of the
  // component, then refresh on unmount so the next visit sees today's order
  // as "previous."
  const [previousRanks] = useState(loadRankSnapshot);

  useEffect(() => {
    if (rows.length === 0) return;
    const next = {};
    rows.forEach((r, idx) => {
      next[r.id] = startRank + idx;
    });
    saveRankSnapshot(next);
  }, [rows, startRank]);

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.center}>{t('leaderboard.rank')}</th>
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
          {rows.map((row, idx) => {
            const rank = startRank + idx;
            const prev = previousRanks[row.id];
            const delta = prev != null ? prev - rank : 0;
            const isExpanded = expandedId === row.id;
            const hasAnyBet = row.bet?.winningTeam || row.bet?.topScorer || row.bet?.topAssist;
            return (
              <Fragment key={row.id}>
                <tr className={row.isCurrentUser ? styles.currentUserRow : ''}>
                  <td className={`${styles.rank} numerals`}>
                    <span className={styles.rankInner}>
                      <span>{rank}</span>
                      {delta > 0 && (
                        <span
                          className={`${styles.delta} ${styles.deltaUp}`}
                          aria-label={`up ${delta}`}
                        >
                          ▲{delta}
                        </span>
                      )}
                      {delta < 0 && (
                        <span
                          className={`${styles.delta} ${styles.deltaDown}`}
                          aria-label={`down ${-delta}`}
                        >
                          ▼{-delta}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={styles.playerCell}>
                    <span className={styles.playerInner}>
                      <span className={styles.playerName} title={row.name}>{row.name}</span>
                      {row.isCurrentUser && <span className={styles.youTag}>{t('leaderboard.you')}</span>}
                      {hasAnyBet && (
                        <button
                          type="button"
                          className={`${styles.expandToggle} ${isExpanded ? styles.expandToggleOpen : ''}`}
                          onClick={() => toggleExpanded(row.id)}
                          aria-label={isExpanded ? 'Hide bets' : 'Show bets'}
                          aria-expanded={isExpanded}
                        >
                          ▾
                        </button>
                      )}
                    </span>
                  </td>
                  <td className={styles.colWinner}>{row.bet?.winningTeam ?? <span className={styles.missing}>—</span>}</td>
                  <td className={styles.colTopScorer}>{row.bet?.topScorer ?? <span className={styles.missing}>—</span>}</td>
                  <td className={styles.colTopAssist}>{row.bet?.topAssist ?? <span className={styles.missing}>—</span>}</td>
                  <td className={`${styles.center} numerals`}>{row.exactScores}</td>
                  <td className={`${styles.center} numerals`}>{row.correctResults}</td>
                  <td className={styles.points}>
                    <span className={styles.pointsCell}>
                      <span className="numerals">{row.points}</span>
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
                {isExpanded && hasAnyBet && (
                  <tr className={styles.expandedRow}>
                    <td />
                    <td colSpan={7}>
                      <dl className={styles.betDetail}>
                        <div>
                          <dt>{t('leaderboard.winnerBet')}</dt>
                          <dd>{row.bet?.winningTeam ?? <span className={styles.missing}>—</span>}</dd>
                        </div>
                        <div>
                          <dt>{t('leaderboard.topScorer')}</dt>
                          <dd>{row.bet?.topScorer ?? <span className={styles.missing}>—</span>}</dd>
                        </div>
                        <div>
                          <dt>{t('leaderboard.topAssist')}</dt>
                          <dd>{row.bet?.topAssist ?? <span className={styles.missing}>—</span>}</dd>
                        </div>
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
