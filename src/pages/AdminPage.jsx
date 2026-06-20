import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { useLiveEvents } from '../context/useLiveEvents';
import { REG_STATUS, ROLES } from '../utils/constants';
import AdminOverrideModal from '../components/AdminOverrideModal';
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
  const { users, updateUserStatus, updateUserRole, deleteUser, isAdmin, fetchAuditLog } = useAuth();
  const { sendTestEvent, permission, requestNotifications } = useLiveEvents();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB';

  const [testText, setTestText] = useState('');
  const [confirmUser, setConfirmUser] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [auditError, setAuditError] = useState('');
  const [roleError, setRoleError] = useState('');

  // Count APPROVED admins so we can disable the demote button on the only
  // remaining admin. Server still enforces — this is defense-in-depth UX.
  const approvedAdminCount = useMemo(
    () => (users ?? []).filter((u) => u.role === ROLES.ADMIN && u.status === REG_STATUS.APPROVED).length,
    [users],
  );

  const loadAudit = useCallback(async () => {
    const result = await fetchAuditLog();
    if (result.success) {
      setAuditRows(result.data || []);
      setAuditError('');
    } else {
      setAuditError(result.error || t('admin.audit.loadError'));
    }
  }, [fetchAuditLog, t]);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAudit();
  }, [isAdmin, loadAudit]);

  // Refetch the audit log whenever the override modal closes (a save inside
  // the modal would have just appended a new row).
  useEffect(() => {
    if (!isAdmin || overrideOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAudit();
  }, [overrideOpen, isAdmin, loadAudit]);

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

  // Promote/demote handler with confirm + last-admin frontend guard. The
  // server is still the source of truth; this disable + confirm flow just
  // prevents accidental clicks.
  const handleRoleToggle = async (u) => {
    setRoleError('');
    const targetRole = u.role === ROLES.ADMIN ? ROLES.USER : ROLES.ADMIN;
    const isDemote = targetRole === ROLES.USER;
    const promptKey = isDemote ? 'admin.role.demoteConfirm' : 'admin.role.promoteConfirm';
    if (!window.confirm(t(promptKey, { name: u.name }))) return;
    const result = await updateUserRole(u.id, targetRole);
    if (!result.success) setRoleError(result.error || '');
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
          <>
            <span className={`${styles.statusBadge} ${u.status === REG_STATUS.APPROVED ? styles.approved : styles.rejected}`}>
              {u.role === ROLES.ADMIN ? 'ADMIN' : u.status}
            </span>
            {/* Role toggle is offered only on APPROVED rows. Promotion always
                allowed; demotion is locally guarded against the last-admin
                case (server enforces, but disabling avoids a wasted POST). */}
            {u.status === REG_STATUS.APPROVED && (
              <button
                className={styles.roleBtn}
                onClick={() => handleRoleToggle(u)}
                disabled={u.role === ROLES.ADMIN && approvedAdminCount <= 1}
                title={
                  u.role === ROLES.ADMIN && approvedAdminCount <= 1
                    ? t('admin.role.lastAdmin')
                    : undefined
                }
              >
                {u.role === ROLES.ADMIN ? t('admin.role.demote') : t('admin.role.promote')}
              </button>
            )}
          </>
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
      {roleError && <p className={styles.deleteError}>{roleError}</p>}

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

      {/* Notification test bench — pushes free text through the same path real
          goal/card events take (header toast + browser notification). Local to
          this browser only; it does not broadcast to other users. */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>🔔 {t('admin.notifyTest.sectionTitle')}</h2>
        <p className={styles.empty}>{t('admin.notifyTest.sectionHint')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <input
            type="text"
            className={styles.input}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { sendTestEvent(testText); setTestText(''); } }}
            placeholder={t('admin.notifyTest.placeholder')}
            style={{ flex: '1 1 240px', minWidth: 0 }}
          />
          <button
            className={styles.approveBtn}
            onClick={() => { sendTestEvent(testText); setTestText(''); }}
          >
            {t('admin.notifyTest.send')}
          </button>
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button className={styles.roleBtn} onClick={requestNotifications}>
              {t('admin.notifyTest.enable')}
            </button>
          )}
        </div>
        <p className={styles.empty} style={{ marginTop: '0.5rem' }}>
          {t('admin.notifyTest.permission', {
            state: t(`admin.notifyTest.perm.${permission}`, permission),
          })}
        </p>
      </section>

      {/* Admin override entry point. Single source of truth for the override
          flow — kept off the regular MatchCard / BetModal path so the normal
          user-bet UX stays unchanged. */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>🛠 {t('admin.override.sectionTitle')}</h2>
        <p className={styles.empty}>{t('admin.override.sectionHint')}</p>
        <button
          className={styles.approveBtn}
          onClick={() => setOverrideOpen(true)}
          style={{ marginTop: '0.75rem' }}
        >
          {t('admin.override.openButton')}
        </button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>📜 {t('admin.audit.sectionTitle')}</h2>
        {auditError && <p className={styles.deleteError}>{auditError}</p>}
        {!auditError && auditRows.length === 0 ? (
          <p className={styles.empty}>{t('admin.audit.empty')}</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('admin.audit.table.admin')}</th>
                  <th>{t('admin.audit.table.target')}</th>
                  <th>{t('admin.audit.table.match')}</th>
                  <th>{t('admin.audit.table.change')}</th>
                  <th>{t('admin.audit.table.reason')}</th>
                  <th>{t('admin.audit.table.when')}</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => {
                  const before = row.old_home === null || row.old_away === null
                    ? t('admin.audit.noPrior')
                    : `${row.old_home}-${row.old_away}`;
                  const after = `${row.new_home}-${row.new_away}`;
                  return (
                    <tr key={row.id}>
                      <td>{row.admin_name}</td>
                      <td>{row.target_user_name}</td>
                      <td>{t('admin.audit.matchUnknown', { id: row.match_id })}</td>
                      <td>{before} → {after}</td>
                      <td>{row.reason || t('admin.audit.noReason')}</td>
                      <td>{new Date(row.created_at).toLocaleString(locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminOverrideModal
        opened={overrideOpen}
        onClose={() => setOverrideOpen(false)}
      />
    </main>
  );
}
