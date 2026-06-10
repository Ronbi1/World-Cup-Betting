// SIMULATION ONLY — feature flag + accessors for mock tournament data.
// Remove this file (and api/mock/) when deleting simulation mode.
//
// Reads VITE_SIMULATION_MODE so one env var controls both Vite (frontend)
// and dev-server / Vercel API (backend). Must be exactly "true" to activate.

const {
  getSimulationMatches,
  getSimulationTeams,
  getSimulationUsers,
  getSimulationPredictions,
  getSimulationFinishedMatches,
  getSimulationTodayMatches,
  getSimulationPredictionsForUser,
  getSimulationPredictionsForMatchIds,
  SIMULATION_VIEWER_USER_ID,
} = require('../mock/worldCupSimulation');

function isSimulationMode() {
  return process.env.VITE_SIMULATION_MODE === 'true';
}

module.exports = {
  isSimulationMode,
  getSimulationMatches,
  getSimulationTeams,
  getSimulationUsers,
  getSimulationPredictions,
  getSimulationFinishedMatches,
  getSimulationTodayMatches,
  getSimulationPredictionsForUser,
  getSimulationPredictionsForMatchIds,
  SIMULATION_VIEWER_USER_ID,
};
