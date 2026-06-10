import { useTranslation } from 'react-i18next';
import styles from './Podium.module.css';

// Top-3 podium tiles — replaces the old "medal emoji in row 1" leaderboard
// treatment. Renders 2nd · 1st · 3rd left-to-right with 1st tallest and
// centered. Reusable: HomePage uses it above the leaderboard table; future
// callers (TopScorersPage) can pass the same shape.
//
// Each row is the leaderboard shape derived in HomePage:
//   { id, name, points, correctResults, exactScores, isCurrentUser }
//
// `currentUserId` highlights the tile belonging to the viewer regardless
// of where they sit on the podium (or no tile at all if they're not top 3).
export default function Podium({ top3, currentUserId }) {
  const { t } = useTranslation();

  if (!top3 || top3.length === 0) return null;

  const [first, second, third] = top3;
  // Render order: 2 · 1 · 3 (1st centered and tallest). When the league
  // has fewer than three approved users, render the missing slots as
  // placeholder tiles so the podium stays balanced.
  const slots = [
    { row: second, rank: 2, tone: 'silver' },
    { row: first, rank: 1, tone: 'gold' },
    { row: third, rank: 3, tone: 'bronze' },
  ];

  return (
    <ol className={styles.podium} aria-label={t('home.leaderboard')}>
      {slots.map(({ row, rank, tone }) => (
        <li
          key={tone}
          className={`${styles.tile} ${styles[`tile_${tone}`]} ${rank === 1 ? styles.tileFirst : ''} ${row?.id === currentUserId ? styles.tileYou : ''} ${!row ? styles.tileEmpty : ''}`}
          aria-label={row ? `${rank}: ${row.name} — ${row.points} ${t('leaderboard.points')}` : undefined}
        >
          <span className={`${styles.rankMark} numerals`}>{rank}</span>
          {row ? (
            <>
              <span className={styles.name} title={row.name}>{row.name}</span>
              <span className={styles.pointsRow}>
                <span className={`${styles.pointsValue} numerals`}>{row.points}</span>
                <span className={styles.pointsUnit}>{t('home.hero.pts')}</span>
              </span>
              <span className={styles.statsRow}>
                <span className="numerals">{row.exactScores}</span>
                <span className={styles.statsLabel}>{t('leaderboard.exact')}</span>
                <span className={styles.statsDot} aria-hidden="true">·</span>
                <span className="numerals">{row.correctResults}</span>
                <span className={styles.statsLabel}>{t('leaderboard.results')}</span>
              </span>
              {row.id === currentUserId && (
                <span className={styles.youTag}>{t('leaderboard.you')}</span>
              )}
            </>
          ) : (
            <span className={styles.emptySlot}>—</span>
          )}
        </li>
      ))}
    </ol>
  );
}
