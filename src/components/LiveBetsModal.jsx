import { useState, useEffect } from 'react';
import { Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import serverApi from '../services/serverApi';
import { MATCH_STATUS, REG_STATUS } from '../utils/constants';
import TeamFlag from './TeamFlag';
import styles from './LiveBetsModal.module.css';

const isMatchLive = (status) =>
  status === MATCH_STATUS.IN_PLAY || status === MATCH_STATUS.PAUSED;

// Compare a saved prediction to the current/final score and bucket it into
// one of four outcomes the table renders. Mirrors LiveBetsReveal's prior
// behavior — kept as a local helper since the modal is the only caller now.
const getPredictionResult = (prediction, liveScore) => {
  if (!prediction || liveScore.home === null) return 'pending';
  if (prediction.home === liveScore.home && prediction.away === liveScore.away) return 'exact';
  const predResult =
    prediction.home > prediction.away ? 'home' :
    prediction.home < prediction.away ? 'away' : 'draw';
  const liveResult =
    liveScore.home > liveScore.away ? 'home' :
    liveScore.home < liveScore.away ? 'away' : 'draw';
  if (predResult === liveResult) return 'result';
  return 'wrong';
};

const RESULT_ICON = {
  exact: '🎯',
  result: '✅',
  wrong: '❌',
  pending: '⏳',
};

// Single-match predictions reveal — opened from a MatchCard click once the
// match has kicked off. Replaces the old inline LiveBetsReveal section that
// sat below the leaderboard. We fetch the predictions for just this one
// match on open (cheap, scoped) and tear them down on close so reopening
// for a different match starts from a clean state.
export default function LiveBetsModal({ match, users, currentUserId, opened, onClose }) {
  const { t } = useTranslation();
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(false);
  // Set of user ids whose prediction for this match has an admin-edit
  // audit row. Powers the "Edited by admin" badge — visible to every
  // authenticated user as part of the pool's accountability layer.
  const [editedUserIds, setEditedUserIds] = useState(() => new Set());

  // Fetch predictions for this match whenever the modal opens for a new
  // match id. Reusing the existing /predictions endpoint with a single id
  // keeps the surface area identical to the old reveal component.
  //
  // The initial setLoading(true)/setPredictions({}) clear is intentional —
  // it avoids flashing the previous match's predictions for one frame when
  // the modal is reopened against a different fixture. The codebase uses
  // the same disable comment for the analogous reset in BetModal.jsx.
  useEffect(() => {
    if (!opened || !match) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setPredictions({});
    setEditedUserIds(new Set());

    // Parallel fetch: live predictions for this match + the audit-log
    // flag set for this match. The edits call is best-effort — if it
    // fails (network, server), we still render the predictions table.
    Promise.all([
      serverApi.get('/predictions', { params: { matchIds: String(match.id) } }),
      serverApi
        .get('/predictions/edits', { params: { matchIds: String(match.id) } })
        .catch((err) => {
          console.warn('[LiveBetsModal] edits fetch failed:', err.message);
          return { data: [] };
        }),
    ])
      .then(([predsRes, editsRes]) => {
        if (cancelled) return;
        const map = {};
        (predsRes.data ?? []).forEach((row) => {
          map[row.user_id] = { home: row.home, away: row.away };
        });
        setPredictions(map);
        setEditedUserIds(new Set((editsRes.data ?? []).map((e) => e.target_user_id)));
      })
      .catch((err) => {
        if (!cancelled) console.error('[LiveBetsModal] fetch error:', err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opened, match]);

  if (!match) return null;

  const isLive = isMatchLive(match.status);
  const liveScore = match.score;
  const approvedUsers = (users ?? []).filter((u) => u.status === REG_STATUS.APPROVED);
  const rows = approvedUsers.map((u) => {
    const pred = predictions[u.id] ?? null;
    const result = pred ? getPredictionResult(pred, liveScore) : null;
    return { user: u, pred, result };
  });
  const anyPrediction = rows.some((r) => r.pred);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <span className={styles.modalTitle}>
          {isLive && <span className={styles.liveDot} aria-hidden="true" />}
          {t('liveBets.title')}
        </span>
      }
      centered
      size="lg"
      overlayProps={{ blur: 3 }}
      classNames={{ body: styles.modalBody }}
    >
      <div className={styles.scoreHeader}>
        <div className={styles.teamInline}>
          <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} size={22} />
          <span className={styles.teamLabel}>{match.homeTeam.shortName}</span>
        </div>

        <div className={styles.scorePill}>
          <span className={`${styles.scoreText} ${isLive ? styles.scoreTextLive : ''} numerals`}>
            {liveScore.home ?? 0} – {liveScore.away ?? 0}
          </span>
          {match.status === MATCH_STATUS.PAUSED && (
            <span className={styles.htBadge}>{t('matchStatus.halfTime')}</span>
          )}
          {match.status === MATCH_STATUS.FINISHED && (
            <span className={styles.ftBadge}>{t('matchStatus.finished')}</span>
          )}
        </div>

        <div className={`${styles.teamInline} ${styles.teamInlineRight}`}>
          <span className={styles.teamLabel}>{match.awayTeam.shortName}</span>
          <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} size={22} />
        </div>
      </div>

      {loading ? (
        <Text size="sm" c="dimmed" ta="center" mt="md">{t('common.loading')}</Text>
      ) : !anyPrediction ? (
        <p className={styles.noPreds}>{t('liveBets.noPredictions')}</p>
      ) : (
        <table className={styles.predsTable}>
          <thead>
            <tr>
              <th>{t('liveBets.table.player')}</th>
              <th className={styles.thScore}>{t('liveBets.table.predictedScore')}</th>
              <th className={styles.thStatus}>{t('liveBets.table.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a, b) => {
                const order = { exact: 0, result: 1, wrong: 2, pending: 3, null: 4 };
                return (order[a.result] ?? 4) - (order[b.result] ?? 4);
              })
              .map(({ user: u, pred, result }) => (
                <tr
                  key={u.id}
                  className={`${u.id === currentUserId ? styles.youRow : ''} ${result ? styles[`row_${result}`] : ''}`}
                >
                  <td className={styles.playerCell}>
                    <span className={styles.playerName}>{u.name}</span>
                    {u.id === currentUserId && (
                      <span className={styles.youTag}>{t('leaderboard.you')}</span>
                    )}
                    {editedUserIds.has(u.id) && (
                      <span className={styles.editedTag} title={t('liveBets.editedBadge')}>
                        {t('liveBets.editedBadge')}
                      </span>
                    )}
                  </td>

                  <td className={styles.predScore}>
                    {pred ? (
                      <span className={`${styles.scoreChip} numerals`}>
                        {pred.home} – {pred.away}
                      </span>
                    ) : (
                      <span className={styles.noBet}>{t('liveBets.result.noBet')}</span>
                    )}
                  </td>

                  <td className={styles.resultCell}>
                    {pred ? (
                      <span className={`${styles.badge} ${styles[`badge_${result}`]}`}>
                        {RESULT_ICON[result] ?? ''} {t(`liveBets.result.${result}`)}
                      </span>
                    ) : (
                      <span className={styles.badge}>—</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
