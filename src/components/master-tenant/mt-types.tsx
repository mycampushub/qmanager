// =============================================================================
// DEPRECATED: This file has been split into:
//   - mt-types.ts   (type definitions)
//   - mt-utils.ts   (mtHeaders helper)
//   - PlanTierBadge.tsx (React component)
//
// This re-export file is kept for backward compatibility.
// New code should import from the specific files above.
// =============================================================================

export type { BranchData, StaffRow, MTTab, PlanTier } from './mt-types';
export { mtHeaders } from './mt-utils';
export { PlanTierBadge } from './PlanTierBadge';