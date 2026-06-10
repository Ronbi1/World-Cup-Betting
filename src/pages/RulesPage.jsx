import { useTranslation } from 'react-i18next';
import styles from './RulesPage.module.css';

export default function RulesPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>🎲 {t('rules.pageTitle')}</h1>
        <p className={styles.sub}>{t('rules.pageSubtitle')}</p>
      </div>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>📜 {t('home.howItWorks')}</h2>
        <p className={styles.intro}>{t('home.rules.intro')}</p>

        <ul className={styles.rulesList}>
          <li>
            <span className={styles.icon} aria-hidden="true">🎯</span>
            <span>{t('home.rules.exactScore')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">🔥</span>
            <span>{t('home.rules.exactScoreHigh')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">✅</span>
            <span>{t('home.rules.correctResult')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">🏆</span>
            <span>{t('home.rules.tournamentWinner')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">⚽</span>
            <span>{t('home.rules.topScorer')}</span>
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">🎯</span>
            <span>{t('home.rules.topAssist')}</span>
          </li>
        </ul>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>ℹ️ {t('rules.howScoringWorksTitle')}</h2>
        <p className={styles.body}>{t('rules.howScoringWorksBody')}</p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>👁️ {t('rules.privacyTitle')}</h2>
        <p className={styles.body}>{t('rules.privacyBody')}</p>
      </section>
    </main>
  );
}
