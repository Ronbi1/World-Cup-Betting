import { useTranslation } from 'react-i18next';
import styles from './MatchTimeline.module.css';

const eventTag = (text = '') => {
  const s = text.toLowerCase();
  if (s.includes('own goal')) return 'OG';
  if (s.includes('penalty')) return 'P';
  return null;
};

// Two-sided goal/card timeline down a center spine: home events branch to the
// home side, away to the away side, minutes hug the middle. Fully RTL-safe
// (logical properties + grid columns mirror with `direction`). Shared by the
// MatchCard report and the live banner.
//
// `ev.side` ('home' | 'away') is set by the scraper from ESPN's own home/away
// data; the name-match is only a fallback for rows scraped before side tagging.
export default function MatchTimeline({ events, match }) {
  const { t } = useTranslation();
  return (
    <ol className={styles.timeline}>
      {events.map((ev, i) => {
        const isHome = ev.side
          ? ev.side === 'home'
          : Boolean(ev.team && (ev.team === match.homeTeam?.name || ev.team === match.homeTeam?.shortName));
        const scorer = ev.players?.[0] || ev.team || '';
        const tag = ev.kind === 'goal' ? eventTag(ev.text) : null;
        const markCls =
          ev.kind === 'goal' ? styles.markGoal
            : ev.kind === 'red' ? styles.markRed
              : styles.markYellow;
        const kindLabel =
          ev.kind === 'goal' ? t('liveToast.goal')
            : ev.kind === 'red' ? t('liveToast.red')
              : t('liveToast.yellow');

        const name = (
          <span className={styles.eventName}>
            {scorer}
            {tag && <span className={styles.eventTag}>{tag}</span>}
          </span>
        );
        const mark = <span className={`${styles.eventMark} ${markCls}`} aria-hidden="true" />;
        const min = <span className={`${styles.eventMin} numerals`}>{ev.clock}</span>;

        return (
          <li
            key={ev.id ?? `${ev.kind}-${i}`}
            className={`${styles.event} ${isHome ? styles.eventHome : styles.eventAway}`}
            aria-label={`${ev.clock ?? ''} ${kindLabel} ${scorer}`.trim()}
          >
            {isHome ? <>{name}{mark}{min}</> : <>{min}{mark}{name}</>}
          </li>
        );
      })}
    </ol>
  );
}
