import { useState, useEffect, useMemo } from 'react';
import { Modal, Stack, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import serverApi from '../services/serverApi';
import { useMatches } from '../hooks/useMatches';
import { REG_STATUS, STAGE_ORDER } from '../utils/constants';
import { formatMatchDate, formatMatchTime } from '../utils/matchTime';
import styles from './AdminOverrideModal.module.css';

const MIN_SCORE = 0;
const MAX_SCORE = 20;

function clampScore(v) {
  if (v === '' || v === null || v === undefined) return MIN_SCORE;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return MIN_SCORE;
  if (n < MIN_SCORE) return MIN_SCORE;
  if (n > MAX_SCORE) return MAX_SCORE;
  return n;
}

// Admin-only modal for overriding any user's prediction at any time.
// Lives entirely inside the AdminPage path so the normal BetModal flow is
// untouched and the kickoff lock keeps applying to regular users.
//
// Save → POST /api/predictions/admin-edit (writes audit row + busts cache).
export default function AdminOverrideModal({ opened, onClose }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';
  const { users, adminEditPrediction } = useAuth();
  const { matches, loading: matchesLoading } = useMatches();

  const [targetUserId, setTargetUserId] = useState('');
  const [targetMatchId, setTargetMatchId] = useState('');
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPred, setCurrentPred] = useState(null);
  const [error, setError] = useState('');

  // Approved non-admin users — admins don't carry leaderboard scores so
  // overriding an admin's prediction makes no product sense.
  const candidateUsers = useMemo(
    () => (users ?? [])
      .filter((u) => u.status === REG_STATUS.APPROVED && u.role === 'USER')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  // Group matches by stage so the dropdown is scannable.
  const matchesByStage = useMemo(() => {
    const groups = {};
    for (const stage of STAGE_ORDER) groups[stage] = [];
    (matches ?? []).forEach((m) => {
      const stage = m.stage && groups[m.stage] ? m.stage : 'GROUP_STAGE';
      groups[stage].push(m);
    });
    for (const stage of Object.keys(groups)) {
      groups[stage].sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
    }
    return groups;
  }, [matches]);

  // Reset everything every time the modal reopens — leaving stale state
  // around is dangerous for a privileged tool.
  useEffect(() => {
    if (!opened) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargetUserId('');
    setTargetMatchId('');
    setHome(0);
    setAway(0);
    setReason('');
    setError('');
    setCurrentPred(null);
  }, [opened]);

  // Whenever (user, match) are both set, pre-fill the inputs with the
  // user's existing prediction. Falls back to 0-0 if none — but we record
  // null/null in the audit on save (server-side), preserving the distinction.
  useEffect(() => {
    if (!opened || !targetUserId || !targetMatchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentPred(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await serverApi.get('/predictions', {
          params: { userId: targetUserId, matchId: String(targetMatchId) },
        });
        if (cancelled) return;
        const existing = (data || [])[0] ?? null;
        setCurrentPred(existing);
        if (existing) {
          setHome(clampScore(existing.home));
          setAway(clampScore(existing.away));
        } else {
          setHome(0);
          setAway(0);
        }
      } catch {
        if (!cancelled) setCurrentPred(null);
      }
    })();
    return () => { cancelled = true; };
  }, [opened, targetUserId, targetMatchId]);

  const canSubmit = !!targetUserId && !!targetMatchId && !saving;

  const selectedMatch = useMemo(
    () => (matches ?? []).find((m) => String(m.id) === String(targetMatchId)),
    [matches, targetMatchId],
  );

  const selectedUser = useMemo(
    () => candidateUsers.find((u) => u.id === targetUserId),
    [candidateUsers, targetUserId],
  );

  const handleSave = async () => {
    if (!canSubmit) {
      setError(t('admin.override.missingFields'));
      return;
    }
    setSaving(true);
    setError('');
    const homeS = clampScore(home);
    const awayS = clampScore(away);
    const result = await adminEditPrediction({
      userId: targetUserId,
      matchId: String(targetMatchId),
      home: homeS,
      away: awayS,
      reason: reason.trim() || undefined,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error || t('admin.override.errorTitle'));
      return;
    }
    notifications.show({
      title: t('admin.override.saved'),
      message: t('admin.override.savedDetail', {
        user: selectedUser?.name || targetUserId,
        home: homeS,
        away: awayS,
        match: selectedMatch
          ? `${selectedMatch.homeTeam.shortName}–${selectedMatch.awayTeam.shortName}`
          : targetMatchId,
      }),
      color: 'green',
      autoClose: 4000,
    });
    onClose();
  };

  const fmtMatchOption = (m) => {
    const date = m.utcDate
      ? `${formatMatchDate(m.utcDate, locale, { day: '2-digit', month: 'short' })} ${formatMatchTime(m.utcDate, locale)}`
      : '';
    return `${m.homeTeam.shortName} – ${m.awayTeam.shortName}${date ? ` · ${date}` : ''}${m.status === 'FINISHED' ? ' · FT' : ''}`;
  };

  return (
    <Modal
      opened={opened}
      onClose={saving ? () => {} : onClose}
      title={<span className={styles.modalTitle}>{t('admin.override.modalTitle')}</span>}
      centered
      size="md"
      overlayProps={{ blur: 3 }}
    >
      <p className={styles.subtitle}>{t('admin.override.modalSubtitle')}</p>

      <Stack gap="md">
        <div className={styles.warningBanner}>{t('admin.override.sectionHint')}</div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="override-user">
            {t('admin.override.userLabel')}
          </label>
          <select
            id="override-user"
            className={styles.select}
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            disabled={saving}
          >
            <option value="">{t('admin.override.userPlaceholder')}</option>
            {candidateUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="override-match">
            {t('admin.override.matchLabel')}
          </label>
          <select
            id="override-match"
            className={styles.select}
            value={targetMatchId}
            onChange={(e) => setTargetMatchId(e.target.value)}
            disabled={saving || matchesLoading}
          >
            <option value="">{t('admin.override.matchPlaceholder')}</option>
            {STAGE_ORDER.map((stage) => {
              const group = matchesByStage[stage] || [];
              if (group.length === 0) return null;
              return (
                <optgroup key={stage} label={t(`stages.${stage}`)}>
                  {group.map((m) => (
                    <option key={m.id} value={m.id}>{fmtMatchOption(m)}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {targetUserId && targetMatchId && (
          <div className={styles.current}>
            <span className={styles.currentLabel}>{t('admin.override.currentLabel')}</span>
            <span className={styles.currentValue}>
              {currentPred
                ? `${currentPred.home} – ${currentPred.away}`
                : t('admin.override.noCurrent')}
            </span>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>{t('admin.override.scoreLabel')}</label>
          <div className={styles.scoreRow}>
            <input
              type="number"
              className={styles.select}
              min={MIN_SCORE}
              max={MAX_SCORE}
              value={home}
              onChange={(e) => setHome(clampScore(e.target.value))}
              disabled={saving}
              aria-label="home score"
            />
            <span className={styles.scoreDash}>–</span>
            <input
              type="number"
              className={styles.select}
              min={MIN_SCORE}
              max={MAX_SCORE}
              value={away}
              onChange={(e) => setAway(clampScore(e.target.value))}
              disabled={saving}
              aria-label="away score"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="override-reason">
            {t('admin.override.reasonLabel')}
          </label>
          <textarea
            id="override-reason"
            className={styles.textarea}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 200))}
            placeholder={t('admin.override.reasonPlaceholder')}
            maxLength={200}
            disabled={saving}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <Group justify="flex-end" mt="xs">
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            {t('common.cancel')}
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!canSubmit}
            type="button"
          >
            {saving ? t('admin.override.saving') : t('admin.override.save')}
          </button>
        </Group>
      </Stack>
    </Modal>
  );
}
