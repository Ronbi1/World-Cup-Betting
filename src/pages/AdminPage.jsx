import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { REG_STATUS } from '../utils/constants';
import styles from './AdminPage.module.css';

function DeleteModal({ user, onConfirm, onCancel, loading }) {
  const { t } = useTranslation();
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{t('admin.delete.title')}</h3>
        <p className={styles.modalBody}>
          {t('admin.delete.body', { name: user.name, email: user.email })}
          <br />
          <span className={styles.modalWarn}>{t('admin.delete.warning')}</span>
        </p>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={loading}>
            {t('admin.delete.cancel')}
          </button>
          <button className={styles.deleteConfirmBtn} onClick={onConfirm} disabled={loading}>
            {loading ? t('admin.delete.deleting') : t('admin.delete.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { users, updateUserStatus, deleteUser, isAdmin } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  const [confirmUser, setConfirmUser] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (!isAdmin) {
    return (
      <main className={styles.page}>
        <div className={styles.denied}>
          <h2>{t('admin.denied')}</h2>
          <p>{t('admin.deniedBody')}</p>
        </div>
      </main>
    );
  }

  const pending = users.filter((u) => u.status === REG_STATUS.PENDING);
  const approved = users.filter((u) => u.status === REG_STATUS.APPROVED);
  const rejected = users.filter((u) => u.status === REG_STATUS.REJECTED);

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  const handleDeleteConfirm = async () => {
    if (!confirmUser) return;
    setDeleting(true);
    setDeleteError('');
    const result = await deleteUser(confirmUser.id);
    setDeleting(false);
    if (result.success) setConfirmUser(null);
    else setDeleteError(result.error);
  };

  // Shared row component (closure captures `t` and helpers)
  const UserRow = ({ u, showActions, isRejected = false }) => (
    <tr>
      <td>{u.name}</td>
      <td>{u.email}</td>
      <td>{u.bet?.winningTeam ?? <span className={styles.na}>—</span>}</td>
      <td>{u.bet?.topScorer ?? <span className={styles.na}>—</span>}</td>
      <td>{u.bet?.topAssist ?? <span className={styles.na}>—</span>}</td>
      <td>{formatDate(u.createdAt)}</td>
      <td className={styles.actions}>
        {showActions && (
          <>
            <button
              className={styles.approveBtn}
              onClick={() => updateUserStatus(u.id, REG_STATUS.APPROVED)}
            >
              {isRejected ? t('admin.actions.reapprove') : t('admin.actions.approve')}
            </button>
            {!isRejected && (
              <button
                className={styles.rejectBtn}
                onClick={() => updateUserStatus(u.id, REG_STATUS.REJECTED)}
              >
                {t('admin.actions.reject')}
              </button>
            )}
          </>
        )}
        {!showActions && !isRejected && (
          <span className={`${styles.statusBadge} ${u.status === REG_STATUS.APPROVED ? styles.approved : styles.rejected}`}>
            {u.status}
          </span>
        )}
        <button
          className={styles.deleteBtn}
          onClick={() => { setDeleteError(''); setConfirmUser(u); }}
          title={t('admin.actions.delete')}
          aria-label={t('admin.actions.delete')}
        >
          🗑
        </button>
      </td>
    </tr>
  );

  const tableHead = (
    <tr>
      <th>{t('admin.table.name')}</th>
      <th>{t('admin.table.email')}</th>
      <th>{t('admin.table.winnerBet')}</th>
      <th>{t('admin.table.topScorer')}</th>
      <th>{t('admin.table.topAssist')}</th>
      <th>{t('admin.table.registered')}</th>
      <th>{t('admin.table.actions')}</th>
    </tr>
  );

  return (
    <main className={styles.page}>
      {confirmUser && (
        <DeleteModal
          user={confirmUser}
          onConfirm={handleDeleteConfirm}
          onCancel={() => !deleting && setConfirmUser(null)}
          loading={deleting}
        />
      )}
      {deleteError && <p className={styles.deleteError}>{deleteError}</p>}

      <div className={styles.header}>
        <h1 className={styles.title}>{t('admin.title')}</h1>
        <p className={styles.sub}>{t('admin.subtitle')}</p>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{pending.length}</span>
          <span className={styles.statLabel}>{t('admin.stats.pending')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{approved.length}</span>
          <span className={styles.statLabel}>{t('admin.stats.approved')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{rejected.length}</span>
          <span className={styles.statLabel}>{t('admin.stats.rejected')}</span>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          ⏳ {t('admin.section.pending')}
          {pending.length > 0 && <span className={styles.badge}>{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className={styles.empty}>{t('admin.empty.pending')}</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>{tableHead}</thead>
              <tbody>
                {pending.map((u) => <UserRow key={u.id} u={u} showActions />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>✅ {t('admin.section.approved')}</h2>
        {approved.length === 0 ? (
          <p className={styles.empty}>{t('admin.empty.approved')}</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>{tableHead}</thead>
              <tbody>
                {approved.map((u) => <UserRow key={u.id} u={u} showActions={false} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {rejected.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>❌ {t('admin.section.rejected')}</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>{tableHead}</thead>
              <tbody>
                {rejected.map((u) => <UserRow key={u.id} u={u} showActions isRejected />)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
