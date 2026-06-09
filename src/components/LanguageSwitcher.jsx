import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitcher.module.css';

export default function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language || 'en';

  const handleChange = (lng) => {
    if (lng !== current) i18n.changeLanguage(lng);
  };

  return (
    <div
      className={`${styles.switch} ${compact ? styles.compact : ''}`}
      role="group"
      aria-label={t('lang.switch')}
    >
      <button
        type="button"
        onClick={() => handleChange('en')}
        className={`${styles.btn} ${current === 'en' ? styles.active : ''}`}
        aria-pressed={current === 'en'}
        title={t('lang.english')}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => handleChange('he')}
        className={`${styles.btn} ${current === 'he' ? styles.active : ''}`}
        aria-pressed={current === 'he'}
        title={t('lang.hebrew')}
      >
        עב
      </button>
    </div>
  );
}
