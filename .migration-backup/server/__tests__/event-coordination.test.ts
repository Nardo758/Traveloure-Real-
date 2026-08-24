import { describe, it, expect } from 'vitest';
import { getEventProfile, buildEventTimeline, getEventVendorGaps } from '../services/event-coordination.service';
import { resolveCoordinationFee } from '../services/optimization-fee.service';

// These are async DB calls; the test uses the real services (not mocks).
// The DB must be seeded with migration 077 for the event profiles to exist.

describe('Phase 4 — event coordination service generalization', () => {
  it('getEventProfile returns a profile for seeded event types', async () => {
    for (const eventType of ['wedding', 'proposal', 'birthday', 'corporate'] as const) {
      const profile = await getEventProfile(eventType);
      expect(profile).not.toBeNull();
      expect(profile?.eventType).toBe(eventType);
      expect(profile?.anchorType).toBeTruthy();
      expect(profile?.vendorMatrix).toBeInstanceOf(Array);
      expect(profile?.vendorMatrix?.length).toBeGreaterThan(0);
      expect(profile?.sequencingRuleset).toBeInstanceOf(Array);
      expect(profile?.sequencingRuleset?.length).toBeGreaterThan(0);
    }
  });

  it('getEventProfile returns null for non-event types (Trip/Experience)', async () => {
    for (const eventType of ['vacation', 'adventure', 'honeymoon'] as const) {
      const profile = await getEventProfile(eventType);
      expect(profile).toBeNull();
    }
  });

  it('buildEventTimeline returns critical conflict when no anchor set', async () => {
    // Using a non-existent tripId to trigger the "no anchor" path
    const timeline = await buildEventTimeline('nonexistent-trip-123', 'wedding');
    expect(timeline.conflicts.length).toBeGreaterThan(0);
    expect(timeline.conflicts[0].severity).toBe('critical');
    expect(timeline.conflicts[0].type).toBe('vendor_missing');
  });

  it('all four event types run through the same service (no per-type files)', async () => {
    for (const eventType of ['wedding', 'proposal', 'birthday', 'corporate'] as const) {
      const timeline = await buildEventTimeline('nonexistent-trip-123', eventType);
      expect(timeline.eventType).toBe(eventType);
      expect(timeline.anchorType).toBeTruthy();
    }
  });

  it('wedding profile has ceremony_time anchor and 14 timeline blocks', async () => {
    const profile = await getEventProfile('wedding');
    expect(profile?.anchorType).toBe('ceremony_time');
    expect(profile?.sequencingRuleset?.length).toBe(14);
  });

  it('proposal profile has proposal_moment anchor and 6 timeline blocks', async () => {
    const profile = await getEventProfile('proposal');
    expect(profile?.anchorType).toBe('proposal_moment');
    expect(profile?.sequencingRuleset?.length).toBe(6);
  });

  it('birthday profile has main_event anchor and 5 timeline blocks', async () => {
    const profile = await getEventProfile('birthday');
    expect(profile?.anchorType).toBe('main_event');
    expect(profile?.sequencingRuleset?.length).toBe(5);
  });

  it('corporate profile has keynote_time anchor and 8 timeline blocks', async () => {
    const profile = await getEventProfile('corporate');
    expect(profile?.anchorType).toBe('keynote_time');
    expect(profile?.sequencingRuleset?.length).toBe(8);
  });

  it('getEventVendorGaps returns empty array for non-event types', async () => {
    const gaps = await getEventVendorGaps('nonexistent-trip-123', 'vacation');
    expect(gaps).toEqual([]);
  });
});

describe('Phase 4 — coordination fee resolution', () => {
  it('resolveCoordinationFee uses floor for small budgets', async () => {
    const fee = await resolveCoordinationFee('wedding', 10_000); // $100 budget
    expect(fee.feeCents).toBe(499_00); // $499 floor
    expect(fee.rule).toBe('floor');
  });

  it('resolveCoordinationFee uses percent for large budgets', async () => {
    const fee = await resolveCoordinationFee('wedding', 1_000_000); // $10,000 budget
    // 8% of $10,000 = $800, which exceeds $499 floor
    expect(fee.feeCents).toBe(80_000); // $800
    expect(fee.rule).toBe('percent');
  });

  it('resolveCoordinationFee breakdown includes appliedPercent', async () => {
    const fee = await resolveCoordinationFee('wedding', 100_000); // $1,000 budget
    expect(fee.breakdown.appliedPercent).toBe(0.08);
    expect(fee.breakdown.floorCents).toBe(499_00);
  });

  it('coordination fee does NOT credit optimize fee for non-Events (trip/experience branch)', async () => {
    const coordination = await resolveCoordinationFee('vacation', 100_000);
    expect(coordination.optimizeCreditCents).toBe(0);
    // Raw fee should equal payable (no credit applied)
    const rawFee = Math.max(499_00, Math.round(100_000 * 0.08));
    expect(coordination.feeCents).toBe(rawFee);
  });

  it('coordination fee applies NO optimize credit (D-CREDIT interim — unearned credit removed)', async () => {
    // D-CREDIT interim: the optimize-fee credit was subtracted unconditionally with no signal the fee
    // was ever paid (no payment→coordination-state linkage — see the TODO in optimization.routes.ts
    // confirm). Crediting an unpaid fee is an unearned discount, so the honest interim charges
    // floor-or-percent with NO credit. Restore crediting only for an actually-paid optimize fee when
    // the paid-signal ships (filed follow-up).
    const coordination = await resolveCoordinationFee('wedding', 100_000);
    expect(coordination.optimizeCreditCents).toBe(0);
    // Payable = raw fee, no credit subtracted.
    const rawFee = Math.max(499_00, Math.round(100_000 * 0.08));
    expect(coordination.feeCents).toBe(rawFee);
  });
});
