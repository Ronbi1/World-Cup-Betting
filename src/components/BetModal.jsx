import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import serverApi from '../services/serverApi';
import { extractApiError } from '../utils/apiErrors';
import { hasMatchStarted, formatMatchDate } from '../utils/matchTime';
import TeamFlag from './TeamFlag';
import styles from './BetModal.module.css';

const MIN_SCORE = 0;
// MUST match MAX_PREDICTION_SCORE in api/_routes/predictions.routes.js so
// that any score the UI lets the user save is also accepted by the server.
const MAX_SCORE = 20;

// Coerce any input to an integer in [MIN, MAX]. Empty / NaN / negatives all
// snap to MIN_SCORE so the default 0-0 contract is honored.
function clampScore(value) {
  if (value === '' || value === null || value === undefined) return MIN_SCORE;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return MIN_SCORE;
  if (n < MIN_SCORE) return MIN_SCORE;
  if (n > MAX_SCORE) return MAX_SCORE;
  return n;
}

// Small custom stepper. Keyboard arrows + manual typing + 0-20 clamp.
// Forced LTR direction (the score string itself reads left-to-right even
// in Hebrew/RTL pages) so the − always sits on the left of the number.
//
// When `disabled` is true, the stepper renders as a read-only summary:
// both buttons are disabled, the input is readOnly, and a visual
// disabled class is applied to make non-interactivity obvious.
function ScoreStepper({ label, value, onChange, ariaLabel, disabled = false }) {
  const [draft, setDraft] = useState(String(value));

  // Sync external value → draft when changed by parent (pre-fill, reset).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(String(value));
  }, [value]);

  const commit = useCallback((raw) => {
    const next = clampScore(raw);
    onChange(next);
    setDraft(String(next));
  }, [onChange]);

  const handleInputChange = (e) => {
    if (disabled) return;
    // Allow temporary empty string while typing; restrict to digits only.
    const cleaned = e.target.value.replace(/[^0-9]/g, '');
    setDraft(cleaned);
  };

  const handleInputBlur = () => {
    if (disabled) return;
    commit(draft);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      commit(clampScore(value) + 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      commit(clampScore(value) - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      e.currentTarget.blur();
    }
  };

  const dec = () => commit(clampScore(value) - 1);
  const inc = () => commit(clampScore(value) + 1);

  const decDisabled = disabled || clampScore(value) <= MIN_SCORE;
  const incDisabled = disabled || clampScore(value) >= MAX_SCORE;

  const inputClassName = disabled
    ? `${styles.stepperInput} ${styles.stepperInputDisabled}`
    : styles.stepperInput;

  return (
    <div className={styles.stepperWrap}>
      <label className={styles.stepperLabel}>{label}</label>
      <div className={styles.stepper} dir="ltr">
        <button
          type="button"
          onClick={dec}
          disabled={decDisabled}
          className={styles.stepperBtn}
          aria-label={`Decrease ${ariaLabel || label}`}
          tabIndex={-1}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className={inputClassName}
          aria-label={ariaLabel || label}
          maxLength={2}
          readOnly={disabled}
        />
        <button
          type="button"
          onClick={inc}
          disabled={incDisabled}
          className={styles.stepperBtn}
          aria-label={`Increase ${ariaLabel || label}`}
          tabIndex={-1}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function BetModal({ match, opened, onClose, onSaved }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  // Initial form value is 0-0. A user that opens the modal and saves
  // immediately stores a 0-0 prediction. Users who never open the modal
  // have no prediction at all and earn 0 points for the match.
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);

  // Kickoff lock — true once the match has started. Mirrors the server-side
  // gate on POST /api/predictions; the server is authoritative, this is UX.
  //
  // Two recalculation paths:
  //   1. Whenever `match` changes (e.g. the modal instance is reused for a
  //      different fixture), the effect resets `locked` from scratch — the
  //      useState initializer only runs on mount and would otherwise leak a
  //      stale value from the previous match.
  //   2. If the modal stays open through kickoff, a setTimeout flips it from
  //      unlocked → locked at the precise moment (with a small 250ms buffer
  //      for clock skew between client and the upstream schedule).
  const [locked, setLocked] = useState(() => hasMatchStarted(match));

  useEffect(() => {
    if (!match) return;
    const started = hasMatchStarted(match);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocked(started);
    if (started) return;

    const msUntilKickoff = new Date(match.utcDate).getTime() - Date.now();
    if (!Number.isFinite(msUntilKickoff) || msUntilKickoff <= 0) {
      setLocked(true);
      return;
    }
    const timer = setTimeout(() => setLocked(true), msUntilKickoff + 250);
    return () => clearTimeout(timer);
  }, [match]);

  // Pre-populate inputs if the user already has a prediction for this match.
  // If they don't, we KEEP the default 0-0 so saving immediately is valid.
  // Runs for locked matches too — the user must still see their saved score
  // in the read-only summary.
  useEffect(() => {
    if (!match || !user) return;
    const fetchExisting = async () => {
      try {
        const { data } = await serverApi.get('/predictions', {
          params: { userId: user.id, matchId: String(match.id) },
        });
        const prediction = data[0];
        if (prediction) {
          setHomeScore(clampScore(prediction.home));
          setAwayScore(clampScore(prediction.away));
        } else {
          setHomeScore(0);
          setAwayScore(0);
        }
      } catch {
        setHomeScore(0);
        setAwayScore(0);
      }
    };
    fetchExisting();
  }, [match, user]);

  const handleSave = async () => {
    // Coerce empty / null / NaN to 0 — saving with only one side modified
    // (e.g. 1-0 or 0-2) is fully supported.
    const home = clampScore(homeScore);
    const away = clampScore(awayScore);

    try {
      await serverApi.post('/predictions', {
        user_id: user.id,
        match_id: String(match.id),
        home,
        away,
      });

      notifications.show({
        title: t('betModal.savedTitle'),
        message: `${match.homeTeam.shortName} ${home} – ${away} ${match.awayTeam.shortName}`,
        color: 'green',
        autoClose: 4000,
      });
      onSaved?.(String(match.id), { home, away });
      onClose();
    } catch (err) {
      notifications.show({
        title: t('betModal.errorTitle'),
        message: extractApiError(err, t('betModal.errorBody')),
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  // Guard against the brief render window during modal close animation.
  if (!match) return null;

  const formatDate = (utcDate) =>
    formatMatchDate(utcDate, locale, {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });

  // Knockout-stage matches use only the regulation-time score. Surface this
  // at the moment of decision so users predicting in the modal aren't
  // surprised later. Group-stage matches don't have the distinction.
  const isKnockoutStage = match.stage && match.stage !== 'GROUP_STAGE';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<span className={styles.modalTitle}>{t('betModal.title')}</span>}
      centered
      size="sm"
      overlayProps={{ blur: 3 }}
    >
      <Stack gap="lg">
        <Text size="xs" c="dimmed" ta="center">
          {formatDate(match.utcDate)}
          {match.group ? ` · ${match.group}` : ''}
        </Text>

        {isKnockoutStage && (
          <div className={styles.knockoutReminder}>
            <span className={styles.knockoutChip}>90'</span>
            <span className={styles.knockoutText}>
              {t('betModal.knockoutReminder')}
            </span>
          </div>
        )}

        {locked && (
          <div className={styles.lockedBanner} role="status">
            {t('betModal.lockedNotice')}
          </div>
        )}

        <div className={styles.teams}>
          <div className={styles.team}>
            <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} size={48} />
            <Text fw={700} size="sm" ta="center" className={styles.teamName}>
              {match.homeTeam.name}
            </Text>
          </div>

          <Text size="xl" fw={800} c="dimmed" className={styles.vs}>{t('matchCard.vs')}</Text>

          <div className={styles.team}>
            <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} size={48} />
            <Text fw={700} size="sm" ta="center" className={styles.teamName}>
              {match.awayTeam.name}
            </Text>
          </div>
        </div>

        <div className={styles.inputs}>
          <ScoreStepper
            label={match.homeTeam.shortName}
            value={homeScore}
            onChange={setHomeScore}
            ariaLabel={`${match.homeTeam.name} score`}
            disabled={locked}
          />
          <span className={styles.dash}>–</span>
          <ScoreStepper
            label={match.awayTeam.shortName}
            value={awayScore}
            onChange={setAwayScore}
            ariaLabel={`${match.awayTeam.name} score`}
            disabled={locked}
          />
        </div>

        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {locked ? t('betModal.close') : t('betModal.cancel')}
          </Button>
          {locked ? (
            <Button disabled color="gray">
              {t('betModal.locked')}
            </Button>
          ) : (
            <Button color="indigo" onClick={handleSave}>
              {t('betModal.save')}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
