import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TeamFlag from './TeamFlag';
import styles from './MatchCard.module.css';
import { MATCH_STATUS } from '../utils/constants';
import { formatMatchDate, formatMatchTime, formatKickoffCountdown } from '../utils/matchTime';

const statusKey = (status) => {
  switch (status) {
    case MATCH_STATUS.FINISHED: return { key: 'finished', cls: 'finished' };
    case MATCH_STATUS.IN_PLAY: return { key: 'live', cls: 'live' };
    case MATCH_STATUS.PAUSED: return { key: 'halfTime', cls: 'live' };
    case MATCH_STATUS.POSTPONED: return { key: 'postponed', cls: 'postponed' };
    case MATCH_STATUS.CANCELLED: return { key: 'cancelled', cls: 'postponed' };
    default: return { key: 'scheduled', cls: 'scheduled' };
  }
};

// Only goals + cards make the on-ticket report; subs and other events stay in
// the (richer) data but would clutter this compact view.
const EVENT_KINDS = new Set(['goal', 'yellow', 'red']);

const eventTag = (text = '') => {
  const s = text.toLowerCase();
  if (s.includes('own goal')) return 'OG';
  if (s.includes('penalty')) return 'P';
  return null;
};

// The match report — a two-sided timeline down a center spine: home events
// branch left, away events branch right, minutes hug the middle. Goals are
// gold ball-marks; bookings are rotated yellow/red referee-card chips.
function MatchReport({ events, match, t }) {
  return (
    <ol className={styles.report}>
      {events.map((ev, i) => {
        const isHome =
          ev.team &&
          (ev.team === match.homeTeam?.name || ev.team === match.homeTeam?.shortName);
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

// `now` is supplied by the parent list page via `useMinuteTick()` so every
// card on the page re-renders against the same instant once per minute,
// avoiding N independent intervals. Standalone callers (e.g. tests, future
// solo use) can omit `now` and the helper falls back to `Date.now()`.
export default function MatchCard({ match, compact = false, onClick, onBets, now, userPrediction }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  const formatDate = (utcDate) => formatMatchDate(utcDate, locale);
  const formatTime = (utcDate) => formatMatchTime(utcDate, locale);

  const { key: stKey, cls: stCls } = statusKey(match.status);
  const isFinished = match.status === MATCH_STATUS.FINISHED;
  const isLive =
    match.status === MATCH_STATUS.IN_PLAY || match.status === MATCH_STATUS.PAUSED;
  const isStarted = isLive || isFinished;
  const isKnockoutStage = match.stage && match.stage !== 'GROUP_STAGE';

  // Goals + cards captured by the live scraper (matches_mirror.normalized.events).
  const events = Array.isArray(match.events)
    ? match.events.filter((e) => EVENT_KINDS.has(e.kind))
    : [];
  // A live match always offers the report (events may still arrive); a finished
  // one only if it actually has events.
  const showReport = isStarted && (events.length > 0 || isLive);
  const [expanded, setExpanded] = useState(isLive); // live opens by default

  const isUpcoming =
    match.status === MATCH_STATUS.SCHEDULED || match.status === MATCH_STATUS.TIMED;
  const countdownText = isUpcoming
    ? formatKickoffCountdown(match.utcDate, t, now)
    : null;

  const hasUserPrediction = userPrediction != null;
  const showPredictedScoreInCenter = isUpcoming && hasUserPrediction;

  // Card-body click: started → toggle the report; upcoming → open the bet
  // modal (unchanged). The bets dialog moves to its own button for started
  // matches so the body click is free to drive the accordion.
  const isClickable = isStarted ? showReport : Boolean(onClick);
  const handleActivate = () => {
    if (isStarted) {
      if (showReport) setExpanded((v) => !v);
    } else if (onClick) {
      onClick(match);
    }
  };

  let scoreContent;
  let scoreToneClass = '';
  if (isFinished || isLive) {
    scoreContent = `${match.score.home ?? 0} – ${match.score.away ?? 0}`;
    scoreToneClass = isLive ? styles.scoreLive : styles.scoreFinal;
  } else if (showPredictedScoreInCenter) {
    scoreContent = `${userPrediction.home} – ${userPrediction.away}`;
    scoreToneClass = styles.scorePrediction;
  } else {
    scoreContent = formatTime(match.utcDate);
    scoreToneClass = styles.scoreTime;
  }

  return (
    <article
      className={`${styles.card} ${compact ? styles.compact : ''} ${isClickable ? styles.clickable : ''} ${hasUserPrediction ? styles.hasPrediction : ''} ${isLive ? styles.cardLive : ''} ${isFinished ? styles.cardFinished : ''}`}
      onClick={isClickable ? handleActivate : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-expanded={isStarted && showReport ? expanded : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); }
      } : undefined}
    >
      <div className={styles.meta}>
        <span className={`${styles.statusBadge} ${styles[stCls]}`}>
          {isLive && <span className={styles.liveDot} aria-hidden="true" />}
          {t(`matchStatus.${stKey}`)}
        </span>
        <span className={styles.date}>{formatDate(match.utcDate)}</span>
        {countdownText && (
          <span className={styles.countdown}>{countdownText}</span>
        )}
        {isKnockoutStage && (
          <span className={styles.stageBadge}>{t(`stages.${match.stage}`)}</span>
        )}
        {match.group && <span className={styles.group}>{match.group}</span>}
      </div>

      <div className={styles.teams}>
        <div className={`${styles.team} ${styles.teamHome}`}>
          <span className={styles.teamName}>{match.homeTeam.shortName}</span>
          <TeamFlag crest={match.homeTeam.crest} tla={match.homeTeam.tla} name={match.homeTeam.name} />
        </div>

        <div className={`${styles.scoreboard} ${scoreToneClass}`}>
          <span className={`${styles.score} numerals`}>{scoreContent}</span>
        </div>

        <div className={`${styles.team} ${styles.teamAway}`}>
          <TeamFlag crest={match.awayTeam.crest} tla={match.awayTeam.tla} name={match.awayTeam.name} />
          <span className={styles.teamName}>{match.awayTeam.shortName}</span>
        </div>
      </div>

      {isFinished && match.score.halfHome !== null && !compact && (
        <p className={styles.ht}>
          {t('matchCard.halfTime')}: <span className="numerals">{match.score.halfHome} – {match.score.halfAway}</span>
        </p>
      )}

      {/* Gold ticket-stub in the corner — visible whenever the user has a
          prediction AND we're not already showing it inside the scoreboard
          pill (i.e. live/finished where the real score takes the pill). */}
      {hasUserPrediction && (isFinished || isLive) && (
        <span className={styles.ticketStub} aria-label={t('matchCard.yourPick', { home: userPrediction.home, away: userPrediction.away })}>
          <span className={styles.ticketStubLabel}>PICK</span>
          <span className={`${styles.ticketStubScore} numerals`}>
            {userPrediction.home}–{userPrediction.away}
          </span>
        </span>
      )}

      {/* Tear-off action bar: report-toggle hint + bets button. Started
          matches only — the body click drives the report, bets gets a button. */}
      {isStarted && (onBets || showReport) && (
        <div className={styles.actions}>
          {showReport ? (
            <span className={styles.reportHint}>
              <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`} aria-hidden="true">▾</span>
              {t('matchCard.report')}
            </span>
          ) : <span />}
          {onBets && (
            <button
              type="button"
              className={styles.betsBtn}
              onClick={(e) => { e.stopPropagation(); onBets(match); }}
            >
              {t('matchCard.bets')}
            </button>
          )}
        </div>
      )}

      {showReport && (
        <div className={`${styles.reportWrap} ${expanded ? styles.reportOpen : ''}`}>
          <div className={styles.reportInner}>
            {events.length > 0 ? (
              <MatchReport events={events} match={match} t={t} />
            ) : (
              <p className={styles.reportEmpty}>{t('matchCard.noEvents')}</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
