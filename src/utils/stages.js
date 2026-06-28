import { MATCH_STATUS, STAGE_ORDER } from './constants';

// "Current" tournament stage = the first stage in STAGE_ORDER that still has
// any non-FINISHED match. Walks the bracket from earliest to latest so the
// app naturally advances to R16 the moment all R32 matches finish, and so on
// to QF / SF / 3rd / FINAL.
//
//   - GROUP_STAGE all FINISHED, R32 still has SCHEDULED → returns ROUND_OF_32
//   - R32 all FINISHED, R16 has SCHEDULED              → returns ROUND_OF_16
//   - whole tournament FINISHED                        → returns the latest stage with data
//   - no matches loaded yet                            → returns null (caller decides default)
export function detectCurrentStage(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  for (const stage of STAGE_ORDER) {
    const inStage = matches.filter((m) => (m.stage || 'GROUP_STAGE') === stage);
    if (inStage.length === 0) continue;
    if (inStage.some((m) => m.status !== MATCH_STATUS.FINISHED)) {
      return stage;
    }
  }

  for (let i = STAGE_ORDER.length - 1; i >= 0; i -= 1) {
    if (matches.some((m) => (m.stage || 'GROUP_STAGE') === STAGE_ORDER[i])) {
      return STAGE_ORDER[i];
    }
  }
  return 'GROUP_STAGE';
}
