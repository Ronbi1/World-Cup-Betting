import { useTranslation } from 'react-i18next';
import styles from './MatchTimeline.module.css';

const eventTag = (text = '') => {
  const s = text.toLowerCase();
  if (s.includes('own goal')) return 'OG';
  if (s.includes('penalty')) return 'P';
  return null;
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

// Which team an event belongs to. Prefer the scraper's `side` (from ESPN's
// own home/away ids — always right). Fall back for older rows that predate
// side tagging: match the event's team against each side's name/shortName/TLA
// with substring tolerance, since ESPN names differ from worldcup26's
// (e.g. "Czechia" vs "Czech Republic", but both relate to "CZE").
function eventSide(ev, match) {
  if (ev.side === 'home' || ev.side === 'away') return ev.side;
  const t = norm(ev.team);
  if (!t) return 'home';
  const rel = (a, b) => Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  const isHome = [match.homeTeam?.name, match.homeTeam?.shortName, match.homeTeam?.tla]
    .map(norm).some((h) => rel(t, h));
  const isAway = [match.awayTeam?.name, match.awayTeam?.shortName, match.awayTeam?.tla]
    .map(norm).some((a) => rel(t, a));
  if (isHome && !isAway) return 'home';
  if (isAway && !isHome) return 'away';
  return 'home';
}

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
        const isHome = eventSide(ev, match) === 'home';
        // A scoring play is always a goal — guards rows scraped before the
        // "Penalty - Scored" → goal fix (which stored them as kind: 'red').
        const kind = ev.scoringPlay ? 'goal' : ev.kind;
        const scorer = ev.players?.[0] || ev.team || '';
        const tag = kind === 'goal' ? eventTag(ev.text) : null;
        const markCls =
          kind === 'goal' ? styles.markGoal
            : kind === 'red' ? styles.markRed
              : styles.markYellow;
        const kindLabel =
          kind === 'goal' ? t('liveToast.goal')
            : kind === 'red' ? t('liveToast.red')
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
            // Explicit row per event (chronological), so the 2-column grid
            // never packs several events onto one shared row.
            style={{ gridRow: i + 1 }}
            aria-label={`${ev.clock ?? ''} ${kindLabel} ${scorer}`.trim()}
          >
            {isHome ? <>{name}{mark}{min}</> : <>{min}{mark}{name}</>}
          </li>
        );
      })}
    </ol>
  );
}
