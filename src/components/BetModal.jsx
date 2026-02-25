import { useState, useEffect } from 'react';
import { Modal, NumberInput, Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../context/AuthContext';
import { STORAGE_KEYS } from '../utils/constants';
import TeamFlag from './TeamFlag';
import styles from './BetModal.module.css';

// ─── localStorage helpers ─────────────────────────────────────────────────────
const loadPredictions = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MATCH_PREDICTIONS) || '{}');
  } catch {
    return {};
  }
};

const savePredictions = (data) => {
  localStorage.setItem(STORAGE_KEYS.MATCH_PREDICTIONS, JSON.stringify(data));
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function BetModal({ match, opened, onClose }) {
  const { user } = useAuth();
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');

  // Pre-populate inputs if the user already has a prediction for this match
  useEffect(() => {
    if (!match || !user) return;
    const all = loadPredictions();
    const existing = all[user.id]?.[match.id];
    if (existing !== undefined) {
      setHomeScore(existing.home);
      setAwayScore(existing.away);
    } else {
      setHomeScore('');
      setAwayScore('');
    }
  }, [match, user]);

  const handleSave = () => {
    if (homeScore === '' || homeScore === null || awayScore === '' || awayScore === null) {
      notifications.show({
        title: 'Incomplete prediction',
        message: 'Please enter a score for both teams.',
        color: 'red',
        autoClose: 3000,
      });
      return;
    }

    const all = loadPredictions();
    if (!all[user.id]) all[user.id] = {};

    const prediction = {
      home: Number(homeScore),
      away: Number(awayScore),
    };

    all[user.id][match.id] = prediction;
    savePredictions(all);

    // TODO: When backend is added, POST prediction to /api/bets instead
    console.log('Prediction saved:', {
      userId: user.id,
      matchId: match.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      prediction,
    });

    notifications.show({
      title: '✅ Prediction saved!',
      message: `${match.homeTeam.shortName} ${prediction.home} – ${prediction.away} ${match.awayTeam.shortName}`,
      color: 'green',
      autoClose: 4000,
    });

    onClose();
  };

  // Guard against brief window during modal close animation
  if (!match) return null;

  const formatDate = (utcDate) =>
    new Date(utcDate).toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<span className={styles.modalTitle}>⚽ Place Your Prediction</span>}
      centered
      size="sm"
      overlayProps={{ blur: 3 }}
    >
      <Stack gap="lg">
        {/* Date info */}
        <Text size="xs" c="dimmed" ta="center">
          {formatDate(match.utcDate)}
          {match.group ? ` · ${match.group}` : ''}
        </Text>

        {/* Teams display */}
        <div className={styles.teams}>
          <div className={styles.team}>
            <TeamFlag
              crest={match.homeTeam.crest}
              tla={match.homeTeam.tla}
              name={match.homeTeam.name}
              size={48}
            />
            <Text fw={700} size="sm" ta="center" className={styles.teamName}>
              {match.homeTeam.name}
            </Text>
          </div>

          <Text size="xl" fw={800} c="dimmed" className={styles.vs}>vs</Text>

          <div className={styles.team}>
            <TeamFlag
              crest={match.awayTeam.crest}
              tla={match.awayTeam.tla}
              name={match.awayTeam.name}
              size={48}
            />
            <Text fw={700} size="sm" ta="center" className={styles.teamName}>
              {match.awayTeam.name}
            </Text>
          </div>
        </div>

        {/* Score inputs */}
        <div className={styles.inputs}>
          <NumberInput
            label={match.homeTeam.shortName}
            value={homeScore}
            onChange={setHomeScore}
            min={0}
            max={20}
            placeholder="0"
            clampBehavior="strict"
            allowDecimal={false}
            allowNegative={false}
            size="lg"
            styles={{ input: { textAlign: 'center', fontSize: '1.5rem', fontWeight: 800 } }}
          />
          <span className={styles.dash}>–</span>
          <NumberInput
            label={match.awayTeam.shortName}
            value={awayScore}
            onChange={setAwayScore}
            min={0}
            max={20}
            placeholder="0"
            clampBehavior="strict"
            allowDecimal={false}
            allowNegative={false}
            size="lg"
            styles={{ input: { textAlign: 'center', fontSize: '1.5rem', fontWeight: 800 } }}
          />
        </div>

        {/* Actions */}
        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button color="indigo" onClick={handleSave}>
            Save Prediction
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
