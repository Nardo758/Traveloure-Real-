import { describe, it, expect } from 'vitest';
import { routeConcierge } from '../services/concierge-router.service';

// These are async DB calls; the test uses the real router (not mocks).
// The DB must be seeded with expert availability and fee bands for the
// commission resolution to return meaningful rates.

describe('Phase 3 — Concierge layer suggest-vs-add + commission resolution', () => {
  it('Trip/Experience branch returns suggest (expert is optional upsell)', async () => {
    for (const eventType of ['vacation', 'adventure', 'honeymoon', 'proposal', 'birthday'] as const) {
      const route = await routeConcierge({
        intent: `Plan my ${eventType}`,
        destination: 'Paris',
        eventType,
      });
      expect(route.branch).not.toBe('event');
      expect(route.suggestVsAdd).toBe('suggest');
    }
  });

  it('Event branch returns add (coordinator is mandatory)', async () => {
    for (const eventType of ['wedding', 'corporate'] as const) {
      const route = await routeConcierge({
        intent: `Plan my ${eventType}`,
        destination: 'Paris',
        eventType,
      });
      expect(route.branch).toBe('event');
      expect(route.suggestVsAdd).toBe('add');
    }
  });

  it('expert tier includes commissionRate from resolveCommissionRates', async () => {
    const route = await routeConcierge({
      intent: 'Plan my vacation',
      destination: 'Paris',
      eventType: 'vacation',
    });
    expect(route.expert).toHaveProperty('commissionRate');
    expect(route.expert.commissionRate).toBeGreaterThanOrEqual(0);
    expect(route.expert.commissionRate).toBeLessThanOrEqual(1);
  });

  it('expert tier includes expertShareRate (complements commissionRate to 1)', async () => {
    const route = await routeConcierge({
      intent: 'Plan my vacation',
      destination: 'Paris',
      eventType: 'vacation',
    });
    expect(route.expert).toHaveProperty('expertShareRate');
    expect(route.expert.expertShareRate).toBeGreaterThanOrEqual(0);
    expect(route.expert.expertShareRate).toBeLessThanOrEqual(1);
    // Platform + expert = 100%
    expect((route.expert.commissionRate ?? 0) + (route.expert.expertShareRate ?? 0)).toBeCloseTo(1, 5);
  });

  it('Event branch recommends expert or full (never ai as primary)', async () => {
    const route = await routeConcierge({
      intent: 'Plan my wedding',
      destination: 'Paris',
      eventType: 'wedding',
    });
    expect(route.branch).toBe('event');
    // Event should recommend expert or full (coordinator is mandatory)
    expect(['expert', 'full']).toContain(route.recommended);
  });

  it('Trip branch recommends ai when available (not event)', async () => {
    const route = await routeConcierge({
      intent: 'Plan my vacation',
      destination: 'Paris',
      eventType: 'vacation',
    });
    expect(route.branch).toBe('trip');
    // AI should be available and recommended for trips
    expect(route.ai.available).toBe(true);
    expect(route.recommended).toBe('ai');
  });

  it('route response includes branch field', async () => {
    const route = await routeConcierge({
      intent: 'Plan my birthday',
      destination: 'Paris',
      eventType: 'birthday',
    });
    expect(route).toHaveProperty('branch');
    expect(route.branch).toBe('experience');
  });

  it('route response includes suggestVsAdd field', async () => {
    const route = await routeConcierge({
      intent: 'Plan my wedding',
      destination: 'Paris',
      eventType: 'wedding',
    });
    expect(route).toHaveProperty('suggestVsAdd');
    expect(route.suggestVsAdd).toBe('add');
  });
});
