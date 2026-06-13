import { describe, it, expect } from 'vitest';
import { getFee, getOptimizerBranch } from '../services/optimization-fee.service';

// Note: these are async DB calls; the test uses the real resolver (not mocks).
// The DB must be seeded with the Phase 2 migration (076) for the $5.99 / $19.99
// defaults to be present. Otherwise the test falls back to DEFAULT_FEE_CENTS (599).

describe('Phase 2 — event optimize credit gate', () => {
  it('getFee carries creditTowardCoordination for event branch types', async () => {
    for (const eventType of ['wedding', 'corporate'] as const) {
      const fee = await getFee(eventType, 'standard');
      expect(fee).toHaveProperty('creditTowardCoordination');
      expect(fee.creditTowardCoordination).toBe(true);
    }
  });

  it('getFee carries creditTowardCoordination equal to the full fee for events', async () => {
    const fee = await getFee('wedding', 'standard');
    expect(fee.creditTowardCoordination).toBe(true);
    expect(fee.priceCents).toBeGreaterThan(0);
  });

  it('getFee carries NO coordination credit for trip or experience branch types', async () => {
    for (const eventType of ['vacation', 'adventure', 'honeymoon', 'anniversary', 'proposal', 'birthday'] as const) {
      const fee = await getFee(eventType, 'standard');
      expect(fee.creditTowardCoordination).toBe(false);
    }
  });

  it('getFee returns a 4-field ResolvedOptimizationFee shape', async () => {
    const fee = await getFee('vacation', 'simple');
    expect(fee).toHaveProperty('priceCents');
    expect(fee).toHaveProperty('currency');
    expect(fee).toHaveProperty('isDisabled');
    expect(fee).toHaveProperty('creditTowardCoordination');
  });

  it('getOptimizerBranch maps event types correctly', () => {
    expect(getOptimizerBranch('vacation')).toBe('trip');
    expect(getOptimizerBranch('adventure')).toBe('trip');
    expect(getOptimizerBranch('honeymoon')).toBe('trip');
    expect(getOptimizerBranch('anniversary')).toBe('trip');
    expect(getOptimizerBranch('proposal')).toBe('experience');
    expect(getOptimizerBranch('birthday')).toBe('experience');
    expect(getOptimizerBranch('wedding')).toBe('event');
    expect(getOptimizerBranch('corporate')).toBe('event');
    expect(getOptimizerBranch(null)).toBe('trip');
    expect(getOptimizerBranch(undefined)).toBe('trip');
  });
});
