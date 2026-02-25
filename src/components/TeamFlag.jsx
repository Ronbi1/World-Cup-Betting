import styles from './TeamFlag.module.css';

/**
 * Renders a team's crest (flag/logo) with a fallback to a coloured abbreviation badge.
 */
export default function TeamFlag({ crest, tla, name, size = 32 }) {
  if (crest) {
    return (
      <img
        src={crest}
        alt={name}
        title={name}
        width={size}
        height={size}
        className={styles.flag}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <span className={styles.badge} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {tla ?? '?'}
    </span>
  );
}
