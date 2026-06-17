import { useState, useEffect, useMemo } from 'react';
import { Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import serverApi from '../services/serverApi';
import { useMatches } from '../hooks/useMatches';
import { MATCH_STATUS } from '../utils/constants';
import { formatMatchDate, hasMatchStarted } from '../utils/matchTime';
import { calcMatchPoints, computeExactScoreBonus } from '../utils/scoring';
import styles from './PlayerScoreModal.module.css';

function resolveBet(predMap, match) {
  const saved = predMap[String(match.id)];
  if (saved) return { home: saved.home, away: saved.away, virtual: false };
  if (hasMatchStarted(match)) return { home: 0, away: 0, virtual: true };
  return null;
}

function hasFinalScore(match) {
  const actual = match.score?.fullTime;
  return actual?.home !== null && actual?.home !== undefined;
}

export default function PlayerScoreModal({ player, currentUserId, opened, onClose }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';
  const { matches, loading: loadingMatches, refresh: refreshMatches } = useMatches();

  const [predictions, setPredictions] = useState({});
  const [loadingPreds, setLoadingPreds] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const isSelf = player?.id === currentUserId;

  useEffect(() => {
    if (!opened) return undefined;
    refreshMatches();
    return undefined;
  }, [opened, refreshMatches]);

  useEffect(() => {
    if (!opened || !player?.id) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPreds(true);
    setPredictions({});
    setFetchError(null);

    serverApi
      .get('/predictions', { params: { userId: player.id } })
      .then(({ data }) => {
        if (cancelled) return;
        const map = {};
        (data ?? []).forEach((row) => {
          map[String(row.match_id)] = { home: row.home, away: row.away };
        });
        setPredictions(map);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[PlayerScoreModal] fetch error:', err.message);
          setFetchError(err.response?.data?.error ?? err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreds(false);
      });

    return () => {
      cancelled = true;
    };
  }, [opened, player?.id]);

  const { rows, matchPointsTotal, streakBonus } = useMemo(() => {
    if (!player || matches.length === 0) {
      return { rows: [], matchPointsTotal: 0, streakBonus: 0 };
    }

    const relevant = matches
      .filter((m) => {
        if (hasMatchStarted(m)) return true;
        return isSelf && predictions[String(m.id)];
      })
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

    const finished = relevant.filter((m) => m.status === MATCH_STATUS.FINISHED && hasFinalScore(m));

    const predByMatchId = new Map();
    relevant.forEach((m) => {
      const bet = resolveBet(predictions, m);
      if (bet) predByMatchId.set(String(m.id), bet);
    });

    let matchPointsTotal = 0;
    const tableRows = relevant.map((match) => {
      const bet = resolveBet(predictions, match);
      const actual = match.score?.fullTime;
      const finishedWithScore = hasFinalScore(match);
      let points = null;
      let rowClass = '';

      const isFinished = match.status === MATCH_STATUS.FINISHED && finishedWithScore;

      if (bet && isFinished) {
        const result = calcMatchPoints(bet, match);
        points = result.points;
        matchPointsTotal += result.points;
        if (result.exact) rowClass = styles.rowExact;
        else if (result.correct) rowClass = styles.rowResult;
      }

      return { match, bet, actual, points, rowClass, finishedWithScore };
    });

    const streakBonus = computeExactScoreBonus(finished, predByMatchId);

    return {
      rows: tableRows,
      matchPointsTotal,
      streakBonus,
    };
  }, [player, matches, predictions, isSelf]);

  const loading = loadingPreds || loadingMatches;

  if (!player) return null;

  const exactBonus = player.exactScoreBonus ?? streakBonus;
  const leaderboardTotal = player.points ?? 0;
  const explainedTotal = matchPointsTotal + exactBonus;
  const tournamentBonusGap = Math.max(0, leaderboardTotal - explainedTotal);
  const totalMismatch = !loading && Math.abs(leaderboardTotal - explainedTotal - tournamentBonusGap) > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <span className={styles.modalTitle}>
          {t('playerScore.title', { name: player.name })}
        </span>
      }
      centered
      size="lg"
      overlayProps={{ blur: 3 }}
      classNames={{ body: styles.modalBody }}
    >
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('playerScore.totalPoints')}</span>
          <span className={`${styles.summaryValue} numerals`}>{leaderboardTotal}</span>
        </div>
      </div>

      {loading ? (
        <Text size="sm" c="dimmed" ta="center" mt="md">{t('common.loading')}</Text>
      ) : fetchError ? (
        <p className={styles.empty}>{fetchError}</p>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>{t('playerScore.empty')}</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('playerScore.col.match')}</th>
                  <th className={styles.colCenter}>{t('playerScore.col.bet')}</th>
                  <th className={styles.colCenter}>{t('playerScore.col.result')}</th>
                  <th className={styles.colPoints}>{t('playerScore.col.points')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ match, bet, actual, points, rowClass, finishedWithScore }) => {
                  const homeName = match.homeTeam?.shortName ?? match.homeTeam?.name ?? '—';
                  const awayName = match.awayTeam?.shortName ?? match.awayTeam?.name ?? '—';
                  const dateStr = formatMatchDate(match.utcDate, locale, {
                    day: '2-digit',
                    month: 'short',
                  });

                  let pointsClass = styles.pointsZero;
                  if (points === null) pointsClass = styles.pointsPending;
                  else if (points >= 3) pointsClass = styles.pointsExact;
                  else if (points === 1) pointsClass = styles.pointsResult;

                  return (
                    <tr key={match.id} className={rowClass}>
                      <td>
                        <span className={styles.matchTeams}>
                          {homeName} {t('matchCard.vs')} {awayName}
                        </span>
                        <span className={styles.matchDate}>{dateStr}</span>
                      </td>
                      <td className={styles.colCenter}>
                        {bet ? (
                          <span
                            className={`${styles.scoreChip} numerals ${bet.virtual ? styles.virtualBet : ''}`}
                            title={bet.virtual ? t('playerScore.virtualBet') : undefined}
                          >
                            {bet.home}–{bet.away}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.colCenter}>
                        {finishedWithScore ? (
                          <span className={`${styles.scoreChip} numerals`}>
                            {actual.home}–{actual.away}
                          </span>
                        ) : hasMatchStarted(match) ? (
                          <span className={`${styles.scoreChip} numerals`}>
                            {actual?.home ?? 0}–{actual?.away ?? 0}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={`${styles.colPoints} ${pointsClass} numerals`}>
                        {points !== null ? points : t('playerScore.pending')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={styles.subtotalRow}>
                  <td colSpan={3}>{t('playerScore.matchPointsSubtotal')}</td>
                  <td className={`${styles.colPoints} numerals`}>{matchPointsTotal}</td>
                </tr>
                {exactBonus > 0 && (
                  <tr className={styles.subtotalRow}>
                    <td colSpan={3}>{t('playerScore.streakBonus')}</td>
                    <td className={`${styles.colPoints} numerals`}>+{exactBonus}</td>
                  </tr>
                )}
                {tournamentBonusGap > 0 && (
                  <tr className={styles.subtotalRow}>
                    <td colSpan={3}>{t('playerScore.tournamentBonus')}</td>
                    <td className={`${styles.colPoints} numerals`}>+{tournamentBonusGap}</td>
                  </tr>
                )}
                {(exactBonus > 0 || tournamentBonusGap > 0) && (
                  <tr className={styles.totalRow}>
                    <td colSpan={3}>{t('playerScore.totalPoints')}</td>
                    <td className={`${styles.colPoints} numerals`}>{leaderboardTotal}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {(exactBonus > 0 || tournamentBonusGap > 0 || totalMismatch || !isSelf) && (
            <div className={styles.footer}>
              {exactBonus > 0 && (
                <p className={styles.footerLine}>
                  <span>{t('playerScore.streakBonusNote', { points: exactBonus })}</span>
                </p>
              )}
              {tournamentBonusGap > 0 && (
                <p className={styles.footerLine}>
                  <span>{t('playerScore.tournamentBonusNote', { points: tournamentBonusGap })}</span>
                </p>
              )}
              {totalMismatch && (
                <p className={styles.footerNote}>{t('playerScore.syncNote')}</p>
              )}
              {!isSelf && (
                <p className={styles.footerNote}>{t('playerScore.privacyNote')}</p>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
