import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { fetchTeams, parseApiError } from '../services/footballService';
import { useMatches } from '../hooks/useMatches';
import {
  isTournamentStarted,
  TOP_SCORERS_LIST,
  TOP_ASSISTS_LIST,
} from '../utils/constants';
import serverApi from '../services/serverApi';
import styles from './ProfilePage.module.css';

export default function ProfilePage() {
  const { user, updateBet } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';
  const { matches } = useMatches(); // shared session cache — no extra API call

  const [teams, setTeams] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState(null);

  const [winningTeam, setWinningTeam] = useState(user?.bet?.winningTeam ?? '');
  const [topScorer, setTopScorer] = useState(user?.bet?.topScorer ?? '');
  const [topAssist, setTopAssist] = useState(user?.bet?.topAssist ?? '');
  const [betSaved, setBetSaved] = useState(false);
  const [betError, setBetError] = useState('');

  // { matchId: { home, away } } loaded from /api/predictions
  const [rawPredictions, setRawPredictions] = useState({});

  const totalPredictions = Object.keys(rawPredictions).length;

  // Spec: list every match the user predicted, formatted as
  // "Home vs Away  H–A", sorted by match kickoff date.
  const predictionList = Object.entries(rawPredictions)
    .map(([matchId, pred]) => {
      const match = matches.find((m) => String(m.id) === String(matchId));
      return { matchId, pred, match };
    })
    .sort((a, b) => {
      if (a.match && b.match) return new Date(a.match.utcDate) - new Date(b.match.utcDate);
      if (a.match) return -1;
      if (b.match) return 1;
      return 0;
    });

  // Spec: editable only before tournament kickoff (Jun 11, 2026).
  const canChangeBet = !isTournamentStarted();

  // ── Load team list (only — scorer/assist lists are fixed local constants) ──
  useEffect(() => {
    const load = async () => {
      try {
        const t = await fetchTeams();
        setTeams(t);
      } catch (err) {
        setOptionsError(parseApiError(err));
      } finally {
        setLoadingOptions(false);
      }
    };
    load();
  }, []);

  // ── Load this user's match predictions ────────────────────────────────────
  // Depend only on user.id (stable primitive) — not the user object, which is
  // recreated on every AuthContext render and would cause infinite loops.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const fetchPredictions = async () => {
      try {
        const { data } = await serverApi.get('/predictions', { params: { userId } });
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

  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  // The fixed lists may be empty until the user supplies them — render a
  // friendly placeholder option in that case (spec rule).
  const hasScorerList = TOP_SCORERS_LIST.length > 0;
  const hasAssistList = TOP_ASSISTS_LIST.length > 0;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('profile.title')}</h1>
      </div>

      <div className={styles.grid}>
        {/* ── 1. Account details ─────────────────────────────────────────── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>👤 {t('profile.account.heading')}</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t('profile.account.name')}</span>
            <span className={styles.infoValue}>{user?.name}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t('profile.account.email')}</span>
            <span className={styles.infoValue}>{user?.email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t('profile.account.joined')}</span>
            <span className={styles.infoValue}>{joinDate}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t('profile.account.role')}</span>
            <span className={`${styles.infoValue} ${styles.badge}`}>{user?.role}</span>
          </div>
        </section>

        {/* ── 2. Bet Summary ─────────────────────────────────────────────── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>📊 {t('profile.summary.heading')}</h2>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>🏆</span>
              <span className={styles.summaryLabel}>{t('profile.summary.tournamentWinner')}</span>
              <span className={styles.summaryValue}>
                {user?.bet?.winningTeam || <span className={styles.missing}>{t('profile.summary.notSet')}</span>}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>⚽</span>
              <span className={styles.summaryLabel}>{t('profile.summary.topScorer')}</span>
              <span className={styles.summaryValue}>
                {user?.bet?.topScorer || <span className={styles.missing}>{t('profile.summary.notSet')}</span>}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>🎯</span>
              <span className={styles.summaryLabel}>{t('profile.summary.topAssist')}</span>
              <span className={styles.summaryValue}>
                {user?.bet?.topAssist || <span className={styles.missing}>{t('profile.summary.notSet')}</span>}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryIcon}>📝</span>
              <span className={styles.summaryLabel}>{t('profile.summary.matchPredictions')}</span>
              <span className={styles.summaryValue}>{totalPredictions}</span>
            </div>
          </div>

          {(!user?.bet?.winningTeam || !user?.bet?.topScorer || !user?.bet?.topAssist) && (
            <div className={styles.reminderBox}>
              <strong>⚠️ {t('profile.missingBets')}:</strong>
              <ul className={styles.missingList}>
                {!user?.bet?.winningTeam && <li>{t('profile.missing.winner')}</li>}
                {!user?.bet?.topScorer && <li>{t('profile.missing.topScorer')}</li>}
                {!user?.bet?.topAssist && <li>{t('profile.missing.topAssist')}</li>}
              </ul>
              {!canChangeBet && (
                <p className={styles.locked}>{t('profile.bets.lockedNote')}</p>
              )}
            </div>
          )}
        </section>

        {/* ── 3. My Match Predictions list (spec format: "Home vs Away  H–A") ── */}
        <section className={`${styles.card} ${styles.fullWidth}`}>
          <h2 className={styles.cardTitle}>
            📋 {t('profile.predictions.heading')}
            <span className={styles.predCount}>{totalPredictions}</span>
          </h2>

          {totalPredictions === 0 ? (
            <div className={styles.emptyPreds}>
              <p>{t('profile.predictions.empty')}</p>
              <p className={styles.emptyPredsSub}>{t('profile.predictions.emptySub')}</p>
            </div>
          ) : (
            <ul className={styles.predList}>
              {predictionList.map(({ matchId, pred, match }) => {
                const homeName = match?.homeTeam?.shortName ?? match?.homeTeam?.name ?? '—';
                const awayName = match?.awayTeam?.shortName ?? match?.awayTeam?.name ?? '—';
                const dateStr = match
                  ? new Date(match.utcDate).toLocaleDateString(locale, {
                      day: '2-digit', month: 'short',
                    })
                  : '';

                return (
                  <li key={matchId} className={styles.predRow}>
                    <span className={styles.predDate}>{dateStr}</span>
                    <span className={styles.predTeams}>
                      {homeName} {t('matchCard.vs')} {awayName}
                    </span>
                    <span className={styles.predScore}>
                      {pred.home}–{pred.away}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── 4. Tournament Bets (editable until Jun 11, 2026) ───────────── */}
        <section className={`${styles.card} ${styles.fullWidth}`}>
          <h2 className={styles.cardTitle}>
            🎯 {t('profile.bets.heading')}
            {!canChangeBet && <span className={styles.lockedTag}>{t('profile.bets.locked')}</span>}
          </h2>

          {canChangeBet ? (
            <>
              <p className={styles.betNote}>{t('profile.bets.editableNote')}</p>

              {optionsError && (
                <div className={styles.optionsError}>
                  {t('profile.bets.loadError', { error: optionsError })}
                </div>
              )}

              <form onSubmit={handleSaveBet} className={styles.betForm}>
                <div className={styles.field}>
                  <label htmlFor="winningTeam">
                    🏅 {t('profile.bets.winnerLabel')}
                    {loadingOptions && <small> ({t('profile.bets.loading')})</small>}
                  </label>
                  <select
                    id="winningTeam"
                    value={winningTeam}
                    onChange={(e) => setWinningTeam(e.target.value)}
                    disabled={loadingOptions}
                  >
                    <option value="">— {t('profile.bets.winnerPlaceholder')} —</option>
                    {teams.map((tm) => (
                      <option key={tm.id} value={tm.name}>{tm.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="topScorer">⚽ {t('profile.bets.topScorerLabel')}</label>
                  <select
                    id="topScorer"
                    value={topScorer}
                    onChange={(e) => setTopScorer(e.target.value)}
                    disabled={!hasScorerList}
                  >
                    <option value="">— {t('profile.bets.playerPlaceholder')} —</option>
                    {hasScorerList
                      ? TOP_SCORERS_LIST.map((p) => <option key={p} value={p}>{p}</option>)
                      : <option disabled>{t('profile.bets.playerListUnavailable')}</option>}
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="topAssist">🎯 {t('profile.bets.topAssistLabel')}</label>
                  <select
                    id="topAssist"
                    value={topAssist}
                    onChange={(e) => setTopAssist(e.target.value)}
                    disabled={!hasAssistList}
                  >
                    <option value="">— {t('profile.bets.playerPlaceholder')} —</option>
                    {hasAssistList
                      ? TOP_ASSISTS_LIST.map((p) => <option key={p} value={p}>{p}</option>)
                      : <option disabled>{t('profile.bets.playerListUnavailable')}</option>}
                  </select>
                </div>

                {betError && <p className={styles.betError}>{betError}</p>}
                {betSaved && <p className={styles.betSuccess}>✅ {t('profile.bets.saved')}</p>}

                <button type="submit" className={styles.saveBtn} disabled={loadingOptions}>
                  {t('profile.bets.save')}
                </button>
              </form>
            </>
          ) : (
            <div className={styles.lockedMsg}>
              <p>{t('profile.bets.lockedNote')}</p>
              <div className={styles.lockedBets}>
                <div>
                  <strong>{t('profile.summary.tournamentWinner')}:</strong>{' '}
                  {user?.bet?.winningTeam ?? '—'}
                </div>
                <div>
                  <strong>{t('profile.summary.topScorer')}:</strong>{' '}
                  {user?.bet?.topScorer ?? '—'}
                </div>
                <div>
                  <strong>{t('profile.summary.topAssist')}:</strong>{' '}
                  {user?.bet?.topAssist ?? '—'}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
