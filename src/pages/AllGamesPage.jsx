import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatches } from '../hooks/useMatches';
import { useAuth } from '../context/AuthContext';
import MatchCard from '../components/MatchCard';
import SkeletonCard from '../components/SkeletonCard';
import BetModal from '../components/BetModal';
import LiveBetsReveal from '../components/LiveBetsReveal';
import { MATCH_STATUS, STAGE_ORDER } from '../utils/constants';
import styles from './AllGamesPage.module.css';

const groupMatchesByStageAndGroup = (matches) => {
  const stageMap = {};
  for (const match of matches) {
    const stage = match.stage || 'GROUP_STAGE';
    if (!stageMap[stage]) stageMap[stage] = {};
    const group = match.group || 'Matches';
    if (!stageMap[stage][group]) stageMap[stage][group] = [];
    stageMap[stage][group].push(match);
  }
  return stageMap;
};

const isToday = (utcDate) => {
  const d = new Date(utcDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

export default function AllGamesPage() {
  const { matches, loading, error } = useMatches();
  const { user, users } = useAuth();
  const { t } = useTranslation();
  const [activeStage, setActiveStage] = useState('GROUP_STAGE');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [modalOpened, setModalOpened] = useState(false);

  const handleMatchClick = (match) => {
    setSelectedMatch(match);
    setModalOpened(true);
  };

  const handleModalClose = () => setModalOpened(false);

  const stageMap = groupMatchesByStageAndGroup(matches);
  const availableStages = STAGE_ORDER.filter((s) => stageMap[s]);
  const currentStageGroups = stageMap[activeStage] ?? {};

  const filteredGroups = {};
  for (const [group, groupMatches] of Object.entries(currentStageGroups)) {
    const filtered = groupMatches.filter((m) => {
      if (filterStatus === 'TODAY') return isToday(m.utcDate);
      if (filterStatus === 'FINISHED') return m.status === MATCH_STATUS.FINISHED;
      if (filterStatus === 'UPCOMING')
        return m.status === MATCH_STATUS.SCHEDULED || m.status === MATCH_STATUS.TIMED;
      return true;
    });
    if (filtered.length > 0) filteredGroups[group] = filtered;
  }

  const todayCount = matches.filter((m) => isToday(m.utcDate)).length;

  const filterLabel = (f) => {
    if (f === 'ALL') return t('allGames.filter.all');
    if (f === 'TODAY') return t('allGames.filter.today', { count: todayCount });
    if (f === 'UPCOMING') return t('allGames.filter.upcoming');
    if (f === 'FINISHED') return t('allGames.filter.finished');
    return f;
  };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('allGames.title')}</h1>
        <p className={styles.sub}>{t('allGames.subtitle')}</p>
      </div>

      <div className={styles.stageTabs}>
        {loading
          ? STAGE_ORDER.map((s) => (
              <div key={s} className={`${styles.stageTab} ${styles.shimmer}`} style={{ width: 100, height: 36 }} />
            ))
          : availableStages.length > 0
            ? availableStages.map((stage) => (
                <button
                  key={stage}
                  onClick={() => setActiveStage(stage)}
                  className={`${styles.stageTab} ${activeStage === stage ? styles.stageActive : ''}`}
                >
                  {t(`stages.${stage}`)}
                </button>
              ))
            : STAGE_ORDER.map((stage) => (
                <button
                  key={stage}
                  onClick={() => setActiveStage(stage)}
                  className={`${styles.stageTab} ${activeStage === stage ? styles.stageActive : ''} ${styles.placeholder}`}
                >
                  {t(`stages.${stage}`)}
                </button>
              ))}
      </div>

      <div className={styles.filterBar}>
        {['ALL', 'TODAY', 'UPCOMING', 'FINISHED'].map((f) => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`${styles.filterBtn} ${filterStatus === f ? styles.filterActive : ''}`}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>

      {error && (
        <div className={styles.errorBox}>
          <p>{t('allGames.loadError', { error })}</p>
        </div>
      )}

      {loading && (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📅</div>
          <h3>{t('allGames.scheduleNotAvailable')}</h3>
          <p>{t('allGames.scheduleNotAvailableBody')}</p>
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        Object.keys(filteredGroups).length === 0 ? (
          <div className={styles.empty}>
            <p>{t('allGames.noMatchesFilter')}</p>
          </div>
        ) : (
          <div className={styles.stageContent}>
            {Object.entries(filteredGroups)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([group, groupMatches]) => (
                <section key={group} className={styles.groupSection}>
                  <h3 className={styles.groupTitle}>{group}</h3>
                  <div className={styles.matchGrid}>
                    {groupMatches
                      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
                      .map((m) => (
                        <div key={m.id} className={isToday(m.utcDate) ? styles.todayHighlight : ''}>
                          <MatchCard match={m} onClick={handleMatchClick} />
                        </div>
                      ))}
                  </div>
                </section>
              ))}
          </div>
        )
      )}

      {!loading && !error && matches.length > 0 && (
        <div className={styles.liveBetsWrapper}>
          <LiveBetsReveal matches={matches} users={users} currentUserId={user?.id} />
        </div>
      )}

      <BetModal match={selectedMatch} opened={modalOpened} onClose={handleModalClose} />
    </main>
  );
}
