// SIMULATION ONLY — visible warning banner. Remove when deleting simulation mode.
import { isSimulationMode } from '../utils/simulation';
import styles from './SimulationBanner.module.css';

export default function SimulationBanner() {
  if (!isSimulationMode) return null;

  return (
    <div className={styles.simulationBanner} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden="true">⚠️</span>
      <span className={styles.text}>
        SIMULATION / DEMO MODE — All match data, predictions, and scores are fake.
        <span className={styles.subtext}> Remove VITE_SIMULATION_MODE to use real data.</span>
      </span>
    </div>
  );
}
