import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.trophy}>🏆</span>
        <span className={styles.brandText}>WC 2026</span>
      </div>

      <ul className={styles.links}>
        <li>
          <NavLink to="/" end className={({ isActive }) => isActive ? styles.active : ''}>
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/games" className={({ isActive }) => isActive ? styles.active : ''}>
            All Games
          </NavLink>
        </li>
        <li>
          <NavLink to="/scorers" className={({ isActive }) => isActive ? styles.active : ''}>
            Golden Boot
          </NavLink>
        </li>
        <li>
          <NavLink to="/profile" className={({ isActive }) => isActive ? styles.active : ''}>
            My Profile
          </NavLink>
        </li>
        {isAdmin && (
          <li>
            <NavLink to="/admin" className={({ isActive }) => isActive ? styles.active : ''}>
              Admin
            </NavLink>
          </li>
        )}
      </ul>

      <div className={styles.userArea}>
        <span className={styles.username}>{user?.name}</span>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          Logout
        </button>
      </div>
    </nav>
  );
}
