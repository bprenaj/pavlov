import { describe, it, expect } from 'vitest';
import {
  withTolerance,
  regionContainsPoint,
  gazeInRegion,
  ratiosToRect,
  rectToRatios,
} from '../../src/shared/region';

const RECT = { x: 100, y: 200, width: 50, height: 50 };

describe('withTolerance', () => {
  it('expands rect by tolerance in all directions', () => {
    const expanded = withTolerance(RECT, 10);
    expect(expanded).toEqual({ x: 90, y: 190, width: 70, height: 70 });
  });

  it('clamps x/y to 0 when tolerance exceeds origin', () => {
    const small = { x: 5, y: 3, width: 20, height: 20 };
    const expanded = withTolerance(small, 10);
    expect(expanded.x).toBe(0);
    expect(expanded.y).toBe(0);
    expect(expanded.width).toBe(40);
  });

  it('returns same rect for zero tolerance', () => {
    expect(withTolerance(RECT, 0)).toEqual(RECT);
  });
});

describe('regionContainsPoint', () => {
  it('returns true for point inside', () => {
    expect(regionContainsPoint(RECT, 120, 220)).toBe(true);
  });

  it('returns true for point on edge', () => {
    expect(regionContainsPoint(RECT, 100, 200)).toBe(true);
    expect(regionContainsPoint(RECT, 150, 250)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(regionContainsPoint(RECT, 99, 200)).toBe(false);
    expect(regionContainsPoint(RECT, 151, 200)).toBe(false);
    expect(regionContainsPoint(RECT, 120, 199)).toBe(false);
    expect(regionContainsPoint(RECT, 120, 251)).toBe(false);
  });
});

describe('gazeInRegion', () => {
  it('detects gaze inside region with tolerance', () => {
    expect(gazeInRegion(RECT, 10, 95, 195)).toBe(true);
  });

  it('rejects gaze outside tolerance', () => {
    expect(gazeInRegion(RECT, 10, 80, 180)).toBe(false);
  });
});

describe('ratiosToRect', () => {
  it('converts ratios to pixel rect', () => {
    const rect = ratiosToRect(0.5, 0.5, 0.25, 0.25, 1920, 1080);
    expect(rect).toEqual({ x: 960, y: 540, width: 480, height: 270 });
  });
});

describe('rectToRatios', () => {
  it('converts pixel rect to ratios', () => {
    const ratios = rectToRatios({ x: 960, y: 540, width: 480, height: 270 }, 1920, 1080);
    expect(ratios.ratioX).toBe(0.5);
    expect(ratios.ratioY).toBe(0.5);
    expect(ratios.ratioW).toBe(0.25);
    expect(ratios.ratioH).toBe(0.25);
  });

  it('round-trips with ratiosToRect', () => {
    const rect = ratiosToRect(0.8, 0.7, 0.15, 0.2, 1920, 1080);
    const ratios = rectToRatios(rect, 1920, 1080);
    expect(ratios.ratioX).toBeCloseTo(0.8, 2);
    expect(ratios.ratioY).toBeCloseTo(0.7, 2);
  });
});
