import type { EntitlementTier } from '../../shared/constants';

let currentTier: EntitlementTier = 'free';

export function getEntitlement(): EntitlementTier {
  return currentTier;
}

export function setEntitlement(tier: EntitlementTier): EntitlementTier {
  currentTier = tier;
  return currentTier;
}

export function isPaid(): boolean {
  return currentTier === 'paid' || currentTier === 'trial';
}
