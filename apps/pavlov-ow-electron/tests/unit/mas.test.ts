import { computeMas } from "../../src/shared/metrics/mas";

describe("MAS scoring", () => {
  test("returns high score for pro-like metrics", () => {
    const score = computeMas({
      glancesPerMin: 8,
      averageGapSeconds: 2.2,
      averageGlanceDurationMs: 240,
      gapStdDevSeconds: 0.9
    });
    expect(score).toBeGreaterThan(80);
  });

  test("returns low score for weak awareness", () => {
    const score = computeMas({
      glancesPerMin: 1.2,
      averageGapSeconds: 12,
      averageGlanceDurationMs: 1400,
      gapStdDevSeconds: 8
    });
    expect(score).toBeLessThan(25);
  });

  test("clamps values to 0-100", () => {
    const score = computeMas({
      glancesPerMin: 999,
      averageGapSeconds: -10,
      averageGlanceDurationMs: -100,
      gapStdDevSeconds: -10
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
