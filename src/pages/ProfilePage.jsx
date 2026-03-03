import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchTeams, fetchScorers, parseApiError } from '../services/footballService';
import { useMatches } from '../hooks/useMatches';
import { isTournamentStarted, MATCH_STATUS } from '../utils/constants';
import serverApi from '../services/serverApi';
import TeamFlag from '../components/TeamFlag';
import styles from './ProfilePage.module.css';

const formatDate = (utcDate) =>
  new Date(utcDate).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

const statusLabel = (status) => {
  switch (status) {
    case MATCH_STATUS.FINISHED:  return { text: 'FT',   cls: 'finished' };
    case MATCH_STATUS.IN_PLAY:   return { text: 'LIVE', cls: 'live' };
    case MATCH_STATUS.PAUSED:    return { text: 'HT',   cls: 'live' };
    case MATCH_STATUS.POSTPONED: return { text: 'PPD',  cls: 'postponed' };
    default:                     return { text: 'SCH',  cls: 'scheduled' };
  }
};

export default function ProfilePage() {
  const { user, updateBet } = useAuth();
  const { matches } = useMatches(); // uses cached data — zero extra API calls

  const [teams, setTeams] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const [winningTeam, setWinningTeam] = useState(user?.bet?.winningTeam ?? '');
  const [topScorer, setTopScorer]     = useState(user?.bet?.topScorer   ?? '');
  const [topAssist, setTopAssist]     = useState(user?.bet?.topAssist   ?? '');
  const [betSaved, setBetSaved] = useState(false);
  const [betError, setBetError] = useState('');

  // Predictions loaded from Supabase
  const [rawPredictions, setRawPredictions] = useState({});

  const totalPredictions = Object.keys(rawPredictions).length;

  // Join predictions with match data from cache
  const predictionList = Object.entries(rawPredictions)
    .map(([matchId, pred]) => {
      const match = matches.find((m) => String(m.id) === String(matchId));
      return { matchId, pred, match };
    })
    .sort((a, b) => {
      if (a.match && b.match) return new Date(a.match.utcDate) - new Date(b.match.utcDate);
      return 0;
    });

  const canChangeBet = !isTournamentStarted();

  useEffect(() => {
    const load = async () => {
      try {
        const [t, s] = await Promise.all([fetchTeams(), fetchScorers()]);
        setTeams(t);
        setScorers(s);
      } catch (err) {
        setOptionsError(parseApiError(err));
      } finally {
        setLoadingOptions(false);
      }
    };
    load();
  }, []);

  // Load this user's match predictions from Express.
  // Depend only on user.id (stable primitive) — NOT the whole user object,
  // which is recreated on every AuthContext render and would cause an infinite loop.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const fetchPredictions = async () => {
      try {
        const { data } = await serverApi.get('/predictions', { params: { userId } });
        // Convert array → { [matchId]: { home, away } }
        const map = {};
        data.forEach((row) => { map[row.match_id] = { home: row.home, away: row.away }; });
        setRawPredictions(map);
      } catch (err) {
        console.error('[ProfilePage] fetchPredictions error:', err.message);
      }
    };
    fetchPredictions();
  }, [userId]);

  const handleSaveBet = async (e) => {
    e.preventDefault();
    setBetError('');
    setBetSaved(false);
    const result = await updateBet(winningTeam || null, topScorer || null, topAssist || null);
    if (result.success) {
      setBetSaved(true);
      setTimeout(() => setBetSaved(false), 3000);
    } else {
      setBetError(result.error);
    }
  };

  const joinDate = new Date(user?.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Profile</h1>
      </div>

      <div className={styles.grid}>
        {/* ── Account info ─────────────────────── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>👤 Account</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Name</span>
            <span className={styles.infoValue}>{user?.name}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValue}>{user?.email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Role</span>
            <span className={`${styles.infoValue} ${styles.badge}`}>{user?.role}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Joined</span>
            <span className={styles.infoValue}>{joinDate}</span>
          </div>
        </section>

        {/* ── Bet Summary ──────────────────────── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>📊 Bet Summary</h2>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>🏆</span>
              <span className={styles.summaryLabel}>Tournament Winner</span>
              <span className={styles.summaryValue}>
                {user?.bet?.winningTeam || <span className={styles.missing}>Not set</span>}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>⚽</span>
              <span className={styles.summaryLabel}>Top Scorer</span>
              <span className={styles.summaryValue}>
                {user?.bet?.topScorer || <span className={styles.missing}>Not set</span>}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>🎯</span>
              <span className={styles.summaryLabel}>Top Assist</span>
              <span className={styles.summaryValue}>
                {user?.bet?.topAssist || <span className={styles.missing}>Not set</span>}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>📝</span>
              <span className={styles.summaryLabel}>Match Predictions</span>
              <span className={styles.summaryValue}>{totalPredictions}</span>
            </div>
          </div>

          {/* Missing bets reminder */}
          {(!user?.bet?.winningTeam || !user?.bet?.topScorer || !user?.bet?.topAssist) && (
            <div className={styles.reminderBox}>
              <strong>⚠️ Missing bets:</strong>
              <ul className={styles.missingList}>
                {!user?.bet?.winningTeam && <li>Tournament winner</li>}
                {!user?.bet?.topScorer   && <li>Top scorer</li>}
                {!user?.bet?.topAssist   && <li>Top assist</li>}
              </ul>
              {!canChangeBet && (
                <p className={styles.locked}>The tournament has started – bets are now locked.</p>
              )}
            </div>
          )}
        </section>

        {/* ── Match Predictions List ────────────────── */}
        <section className={`${styles.card} ${styles.fullWidth}`}>
          <h2 className={styles.cardTitle}>
            📋 My Match Predictions
            <span className={styles.predCount}>{totalPredictions}</span>
          </h2>

          {totalPredictions === 0 ? (
            <div className={styles.emptyPreds}>
              <p>You haven&apos;t placed any match predictions yet.</p>
              <p className={styles.emptyPredsSub}>
                Go to <a href="/games">All Games</a> and click on a match to place your bet.
              </p>
            </div>
          ) : (
            <div className={styles.predTableWrapper}>
              <table className={styles.predTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Match</th>
                    <th className={styles.thCenter}>Your Prediction</th>
                    <th className={styles.thCenter}>Real Score</th>
                    <th className={styles.thCenter}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {predictionList.map(({ matchId, pred, match }) => {
                    const st = match ? statusLabel(match.status) : null;
                    const isFinished = match?.status === MATCH_STATUS.FINISHED;
                    const isLive = match?.status === MATCH_STATUS.IN_PLAY || match?.status === MATCH_STATUS.PAUSED;

                    return (
                      <tr key={matchId}>
                        {/* Date */}
                        <td className={styles.predDate}>
                          {match ? formatDate(match.utcDate) : <span className={styles.muted}>—</span>}
                        </td>

                        {/* Teams */}
                        <td className={styles.predTeams}>
                          {match ? (
                            <div className={styles.teamsInline}>
                              <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} size={20} />
                              <span className={styles.teamLabel}>{match.homeTeam.shortName}</span>
                              <span className={styles.vsLabel}>vs</span>
                              <span className={styles.teamLabel}>{match.awayTeam.shortName}</span>
                              <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} size={20} />
                            </div>
                          ) : (
                            <span className={styles.muted}>Match #{matchId}</span>
                          )}
                        </td>

                        {/* My prediction */}
                        <td className={styles.thCenter}>
                          <span className={styles.scoreChip}>
                            {pred.home} – {pred.away}
                          </span>
                        </td>

                        {/* Real score */}
                        <td className={styles.thCenter}>
                          {isFinished || isLive ? (
                            <span className={`${styles.scoreChip} ${isLive ? styles.chipLive : ''}`}>
                              {match.score.home ?? 0} – {match.score.away ?? 0}
                            </span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className={styles.thCenter}>
                          {st ? (
                            <span className={`${styles.stBadge} ${styles[`st_${st.cls}`]}`}>
                              {st.text}
                            </span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Edit Tournament Bets ────────────────── */}
        <section className={`${styles.card} ${styles.fullWidth}`}>
          <h2 className={styles.cardTitle}>
            🎯 Tournament Bets
            {!canChangeBet && <span className={styles.lockedTag}>LOCKED</span>}
          </h2>

          {canChangeBet ? (
            <>
              <p className={styles.betNote}>
                You can change these until the tournament starts on <strong>June 11, 2026</strong>.
              </p>

              {optionsError && (
                <div className={styles.optionsError}>
                  Could not load team/player data: {optionsError}
                </div>
              )}

              <form onSubmit={handleSaveBet} className={styles.betForm}>
                <div className={styles.field}>
                  <label htmlFor="winningTeam">
                    🏅 World Cup Winner {loadingOptions && <small>(loading…)</small>}
                  </label>
                  <select
                    id="winningTeam"
                    value={winningTeam}
                    onChange={(e) => setWinningTeam(e.target.value)}
                    disabled={loadingOptions}
                  >
                    <option value=''>-- Pick a team --</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="topScorer">
                    ⚽ Top Scorer {loadingOptions && <small>(loading…)</small>}
                  </label>
                  <select
                    id="topScorer"
                    value={topScorer}
                    onChange={(e) => setTopScorer(e.target.value)}
                    disabled={loadingOptions}
                  >
                    <option value=''>-- Pick a player --</option>
                    {scorers.map((s) => (
                      <option key={s.id} value={s.name}>{s.name} ({s.team})</option>
                    ))}
                    {scorers.length === 0 && !loadingOptions && (
                      <option disabled>Player list unavailable</option>
                    )}
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="topAssist">
                    🎯 Top Assist {loadingOptions && <small>(loading…)</small>}
                  </label>
                  <select
                    id="topAssist"
                    value={topAssist}
                    onChange={(e) => setTopAssist(e.target.value)}
                    disabled={loadingOptions}
                  >
                    <option value=''>-- Pick a player --</option>
                    {scorers.map((s) => (
                      <option key={s.id} value={s.name}>{s.name} ({s.team})</option>
                    ))}
                    {scorers.length === 0 && !loadingOptions && (
                      <option disabled>Player list unavailable</option>
                    )}
                  </select>
                </div>

                {betError && <p className={styles.betError}>{betError}</p>}
                {betSaved && <p className={styles.betSuccess}>✅ Bets saved successfully!</p>}

                <button type="submit" className={styles.saveBtn} disabled={loadingOptions}>
                  Save Bets
                </button>
              </form>
            </>
          ) : (
            <div className={styles.lockedMsg}>
              <p>The World Cup has started. Your tournament bets are locked:</p>
              <div className={styles.lockedBets}>
                <div><strong>Winner:</strong> {user?.bet?.winningTeam ?? '—'}</div>
                <div><strong>Top Scorer:</strong> {user?.bet?.topScorer ?? '—'}</div>
                <div><strong>Top Assist:</strong> {user?.bet?.topAssist ?? '—'}</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
