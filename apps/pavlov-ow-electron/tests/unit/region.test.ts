import {
  expandRegionWithTolerance,
  normalizedToScreenPoint,
  regionContainsPoint
} from "../../src/shared/minimap/region";

describe("minimap region logic", () => {
  test("contains points inside baseline rectangle", () => {
    const region = { x: 100, y: 100, width: 200, height: 150 };
    expect(regionContainsPoint(region, 150, 120, 0)).toBe(true);
    expect(regionContainsPoint(region, 301, 120, 0)).toBe(false);
  });

  test("contains points with tolerance expansion", () => {
    const region = { x: 50, y: 50, width: 40, height: 40 };
    expect(regionContainsPoint(region, 45, 45, 6)).toBe(true);
    expect(regionContainsPoint(region, 42, 42, 6)).toBe(false);
  });

  test("expands region symmetrically", () => {
    const region = { x: 50, y: 50, width: 20, height: 30 };
    expect(expandRegionWithTolerance(region, 10)).toEqual({
      x: 40,
      y: 40,
      width: 40,
      height: 50
    });
  });

  test("converts normalized gaze to screen points", () => {
    expect(normalizedToScreenPoint(0.5, 0.5, 1920, 1080)).toEqual({
      x: 960,
      y: 540
    });
  });
});
