import ExactScoreSpotlight from './ExactScoreSpotlight';
import ChaosPickSpotlight from './ChaosPickSpotlight';
import styles from './SpotlightPair.module.css';

export default function SpotlightPair({ data, loading, currentUserId }) {
  const hasExact = loading || data?.exact?.primary;
  const hasChaos = loading || data?.chaos?.primary;

  if (!hasExact && !hasChaos) return null;

  return (
    <section className={styles.pair} aria-label="Daily spotlights">
      {hasExact && (
        <div className={styles.cardSlot}>
          <ExactScoreSpotlight
            data={data?.exact}
            loading={loading}
            currentUserId={currentUserId}
            compact
          />
        </div>
      )}
      {hasChaos && (
        <div className={styles.cardSlot}>
          <ChaosPickSpotlight
            data={data?.chaos}
            loading={loading}
            currentUserId={currentUserId}
            compact
          />
        </div>
      )}
    </section>
  );
}
