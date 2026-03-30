import { describe, it, expect } from 'vitest';
import { getEntitlement, setEntitlement, isPaid } from '../../src/main/services/entitlement';

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
});
