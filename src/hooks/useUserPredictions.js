import { useAuth } from '../context/useAuth';

/**
 * Thin wrapper around AuthContext predictions — loaded once after auth is
 * confirmed and shared across HomePage, AllGamesPage, and BetModal saves.
 */
export function useUserPredictions() {
  const {
    predictions,
    loadingPredictions,
    upsertPrediction,
    refreshPredictions,
  } = useAuth();

  return {
    predictions,
    loading: loadingPredictions,
    upsertPrediction,
    refresh: refreshPredictions,
  };
}
