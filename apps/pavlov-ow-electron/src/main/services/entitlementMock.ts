import type { EntitlementTier } from "../../shared/models/types";

export class EntitlementMockService {
  private tier: EntitlementTier;

  constructor(initialTier: EntitlementTier) {
    this.tier = initialTier;
  }

  getTier(): EntitlementTier {
    return this.tier;
  }

  setTier(nextTier: EntitlementTier): EntitlementTier {
    this.tier = nextTier;
    return this.tier;
  }

  canUsePaidMode(): boolean {
    return this.tier === "paid" || this.tier === "trial";
  }
}
