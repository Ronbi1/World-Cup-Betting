import { useState, useEffect, useMemo } from 'react';
import { Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import serverApi from '../services/serverApi';
import { useMatches } from '../hooks/useMatches';
import { MATCH_STATUS } from '../utils/constants';
import { formatMatchDate, hasMatchStarted } from '../utils/matchTime';
import { calcMatchPoints, computeExactScoreBonus } from '../utils/scoring';
import styles from './PlayerScoreModal.module.css';

function ScoreFrame({ home, away }) {
  return (
    <span className={`${styles.scorePill} numerals`}>
      <span className={styles.scoreNum}>{home}</span>
      <span className={styles.scoreSep} aria-hidden="true">–</span>
      <span className={styles.scoreNum}>{away}</span>
    </span>
  );
}

function resolveBet(predMap, match) {
  const saved = predMap[String(match.id)];
  if (saved) return { home: saved.home, away: saved.away };
  return null;
}

function hasFinalScore(match) {
  const actual = match.score?.fullTime;
  return actual?.home !== null && actual?.home !== undefined;
}

// For knockout matches that went to ET/penalties, scoring uses the regulation
// (90' + added) result, not the displayed final. The breakdown shows the
// regulation score prominently with a "90'" tag so users understand why a
// 1-1 prediction scored after the broadcast finished 2-1 in ET.
function scoringResultFor(match) {
  const stage = match.stage || 'GROUP_STAGE';
  const reg = match.score?.regulation;
  const hasReg = reg && reg.home != null && reg.away != null;
  const wentToET = !!(match.score?.wentToExtraTime || match.score?.decidedByPenalties);
  if (stage !== 'GROUP_STAGE' && hasReg) return reg;
  if (stage !== 'GROUP_STAGE' && wentToET) return null; // unresolved
  return match.score?.fullTime ?? null;
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
      const fullTime = match.score?.fullTime;
      const scoringResult = scoringResultFor(match);
      const finishedWithScore = hasFinalScore(match);
      const wentToET = !!(match.score?.wentToExtraTime || match.score?.decidedByPenalties);
      const showsRegulation =
        wentToET &&
        (match.stage || 'GROUP_STAGE') !== 'GROUP_STAGE' &&
        scoringResult != null;
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

      return {
        match,
        bet,
        fullTime,
        scoringResult,
        wentToET,
        showsRegulation,
        points,
        rowClass,
        finishedWithScore,
      };
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
  const hasStreakBonus = exactBonus > 0;
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
        <div
          className={styles.summaryItem}
          title={hasStreakBonus ? t('leaderboard.exactBonusTooltip') : t('playerScore.streakBadgeEmpty')}
        >
          <span className={styles.summaryLabel}>{t('playerScore.streakBadgeLabel')}</span>
          <span
            className={`${styles.streakBadge} ${hasStreakBonus ? styles.streakBadgeEarned : styles.streakBadgePending}`}
            aria-label={hasStreakBonus ? t('playerScore.streakBadgeEarned') : t('playerScore.streakBadgeEmpty')}
          >
            {hasStreakBonus ? (
              <span className={styles.streakCheck} aria-hidden="true">✓</span>
            ) : (
              <span className={styles.streakPending} aria-hidden="true">—</span>
            )}
          </span>
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
                  <th className={styles.colMatch}>{t('playerScore.col.match')}</th>
                  <th className={styles.colCenter}>{t('playerScore.col.bet')}</th>
                  <th className={styles.colCenter}>{t('playerScore.col.result')}</th>
                  <th className={styles.colPoints}>{t('playerScore.col.points')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({
                  match,
                  bet,
                  fullTime,
                  scoringResult,
                  wentToET,
                  showsRegulation,
                  points,
                  rowClass,
                  finishedWithScore,
                }) => {
                  const homeName = match.homeTeam?.shortName ?? match.homeTeam?.name ?? '—';
                  const awayName = match.awayTeam?.shortName ?? match.awayTeam?.name ?? '—';
                  const dateStr = formatMatchDate(match.utcDate, locale, {
                    day: '2-digit',
                    month: 'short',
                  });

                  // Use the per-match exact/correct flags from calcMatchPoints
                  // (re-derived only when needed) instead of the brittle
                  // points-≥-3 / points===1 thresholds, which no longer hold
                  // across knockout stages where exact starts at 4.
                  let pointsClass = styles.pointsZero;
                  if (points === null) pointsClass = styles.pointsPending;
                  else if (rowClass === styles.rowExact) pointsClass = styles.pointsExact;
                  else if (rowClass === styles.rowResult) pointsClass = styles.pointsResult;

                  return (
                    <tr key={match.id} className={rowClass}>
                      <td className={styles.colMatch}>
                        <span className={styles.matchTeams}>
                          {homeName} {t('matchCard.vs')} {awayName}
                        </span>
                        <span className={styles.matchDate}>{dateStr}</span>
                      </td>
                      <td className={styles.colCenter}>
                        {bet ? (
                          <ScoreFrame home={bet.home} away={bet.away} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.colCenter}>
                        {showsRegulation ? (
                          <span
                            className={styles.resultStack}
                            title={t('playerScore.regulationTooltip', {
                              defaultValue:
                                "Scored on regulation-time result. Final after ET/penalties shown below.",
                            })}
                          >
                            <span className={styles.regTag}>
                              {t('playerScore.regulationTag', { defaultValue: "90'" })}
                            </span>
                            <ScoreFrame home={scoringResult.home} away={scoringResult.away} />
                            {fullTime && (fullTime.home !== scoringResult.home ||
                              fullTime.away !== scoringResult.away) && (
                              <span className={`${styles.finalNote} numerals`}>
                                {t('playerScore.finalAfter', {
                                  defaultValue: 'Final {{home}}–{{away}}',
                                  home: fullTime.home,
                                  away: fullTime.away,
                                })}
                              </span>
                            )}
                          </span>
                        ) : finishedWithScore ? (
                          <ScoreFrame home={fullTime.home} away={fullTime.away} />
                        ) : hasMatchStarted(match) ? (
                          <ScoreFrame home={fullTime?.home ?? 0} away={fullTime?.away ?? 0} />
                        ) : wentToET && !scoringResult ? (
                          <span className={styles.finalNote}>
                            {t('playerScore.unresolved', {
                              defaultValue: 'ET/penalties — regulation score unavailable',
                            })}
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
