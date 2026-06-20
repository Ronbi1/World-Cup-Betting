import { useTranslation } from 'react-i18next';
import { useLiveEvents } from '../context/useLiveEvents';
import styles from './LiveEventTicker.module.css';

// Header strip of live-event toasts (goals + cards). Sits directly under the
// navbar and lingers for 2 min per event (TTL lives in LiveEventsProvider).
// Newest on top. Also offers a one-tap bell to enable OS notifications.
export default function LiveEventTicker() {
  const { t } = useTranslation();
  const { toasts, dismissToast, permission, requestNotifications } = useLiveEvents();

  const showBell = permission === 'default' && toasts.length > 0;
  if (toasts.length === 0) return null;

  return (
    <div className={styles.ticker} role="status" aria-live="polite">
      {showBell && (
        <button
          type="button"
          className={styles.bell}
          onClick={requestNotifications}
          title={t('liveToast.enableNotifications')}
          aria-label={t('liveToast.enableNotifications')}
        >
          🔔
        </button>
      )}
      {[...toasts].reverse().map((tt) => (
        <div key={tt.id} className={`${styles.toast} ${styles[tt.kind] || ''}`} dir="ltr">
          <span className={styles.title}>{tt.title}</span>
          <span className={styles.msg}>{tt.message}</span>
          <button
            type="button"
            className={styles.close}
            onClick={() => dismissToast(tt.id)}
            aria-label={t('common.dismiss', 'Dismiss')}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
