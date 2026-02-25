import { useAuth } from '../context/AuthContext';
import { REG_STATUS } from '../utils/constants';
import styles from './AdminPage.module.css';

export default function AdminPage() {
  const { users, updateUserStatus, isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <main className={styles.page}>
        <div className={styles.denied}>
          <h2>Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      </main>
    );
  }

  const pending = users.filter((u) => u.status === REG_STATUS.PENDING);
  const approved = users.filter((u) => u.status === REG_STATUS.APPROVED);
  const rejected = users.filter((u) => u.status === REG_STATUS.REJECTED);

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const UserRow = ({ u, showActions }) => (
    <tr>
      <td>{u.name}</td>
      <td>{u.email}</td>
      <td>{u.bet?.winningTeam ?? <span className={styles.na}>—</span>}</td>
      <td>{u.bet?.topScorer ?? <span className={styles.na}>—</span>}</td>
      <td>{formatDate(u.createdAt)}</td>
      {showActions && (
        <td className={styles.actions}>
          <button
            className={styles.approveBtn}
            onClick={() => updateUserStatus(u.id, REG_STATUS.APPROVED)}
          >
            Approve
          </button>
          <button
            className={styles.rejectBtn}
            onClick={() => updateUserStatus(u.id, REG_STATUS.REJECTED)}
          >
            Reject
          </button>
        </td>
      )}
      {!showActions && (
        <td>
          <span className={`${styles.statusBadge} ${u.status === REG_STATUS.APPROVED ? styles.approved : styles.rejected}`}>
            {u.status}
          </span>
        </td>
      )}
    </tr>
  );

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin Panel</h1>
        <p className={styles.sub}>Manage user registrations and approvals</p>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{pending.length}</span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{approved.length}</span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{rejected.length}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
      </div>

      {/* Pending approvals */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          ⏳ Pending Approvals
          {pending.length > 0 && <span className={styles.badge}>{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className={styles.empty}>No pending registrations.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Winner Bet</th>
                  <th>Scorer Bet</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((u) => <UserRow key={u.id} u={u} showActions />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Approved users */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>✅ Approved Users</h2>
        {approved.length === 0 ? (
          <p className={styles.empty}>No approved users.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Winner Bet</th>
                  <th>Scorer Bet</th>
                  <th>Registered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {approved.map((u) => <UserRow key={u.id} u={u} showActions={false} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Rejected users */}
      {rejected.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>❌ Rejected Users</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Winner Bet</th>
                  <th>Scorer Bet</th>
                  <th>Registered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.bet?.winningTeam ?? <span className={styles.na}>—</span>}</td>
                    <td>{u.bet?.topScorer ?? <span className={styles.na}>—</span>}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString('en-GB')}</td>
                    <td>
                      <button
                        className={styles.approveBtn}
                        onClick={() => updateUserStatus(u.id, REG_STATUS.APPROVED)}
                      >
                        Re-approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
