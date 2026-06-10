import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import LanguageSwitcher from '../components/LanguageSwitcher';
import styles from './AuthPage.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '', rememberMe: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ?reason=expired comes from the axios 401 interceptor in serverApi.js
  const sessionExpired = searchParams.get('reason') === 'expired';

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(form.email, form.password, form.rememberMe);
    setLoading(false);
    if (result.success) navigate('/');
    else setError(result.error);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.langCorner}>
        <LanguageSwitcher />
      </div>

      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.trophy} aria-hidden="true">🏆</span>
          <h1 className={styles.title}>{t('auth.login.title')}</h1>
          <p className={styles.subtitle}>{t('auth.login.subtitle')}</p>
        </div>

        {sessionExpired && (
          <div className={styles.warningBanner}>
            {t('auth.login.sessionExpired')}
          </div>
        )}
        {error && <div className={styles.errorBanner}>{typeof error === 'string' ? error : String(error)}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email">{t('auth.login.emailLabel')}</label>
            <input
              id="email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder={t('auth.login.emailPlaceholder')}
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">{t('auth.login.passwordLabel')}</label>
            <input
              id="password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder={t('auth.login.passwordPlaceholder')}
              required
              autoComplete="current-password"
            />
          </div>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              name="rememberMe"
              checked={form.rememberMe}
              onChange={handleChange}
            />
            {t('auth.login.rememberMe')}
          </label>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>

        <p className={styles.switchLink}>
          {t('auth.login.noAccount')}{' '}
          <Link to="/register">{t('auth.login.requestAccess')}</Link>
        </p>
      </div>
    </div>
  );
}
