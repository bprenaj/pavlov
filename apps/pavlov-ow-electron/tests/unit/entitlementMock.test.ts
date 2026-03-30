import { EntitlementMockService } from "../../src/main/services/entitlementMock";

describe("EntitlementMockService", () => {
  test("free tier cannot use paid mode", () => {
    const service = new EntitlementMockService("free");
    expect(service.canUsePaidMode()).toBe(false);
  });

  test("trial and paid tiers unlock paid mode", () => {
    const service = new EntitlementMockService("free");
    service.setTier("trial");
    expect(service.canUsePaidMode()).toBe(true);
    service.setTier("paid");
    expect(service.canUsePaidMode()).toBe(true);
  });
});
