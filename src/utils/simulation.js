// SIMULATION ONLY — frontend feature flag. Must be exactly "true" to activate.
// Remove this file when deleting simulation mode.

export const isSimulationMode = import.meta.env.VITE_SIMULATION_MODE === 'true';
