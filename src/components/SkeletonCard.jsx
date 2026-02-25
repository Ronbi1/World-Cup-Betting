import styles from './SkeletonCard.module.css';

export default function SkeletonCard({ compact = false }) {
  return (
    <div className={`${styles.skeleton} ${compact ? styles.compact : ''}`}>
      <div className={styles.meta}>
        <div className={`${styles.shimmer} ${styles.badge}`} />
        <div className={`${styles.shimmer} ${styles.dateBar}`} />
      </div>
      <div className={styles.row}>
        <div className={styles.teamBlock}>
          <div className={`${styles.shimmer} ${styles.flag}`} />
          <div className={`${styles.shimmer} ${styles.name}`} />
        </div>
        <div className={`${styles.shimmer} ${styles.score}`} />
        <div className={`${styles.shimmer} ${styles.teamBlockR}`}>
          <div className={`${styles.shimmer} ${styles.name}`} />
          <div className={`${styles.shimmer} ${styles.flag}`} />
        </div>
      </div>
    </div>
  );
}
