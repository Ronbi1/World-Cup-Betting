import { useTranslation } from 'react-i18next';
import { TOP_SCORERS_LIST, TOP_ASSISTS_LIST } from '../utils/constants';
import styles from './TopScorersPage.module.css';

// TheSportsDB free V1 has no "top scorers in competition" endpoint, so this
// page now renders the manually-supplied lists from src/utils/constants.js.
// The owner pastes the final names in there; until then, both arrays are
// empty and the page shows the "list not supplied yet" empty state.

const rankEmoji = (idx) => {
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return idx + 1;
};

function CandidateList({ titleKey, emoji, names }) {
  const { t } = useTranslation();

  if (names.length === 0) {
    return (
      <section className={styles.tableWrapper}>
        <h2 className={styles.sectionTitle}>{emoji} {t(titleKey)}</h2>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📋</div>
          <h3>{t('topScorers.staticEmptyTitle')}</h3>
          <p>{t('topScorers.staticEmptyBody')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.tableWrapper}>
      <h2 className={styles.sectionTitle}>{emoji} {t(titleKey)}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thRank}>{t('topScorers.rank')}</th>
            <th>{t('topScorers.player')}</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, idx) => (
            <tr key={name} className={idx < 3 ? styles.topThree : ''}>
              <td className={styles.rank}>{rankEmoji(idx)}</td>
              <td>
                <div className={styles.playerCell}>
                  <span className={styles.playerName}>{name}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function TopScorersPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>⚽ {t('topScorers.title')}</h1>
        <p className={styles.sub}>{t('topScorers.subtitleStatic')}</p>
      </div>

      <CandidateList
        titleKey="topScorers.topScorerCandidates"
        emoji="⚽"
        names={TOP_SCORERS_LIST}
      />

      <CandidateList
        titleKey="topScorers.topAssistCandidates"
        emoji="🎯"
        names={TOP_ASSISTS_LIST}
      />

      <p className={styles.note}>{t('topScorers.staticNote')}</p>
    </main>
  );
}
