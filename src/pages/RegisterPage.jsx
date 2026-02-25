import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchTeams, fetchScorers, parseApiError } from '../services/footballService';
import styles from './AuthPage.module.css';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    winningTeam: '',
    topScorer: '',
  });

  const [teams, setTeams] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, s] = await Promise.all([fetchTeams(), fetchScorers()]);
        setTeams(t);
        setScorers(s);
      } catch (err) {
        // Non-blocking: user can still register without picking bets
        console.warn('Could not load teams/scorers for bet selection:', parseApiError(err));
      } finally {
        setLoadingOptions(false);
      }
    };
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    const result = register({
      name: form.name,
      email: form.email,
      password: form.password,
      winningTeam: form.winningTeam || null,
      topScorer: form.topScorer || null,
    });

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error);
    }
  };

  if (success) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.header}>
            <span className={styles.trophy}>⏳</span>
            <h1 className={styles.title}>Registration Sent!</h1>
            <p className={styles.subtitle}>
              Your account is pending admin approval. You&apos;ll be able to log in once approved.
              You can update your bets from your profile after logging in.
            </p>
          </div>
          <Link to="/login" className={styles.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.trophy}>🏆</span>
          <h1 className={styles.title}>Request Access</h1>
          <p className={styles.subtitle}>An admin will approve your account</p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="name">Display Name</label>
            <input id="name" name="name" value={form.name} onChange={handleChange}
              placeholder="Your name" required />
          </div>

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" name="email" value={form.email}
              onChange={handleChange} placeholder="you@example.com" required />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" name="password" value={form.password}
              onChange={handleChange} placeholder="Min. 6 characters" required />
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input id="confirmPassword" type="password" name="confirmPassword"
              value={form.confirmPassword} onChange={handleChange} placeholder="Repeat password" required />
          </div>

          <div className={styles.divider}>
            <span>Place Your Tournament Bets</span>
          </div>

          <div className={styles.field}>
            <label htmlFor="winningTeam">
              🏅 World Cup Winner {loadingOptions && <small>(loading…)</small>}
            </label>
            <select id="winningTeam" name="winningTeam" value={form.winningTeam} onChange={handleChange}>
              <option value="">— Pick a team —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="topScorer">
              ⚽ Top Scorer {loadingOptions && <small>(loading…)</small>}
            </label>
            <select id="topScorer" name="topScorer" value={form.topScorer} onChange={handleChange}>
              <option value="">— Pick a player —</option>
              {scorers.map((s) => (
                <option key={s.id} value={s.name}>{s.name} ({s.team})</option>
              ))}
              {scorers.length === 0 && !loadingOptions && (
                <option disabled>Player list unavailable — update from profile later</option>
              )}
            </select>
          </div>

          <p className={styles.betNote}>
            You can change these bets from your profile until the tournament starts.
          </p>

          <button type="submit" className={styles.submitBtn}>
            Submit Registration
          </button>
        </form>

        <p className={styles.switchLink}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
