import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import styles from './AuthPage.module.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (form.password.length < 6) return t('auth.register.passwordTooShort');
    if (form.password !== form.confirmPassword) return t('auth.register.passwordMismatch');
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    const result = await register({
      name: form.name,
      email: form.email,
      password: form.password,
    });
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } else {
      setError(result.error);
    }
  };

  if (success) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.langCorner}><LanguageSwitcher /></div>
        <div className={styles.card}>
          <div className={styles.header}>
            <span className={styles.trophy} aria-hidden="true">⏳</span>
            <h1 className={styles.title}>{t('auth.register.successTitle')}</h1>
            <p className={styles.subtitle}>{t('auth.register.successBody')}</p>
          </div>
          <Link to="/login" className={styles.submitBtn}
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            {t('auth.register.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.langCorner}><LanguageSwitcher /></div>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.trophy} aria-hidden="true">🏆</span>
          <h1 className={styles.title}>{t('auth.register.title')}</h1>
          <p className={styles.subtitle}>{t('auth.register.subtitle')}</p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="name">{t('auth.register.nameLabel')}</label>
            <input id="name" name="name" value={form.name} onChange={handleChange}
              placeholder={t('auth.register.namePlaceholder')} required autoFocus autoComplete="name" />
          </div>

          <div className={styles.field}>
            <label htmlFor="email">{t('auth.register.emailLabel')}</label>
            <input id="email" type="email" name="email" value={form.email}
              onChange={handleChange} placeholder={t('auth.register.emailPlaceholder')} required autoComplete="email" />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">{t('auth.register.passwordLabel')}</label>
            <input id="password" type="password" name="password" value={form.password}
              onChange={handleChange} placeholder={t('auth.register.passwordPlaceholder')} required autoComplete="new-password" />
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">{t('auth.register.confirmPasswordLabel')}</label>
            <input id="confirmPassword" type="password" name="confirmPassword"
              value={form.confirmPassword} onChange={handleChange}
              placeholder={t('auth.register.confirmPasswordPlaceholder')} required autoComplete="new-password" />
          </div>

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? t('auth.register.submitting') : t('auth.register.submit')}
          </button>
        </form>

        <p className={styles.switchLink}>
          {t('auth.register.haveAccount')} <Link to="/login">{t('auth.register.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
