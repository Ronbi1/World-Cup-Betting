import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchTeams, fetchScorers, parseApiError } from '../services/footballService';
import { isTournamentStarted, STORAGE_KEYS } from '../utils/constants';
import styles from './ProfilePage.module.css';

const loadMatchPredictions = (userId) => {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.MATCH_PREDICTIONS) || '{}');
    return all[userId] ?? {};
  } catch {
    return {};
  }
};

export default function ProfilePage() {
  const { user, updateBet } = useAuth();

  const [teams, setTeams] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const [winningTeam, setWinningTeam] = useState(user?.bet?.winningTeam ?? '');
  const [topScorer, setTopScorer] = useState(user?.bet?.topScorer ?? '');
  const [betSaved, setBetSaved] = useState(false);
  const [betError, setBetError] = useState('');

  const predictions = loadMatchPredictions(user?.id);
  const totalPredictions = Object.keys(predictions).length;

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

  const handleSaveBet = (e) => {
    e.preventDefault();
    setBetError('');
    setBetSaved(false);
    const result = updateBet(winningTeam || null, topScorer || null);
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
        {/* ── Account info ──────────────────────────────────────────────── */}
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

        {/* ── Bet Summary ───────────────────────────────────────────────── */}
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
              <span className={styles.summaryIcon}>📝</span>
              <span className={styles.summaryLabel}>Match Predictions</span>
              <span className={styles.summaryValue}>{totalPredictions}</span>
            </div>
          </div>

          {/* Missing bets reminder */}
          {(!user?.bet?.winningTeam || !user?.bet?.topScorer) && (
            <div className={styles.reminderBox}>
              <strong>⚠️ Missing bets:</strong>
              <ul className={styles.missingList}>
                {!user?.bet?.winningTeam && <li>Tournament winner</li>}
                {!user?.bet?.topScorer && <li>Top scorer</li>}
              </ul>
              {!canChangeBet && (
                <p className={styles.locked}>The tournament has started – bets are now locked.</p>
              )}
            </div>
          )}
        </section>

        {/* ── Edit Tournament Bets ──────────────────────────────────────── */}
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
                    <option value="">— Pick a team —</option>
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
                    <option value="">— Pick a player —</option>
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
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
