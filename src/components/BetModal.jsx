import { useState, useEffect } from 'react';
import { Modal, NumberInput, Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import serverApi from '../services/serverApi';
import TeamFlag from './TeamFlag';
import styles from './BetModal.module.css';

export default function BetModal({ match, opened, onClose }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');

  // Pre-populate inputs if the user already has a prediction for this match
  useEffect(() => {
    if (!match || !user) return;
    const fetchExisting = async () => {
      try {
        const { data } = await serverApi.get('/predictions', {
          params: { userId: user.id, matchId: String(match.id) },
        });
        const prediction = data[0];
        if (prediction) { setHomeScore(prediction.home); setAwayScore(prediction.away); }
        else { setHomeScore(''); setAwayScore(''); }
      } catch {
        setHomeScore(''); setAwayScore('');
      }
    };
    fetchExisting();
  }, [match, user]);

  const handleSave = async () => {
    if (homeScore === '' || homeScore === null || awayScore === '' || awayScore === null) {
      notifications.show({
        title: t('betModal.incompleteTitle'),
        message: t('betModal.incompleteBody'),
        color: 'red',
        autoClose: 3000,
      });
      return;
    }

    try {
      await serverApi.post('/predictions', {
        user_id: user.id,
        match_id: String(match.id),
        home: Number(homeScore),
        away: Number(awayScore),
      });

      notifications.show({
        title: t('betModal.savedTitle'),
        message: `${match.homeTeam.shortName} ${Number(homeScore)} – ${Number(awayScore)} ${match.awayTeam.shortName}`,
        color: 'green',
        autoClose: 4000,
      });
      onClose();
    } catch (err) {
      notifications.show({
        title: t('betModal.errorTitle'),
        message: err.response?.data?.error || t('betModal.errorBody'),
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  // Guard against the brief render window during modal close animation.
  if (!match) return null;

  const formatDate = (utcDate) =>
    new Date(utcDate).toLocaleDateString(locale, {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });

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

        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t('betModal.cancel')}
          </Button>
          <Button color="indigo" onClick={handleSave}>
            {t('betModal.save')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
