/**
 * Shared football API configuration.
 * Single source of truth — consumed by football.routes.js and scores.routes.js.
 * If the API version ever changes (v4 → v5), update it here only.
 */

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';
const COMPETITION_CODE  = 'WC';

module.exports = { FOOTBALL_API_BASE, COMPETITION_CODE };
