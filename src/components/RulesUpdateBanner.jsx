import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { STORAGE_KEYS } from '../utils/constants';
import styles from './RulesUpdateBanner.module.css';

// Read once on mount. Wrapped because some browsers (private mode, embedded
// webviews) throw when localStorage is accessed — same defensive pattern as
// loadRankSnapshot in HomePage.jsx.
function readAck() {
  try {
    return localStorage.getItem(STORAGE_KEYS.RULES_V2_ACK) === '1';
  } catch {
    return false;
  }
}

function writeAck() {
  try {
    localStorage.setItem(STORAGE_KEYS.RULES_V2_ACK, '1');
  } catch {
    /* localStorage unavailable — banner stays gone for this session at least */
  }
}

export default function RulesUpdateBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(readAck);

  const acknowledge = useCallback(() => {
    writeAck();
    setDismissed(true);
  }, []);

  if (dismissed) return null;

  return (
    <aside
      className={styles.banner}
      role="status"
      aria-live="polite"
      aria-label={t('rulesBanner.eyebrow')}
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.stripe} aria-hidden="true" />

      <div className={styles.header}>
        <span className={styles.eyebrow}>
          <span className={styles.dot} aria-hidden="true" />
          {t('rulesBanner.eyebrow')}
        </span>
        <h2 className={styles.headline}>{t('rulesBanner.headline')}</h2>
      </div>

      <ul className={styles.pills}>
        <li className={`${styles.pill} ${styles.pillGold}`}>
          <span className={styles.pillLabel}>{t('rulesBanner.progressive.label')}</span>
          <span className={styles.pillBody}>{t('rulesBanner.progressive.body')}</span>
        </li>
        <li className={`${styles.pill} ${styles.pillAmber}`}>
          <span className={styles.pillLabel}>{t('rulesBanner.regulation.label')}</span>
          <span className={styles.pillBody}>{t('rulesBanner.regulation.body')}</span>
        </li>
        <li className={`${styles.pill} ${styles.pillGreen}`}>
          <span className={styles.pillLabel}>{t('rulesBanner.groupSafe.label')}</span>
          <span className={styles.pillBody}>{t('rulesBanner.groupSafe.body')}</span>
        </li>
      </ul>

      <div className={styles.actions}>
        <Link to="/rules#changes" className={styles.ctaPrimary} onClick={acknowledge}>
          {t('rulesBanner.cta')}
          <span className={styles.ctaArrow} aria-hidden="true">→</span>
        </Link>
        <button
          type="button"
          className={styles.ctaGhost}
          onClick={acknowledge}
          aria-label={t('rulesBanner.dismiss')}
        >
          {t('rulesBanner.dismiss')}
        </button>
      </div>
    </aside>
  );
}
