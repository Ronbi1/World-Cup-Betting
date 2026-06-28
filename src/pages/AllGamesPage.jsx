import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatches } from '../hooks/useMatches';
import { useMinuteTick } from '../hooks/useMinuteTick';
import { useUserPredictions } from '../hooks/useUserPredictions';
import { useAuth } from '../context/useAuth';
import MatchCard from '../components/MatchCard';
import SkeletonCard from '../components/SkeletonCard';
import BetModal from '../components/BetModal';
import LiveBetsModal from '../components/LiveBetsModal';
import LiveScoreBanner from '../components/LiveScoreBanner';
import { MATCH_STATUS, STAGE_ORDER, REG_STATUS } from '../utils/constants';
import { detectCurrentStage } from '../utils/stages';
import { isMatchToday, isMatchOnDate, toIsraelDateString, hasMatchStarted } from '../utils/matchTime';
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

const applyStatusFilter = (list, filterStatus) =>
  list.filter((m) => {
    if (filterStatus === 'TODAY') return isMatchToday(m.utcDate);
    if (filterStatus === 'FINISHED') return m.status === MATCH_STATUS.FINISHED;
    if (filterStatus === 'UPCOMING')
      return m.status === MATCH_STATUS.SCHEDULED || m.status === MATCH_STATUS.TIMED;
    return true;
  });

const matchHasTeam = (match, teamKey) => {
  if (!teamKey || teamKey === 'ALL') return true;
  if (teamKey.startsWith('name:')) {
    const name = teamKey.slice(5);
    return match.homeTeam?.name === name || match.awayTeam?.name === name;
  }
  return match.homeTeam?.id === teamKey || match.awayTeam?.id === teamKey;
};

const sortByKickoff = (a, b) => new Date(a.utcDate) - new Date(b.utcDate);

