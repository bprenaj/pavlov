import { describe, it, expect } from 'vitest';
import { computeMas, stdDev } from '../../src/shared/mas';

describe('computeMas', () => {
  it('returns 100 for perfect pro-level stats', () => {
    const score = computeMas(8, 2, 200, 0);
    expect(score).toBe(100);
  });

  it('returns 0 for worst-case stats', () => {
    const score = computeMas(0, 10, 800, 5);
    expect(score).toBe(0);
  });

  it('returns mid-range for average stats', () => {
    const score = computeMas(4, 6, 500, 2.5);
    expect(score).toBeGreaterThan(20);
    expect(score).toBeLessThan(80);
  });

  it('clamps to 0-100 even with extreme inputs', () => {
    // Zero glance duration yields 50 proc score, so max is 90 not 100
    expect(computeMas(100, 0, 0, 0)).toBe(90);
    expect(computeMas(0, 100, 5000, 100)).toBe(0);
  });

  it('handles zero avg gap as 100 response score', () => {
    const score = computeMas(8, 0, 200, 0);
    expect(score).toBe(100);
  });

  it('handles zero glance duration as 50 processing score', () => {
    const score = computeMas(8, 2, 0, 0);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('returns a number with at most one decimal place', () => {
    const score = computeMas(3.7, 4.3, 350, 1.8);
    const decimals = (score.toString().split('.')[1] || '').length;
    expect(decimals).toBeLessThanOrEqual(1);
  });
});

describe('stdDev', () => {
  it('returns 0 for a single value', () => {
    expect(stdDev([5])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(stdDev([])).toBe(0);
  });

  it('returns 0 for identical values', () => {
    expect(stdDev([3, 3, 3, 3])).toBe(0);
  });

  it('computes correct std dev for known data', () => {
    const result = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeCloseTo(2, 0);
  });
});
