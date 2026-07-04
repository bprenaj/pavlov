import { describe, it, expect, vi } from 'vitest';
import {
  getEntitlement,
  setEntitlement,
  isPaid,
  initEntitlement,
} from '../../src/main/services/entitlement';
import type { EntitlementTier } from '../../src/shared/constants';

describe('EntitlementService', () => {
  it('defaults to free', () => {
    expect(getEntitlement()).toBe('free');
  });

  it('can set to trial', () => {
    setEntitlement('trial');
    expect(getEntitlement()).toBe('trial');
  });

  it('can set to paid', () => {
    setEntitlement('paid');
    expect(getEntitlement()).toBe('paid');
  });

  it('isPaid returns true for paid and trial', () => {
    setEntitlement('paid');
    expect(isPaid()).toBe(true);
    setEntitlement('trial');
    expect(isPaid()).toBe(true);
    setEntitlement('free');
    expect(isPaid()).toBe(false);
  });

  it('returns the new tier from setEntitlement', () => {
    const result = setEntitlement('paid');
    expect(result).toBe('paid');
  });

  it('rejects unknown tiers', () => {
    setEntitlement('paid');
    const result = setEntitlement('vip' as EntitlementTier);
    expect(result).toBe('paid');
  });
});

describe('Entitlement persistence', () => {
  it('restores the saved tier on init', () => {
    initEntitlement({ get: () => 'trial', set: () => {} });
    expect(getEntitlement()).toBe('trial');
  });

  it('ignores corrupt saved values', () => {
    setEntitlement('free');
    initEntitlement({ get: () => 'banana' as EntitlementTier, set: () => {} });
    expect(getEntitlement()).toBe('free');
  });

  it('writes tier changes to storage', () => {
    const set = vi.fn();
    initEntitlement({ get: () => null, set });
    setEntitlement('paid');
    expect(set).toHaveBeenCalledWith('paid');
  });

  it('does not write rejected tiers to storage', () => {
    const set = vi.fn();
    initEntitlement({ get: () => null, set });
    setEntitlement('nope' as EntitlementTier);
    expect(set).not.toHaveBeenCalled();
  });
});