export default function AllGamesPage() {
  const { matches, loading, error, lastUpdated, refresh } = useMatches();
  const { user, users, scores } = useAuth();
  const { t } = useTranslation();
  // null until a user click sets it explicitly. While null, the render uses
  // detectCurrentStage(matches) as the effective stage so the page lands on
  // the live tournament stage (first stage in STAGE_ORDER with any pending
  // match). A user tab click locks in for the rest of the session.
  const [activeStage, setActiveStage] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState('chronological');
  const [playedExpanded, setPlayedExpanded] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterGroup, setFilterGroup] = useState('ALL');
  const [filterTeam, setFilterTeam] = useState('ALL');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [liveBetsMatch, setLiveBetsMatch] = useState(null);
  const [liveBetsOpened, setLiveBetsOpened] = useState(false);

  const now = useMinuteTick();
  const { predictions, upsertPrediction } = useUserPredictions();

  // Render-time effective stage: until the user picks a tab, follow the live
  // tournament stage detected from match data. No useEffect needed — the
  // calculation is pure and re-runs naturally when `matches` changes (cheap:
  // single pass per render).
  const detectedStage = useMemo(() => detectCurrentStage(matches), [matches]);
  const effectiveStage = activeStage ?? detectedStage ?? 'GROUP_STAGE';

  const handleMatchClick = (match) => {
    if (hasMatchStarted(match)) {
      setLiveBetsMatch(match);
      setLiveBetsOpened(true);
    } else {
      setSelectedMatch(match);
      setModalOpened(true);
    }
  };

  const handleModalClose = () => setModalOpened(false);

  const handleStageChange = (stage) => {
    setActiveStage(stage);
    setFilterGroup('ALL');
  };

  const stageMap = groupMatchesByStageAndGroup(matches);
  const availableStages = STAGE_ORDER.filter((s) => stageMap[s]);

  const stageMatches = useMemo(
    () => matches.filter((m) => (m.stage || 'GROUP_STAGE') === effectiveStage),
    [matches, effectiveStage],
  );

  const availableGroups = useMemo(() => {
    if (effectiveStage !== 'GROUP_STAGE') return [];
    const groups = new Set();
    for (const m of stageMatches) {
      if (m.group) groups.add(m.group);
    }
    return [...groups].sort((a, b) => a.localeCompare(b));
  }, [stageMatches, effectiveStage]);

  const stageTeams = useMemo(() => {
    const teamMap = new Map();
    for (const m of stageMatches) {
      for (const side of [m.homeTeam, m.awayTeam]) {
        if (!side?.name) continue;
        const key = side.id ?? `name:${side.name}`;
        if (!teamMap.has(key)) teamMap.set(key, { key, name: side.name });
      }
    }
    return [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [stageMatches]);

  const dateRange = useMemo(() => {
    const dates = stageMatches
      .map((m) => toIsraelDateString(m.utcDate))
      .filter(Boolean)
      .sort();
    if (dates.length === 0) return { min: '', max: '' };
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [stageMatches]);

  const filteredMatches = useMemo(() => {
    let result = applyStatusFilter(stageMatches, filterStatus);
    if (filterDate) {
      result = result.filter((m) => isMatchOnDate(m.utcDate, filterDate));
    }
    if (filterGroup !== 'ALL' && effectiveStage === 'GROUP_STAGE') {
      result = result.filter((m) => m.group === filterGroup);
    }
    if (filterTeam !== 'ALL') {
      result = result.filter((m) => matchHasTeam(m, filterTeam));
    }
    return result;
  }, [stageMatches, filterStatus, filterDate, filterGroup, filterTeam, effectiveStage]);

  const filteredGroups = useMemo(() => {
    const groups = {};
    for (const m of filteredMatches) {
      const group = m.group || 'Matches';
      if (!groups[group]) groups[group] = [];
      groups[group].push(m);
    }
    return groups;
  }, [filteredMatches]);

  const chronologicalMatches = useMemo(
    () => [...filteredMatches].sort(sortByKickoff),
    [filteredMatches],
  );

  // In chronological view, already-played (finished) games are tucked away in
  // a collapsed accordion so the list leads with live/upcoming fixtures.
  const { playedMatches, upcomingMatches } = useMemo(() => {
    const played = [];
    const upcoming = [];
    for (const m of chronologicalMatches) {
      if (m.status === MATCH_STATUS.FINISHED) played.push(m);
      else upcoming.push(m);
    }
    return { playedMatches: played, upcomingMatches: upcoming };
  }, [chronologicalMatches]);

  const hasFilteredResults = viewMode === 'chronological'
    ? chronologicalMatches.length > 0
    : Object.keys(filteredGroups).length > 0;

  const todayCount = matches.filter((m) => isMatchToday(m.utcDate)).length;

  const filterLabel = (f) => {
    if (f === 'ALL') return t('allGames.filter.all');
    if (f === 'TODAY') return t('allGames.filter.today', { count: todayCount });
    if (f === 'UPCOMING') return t('allGames.filter.upcoming');
    if (f === 'FINISHED') return t('allGames.filter.finished');
    return f;
  };

  const revealUsers = users.length > 0
    ? users
    : scores.map((s) => ({
        id: s.userId,
        name: s.name,
        status: REG_STATUS.APPROVED,
      }));

  const renderMatchCard = (m) => (
    <div key={m.id} className={isMatchToday(m.utcDate) ? styles.todayHighlight : ''}>
      <MatchCard
        match={m}
        onClick={handleMatchClick}
        onBets={handleMatchClick}
        now={now}
        userPrediction={predictions[String(m.id)]}
      />
    </div>
  );

  return (
    <main className={styles.page}>
      {!loading && matches.length > 0 && (
        <LiveScoreBanner
          matches={matches}
          lastUpdated={lastUpdated}
          onRefresh={refresh}
        />
      )}

      <div className={styles.controlsGrid}>
        <div className={styles.controlsPrimary}>
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
                      onClick={() => handleStageChange(stage)}
                      className={`${styles.stageTab} ${effectiveStage === stage ? styles.stageActive : ''}`}
                    >
                      {t(`stages.${stage}`)}
                    </button>
                  ))
                : STAGE_ORDER.map((stage) => (
                    <button
                      key={stage}
                      onClick={() => handleStageChange(stage)}
                      className={`${styles.stageTab} ${effectiveStage === stage ? styles.stageActive : ''} ${styles.placeholder}`}
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
        </div>

        <div className={styles.advancedFilters}>
        <div className={styles.filterRow}>
          <span className={styles.filterRowLabel}>{t('allGames.filter.viewLabel')}</span>
          <div className={styles.filterBar}>
            <button
              type="button"
              onClick={() => setViewMode('byGroup')}
              className={`${styles.filterBtn} ${viewMode === 'byGroup' ? styles.filterActive : ''}`}
            >
              <span className={styles.labelFull}>{t('allGames.filter.viewByGroup')}</span>
              <span className={styles.labelShort}>{t('allGames.filter.viewByGroupShort')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chronological')}
              className={`${styles.filterBtn} ${viewMode === 'chronological' ? styles.filterActive : ''}`}
            >
              <span className={styles.labelFull}>{t('allGames.filter.viewChronological')}</span>
              <span className={styles.labelShort}>{t('allGames.filter.viewChronologicalShort')}</span>
            </button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <label className={styles.filterRowLabel} htmlFor="filter-date">
            {t('allGames.filter.dateLabel')}
          </label>
          <div className={styles.dateControls}>
            <input
              id="filter-date"
              type="date"
              className={styles.dateInput}
              value={filterDate}
              min={dateRange.min || undefined}
              max={dateRange.max || undefined}
              onChange={(e) => setFilterDate(e.target.value)}
            />
            {filterDate && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setFilterDate('')}
              >
                {t('allGames.filter.dateClear')}
              </button>
            )}
          </div>
        </div>

        {effectiveStage === 'GROUP_STAGE' && availableGroups.length > 0 && (
          <div className={styles.filterRow}>
            <label className={styles.filterRowLabel} htmlFor="filter-group">
              {t('allGames.filter.groupSectionLabel')}
            </label>
            <select
              id="filter-group"
              className={styles.filterSelect}
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="ALL">{t('allGames.filter.groupAll')}</option>
              {availableGroups.map((g) => (
                <option key={g} value={g}>
                  {t('allGames.filter.groupLabel', { letter: g })}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.filterRow}>
          <label className={styles.filterRowLabel} htmlFor="filter-team">
            {t('allGames.filter.teamLabel')}
          </label>
          <select
            id="filter-team"
            className={styles.filterSelect}
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
          >
            <option value="ALL">{t('allGames.filter.teamAll')}</option>
            {stageTeams.map((team) => (
              <option key={team.key} value={team.key}>{team.name}</option>
            ))}
          </select>
        </div>
        </div>
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
        !hasFilteredResults ? (
          <div className={styles.empty}>
            <p>{t('allGames.noMatchesFilter')}</p>
          </div>
        ) : viewMode === 'chronological' ? (
          <div className={styles.chronoContent}>
            {playedMatches.length > 0 && (
              <section className={styles.playedAccordion}>
                <button
                  type="button"
                  className={styles.playedToggle}
                  onClick={() => setPlayedExpanded((prev) => !prev)}
                  aria-expanded={playedExpanded}
                >
                  <span className={styles.playedToggleLabel}>
                    {t('allGames.playedGames', { count: playedMatches.length })}
                  </span>
                  <span className={`${styles.playedChevron} ${playedExpanded ? styles.playedChevronOpen : ''}`}>
                    ▾
                  </span>
                </button>
                {playedExpanded && (
                  <div className={styles.matchGrid}>
                    {playedMatches.map(renderMatchCard)}
                  </div>
                )}
              </section>
            )}
            {upcomingMatches.length > 0 && (
              <div className={styles.matchGrid}>
                {upcomingMatches.map(renderMatchCard)}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.stageContent}>
            {Object.entries(filteredGroups)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([group, groupMatches]) => (
                <section key={group} className={styles.groupSection}>
                  <h3 className={styles.groupTitle}>{group}</h3>
                  <div className={styles.matchGrid}>
                    {[...groupMatches].sort(sortByKickoff).map(renderMatchCard)}
                  </div>
                </section>
              ))}
          </div>
        )
      )}

      <BetModal
        match={selectedMatch}
        opened={modalOpened}
        onClose={handleModalClose}
        onSaved={upsertPrediction}
      />

      <LiveBetsModal
        match={liveBetsMatch}
        users={revealUsers}
        currentUserId={user?.id}
        opened={liveBetsOpened}
        onClose={() => setLiveBetsOpened(false)}
      />
    </main>
  );
}
