import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import LanguageSwitcher from './LanguageSwitcher';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.trophy} aria-hidden="true">🏆</span>
        <span className={styles.brandText}>WC 2026</span>
      </div>

      <button
        type="button"
        className={styles.menuToggle}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>

      <div className={`${styles.menuPanel} ${menuOpen ? styles.menuOpen : ''}`}>
        <ul className={styles.links}>
          <li>
            <NavLink to="/" end onClick={closeMenu} className={({ isActive }) => isActive ? styles.active : ''}>
              {t('nav.home')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/games" onClick={closeMenu} className={({ isActive }) => isActive ? styles.active : ''}>
              {t('nav.games')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/scorers" onClick={closeMenu} className={({ isActive }) => isActive ? styles.active : ''}>
              {t('nav.scorers')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/rules" onClick={closeMenu} className={({ isActive }) => isActive ? styles.active : ''}>
              {t('nav.rules')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/profile" onClick={closeMenu} className={({ isActive }) => isActive ? styles.active : ''}>
              {t('nav.profile')}
            </NavLink>
          </li>
          {isAdmin && (
            <li>
              <NavLink to="/admin" onClick={closeMenu} className={({ isActive }) => isActive ? styles.active : ''}>
                {t('nav.admin')}
              </NavLink>
            </li>
          )}
        </ul>

        <div className={styles.userArea}>
          <LanguageSwitcher compact />
          <span className={styles.username} title={user?.email}>{user?.name}</span>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </nav>
  );
}
