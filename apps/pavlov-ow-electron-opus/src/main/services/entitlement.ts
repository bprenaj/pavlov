import type { EntitlementTier } from '../../shared/constants';

/**
 * Mock entitlement service (free / trial / paid) with pluggable persistence.
 * The main process wires it to the electron-store settings file so the tier
 * survives restarts; tests run against the in-memory default.
 * Replace the storage adapter with a real subscription provider later while
 * keeping this interface.
 */

export interface EntitlementStorage {
  get(): EntitlementTier | null;
  set(tier: EntitlementTier): void;
}

const VALID_TIERS: EntitlementTier[] = ['free', 'trial', 'paid'];

let storage: EntitlementStorage | null = null;
let currentTier: EntitlementTier = 'free';

export function initEntitlement(persistence: EntitlementStorage): void {
  storage = persistence;
  const saved = storage.get();
  if (saved && VALID_TIERS.includes(saved)) {
    currentTier = saved;
  }
}

export function getEntitlement(): EntitlementTier {
  return currentTier;
}

export function setEntitlement(tier: EntitlementTier): EntitlementTier {
  if (!VALID_TIERS.includes(tier)) return currentTier;
  currentTier = tier;
  storage?.set(tier);
  return currentTier;
}

export function isPaid(): boolean {
  return currentTier === 'paid' || currentTier === 'trial';
}
