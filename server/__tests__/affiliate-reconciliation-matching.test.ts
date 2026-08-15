/**
 * Affiliate reconciliation — cross-month matching tests.
 *
 * Run with: npx tsx --test server/__tests__/affiliate-reconciliation-matching.test.ts
 *
 * Verifies (against the pure selectMatchCandidate helper) that a booking made
 * near the end of a month whose commission is reported by the partner in the
 * first days of the next month still matches when the background polls use
 * LATE_REPORT_TOLERANCE_DAYS — and that the default ±3-day tolerance (used by
 * the admin view) would NOT have matched it, i.e. the wider tolerance is what
 * fixes the stated failure mode.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";

const {
  selectMatchCandidate,
  DEFAULT_MATCH_TOLERANCE_DAYS,
  LATE_REPORT_TOLERANCE_DAYS,
} = await import("../services/affiliate-reconciliation.service");
const { pool } = await import("../db");

after(async () => {
  await pool.end().catch(() => {});
});

const TP_PARTNER_ID = "partner-travelpayouts";
const PZ_PARTNER_ID = "partner-partnerize";

function internalRow(overrides: Record<string, any>) {
  return {
    id: "earning-1",
    partner_id: TP_PARTNER_ID,
    created_at: "2026-07-29T18:00:00Z", // booking near end of July
    total_commission: "5.50",
    reconciliation_status: "unmatched",
    ...overrides,
  };
}

function externalRow(overrides: Record<string, any>) {
  return {
    partnerReferenceId: "150:9001",
    partner: "travelpayouts",
    amount: 5.5,
    currency: "USD",
    reportedAt: "2026-08-05", // reported 7 days later, in the new month
    rawData: {},
    ...overrides,
  };
}

test("Travelpayouts: end-of-July booking reported Aug 5 matches with late-report tolerance", () => {
  const internal = [internalRow({})];
  const ext = externalRow({});

  // Sanity: the delta is > 3 days, so the default tolerance must NOT match…
  assert.equal(
    selectMatchCandidate(ext, internal, TP_PARTNER_ID, new Set(), DEFAULT_MATCH_TOLERANCE_DAYS),
    null,
    "default ±3d tolerance should not match a 7-day-late report"
  );

  // …but the background-poll tolerance MUST match it.
  const best = selectMatchCandidate(
    ext, internal, TP_PARTNER_ID, new Set(), LATE_REPORT_TOLERANCE_DAYS
  );
  assert.ok(best, "late-report tolerance must match the cross-month commission");
  assert.equal(best!.id, "earning-1");
});

test("Partnerize: end-of-July booking reported Aug 4 matches with late-report tolerance", () => {
  const internal = [internalRow({ id: "earning-pz", partner_id: PZ_PARTNER_ID, total_commission: "12.00" })];
  const ext = externalRow({
    partnerReferenceId: "conv-777",
    partner: "partnerize",
    amount: 12.0,
    reportedAt: "2026-08-04T09:00:00Z", // ~5.6 days after created_at
  });

  assert.equal(
    selectMatchCandidate(ext, internal, PZ_PARTNER_ID, new Set(), DEFAULT_MATCH_TOLERANCE_DAYS),
    null
  );
  const best = selectMatchCandidate(
    ext, internal, PZ_PARTNER_ID, new Set(), LATE_REPORT_TOLERANCE_DAYS
  );
  assert.ok(best);
  assert.equal(best!.id, "earning-pz");
});

test("late-report tolerance still rejects reports beyond its window", () => {
  const ext = externalRow({ reportedAt: "2026-08-20" }); // 22 days late
  assert.equal(
    selectMatchCandidate(ext, [internalRow({})], TP_PARTNER_ID, new Set(), LATE_REPORT_TOLERANCE_DAYS),
    null
  );
});

test("partner mismatch and consumed rows are never matched, even within tolerance", () => {
  const ext = externalRow({});
  // Wrong partner_id
  assert.equal(
    selectMatchCandidate(
      ext,
      [internalRow({ partner_id: PZ_PARTNER_ID })],
      TP_PARTNER_ID,
      new Set(),
      LATE_REPORT_TOLERANCE_DAYS
    ),
    null
  );
  // Null partner_id excluded when external partner resolves
  assert.equal(
    selectMatchCandidate(
      ext,
      [internalRow({ partner_id: null })],
      TP_PARTNER_ID,
      new Set(),
      LATE_REPORT_TOLERANCE_DAYS
    ),
    null
  );
  // Already consumed in this pass
  assert.equal(
    selectMatchCandidate(
      ext,
      [internalRow({})],
      TP_PARTNER_ID,
      new Set(["earning-1"]),
      LATE_REPORT_TOLERANCE_DAYS
    ),
    null
  );
});

// ─── Cross-month boundary regression ────────────────────────────────────────
//
// This scenario is the root cause of task #990:
//   • A booking occurs on Dec 28 (internal row, created_at in December).
//   • The partner reports the commission on Jan 3 (external reportedAt in January).
//   • An admin opens the reconciliation view with period="this_month" (January).
//
// Before the fix, matchRecords queried internal rows from Jan 1 onward — the
// Dec 28 row was never loaded, so selectMatchCandidate never saw a candidate,
// and the Jan 3 external report landed in "unmatchedExternal" (false positive).
//
// After the fix, getReconciliationView computes widenedStart = Jan 1 − 10 days
// = Dec 22, passes it as matchRecords({ internalWindowStart: widenedStart }), and
// the SQL query now covers Dec 22–Jan 31. The Dec 28 internal row is loaded, and
// selectMatchCandidate (with LATE_REPORT_TOLERANCE_DAYS) matches it to the Jan 3
// external report (delta = 6 days ≤ 10 days tolerance).
//
// The two pure-function assertions below confirm both halves of the fix:
//   1. The date delta alone (6 days) is within LATE_REPORT_TOLERANCE_DAYS — so
//      selectMatchCandidate succeeds once the row is loaded from the DB.
//   2. The date delta exceeds DEFAULT_MATCH_TOLERANCE_DAYS (3 days) — so without
//      the wider tolerance (and the wider SQL window) there would be no match.

test("cross-month boundary: Dec 28 booking matched against Jan 3 partner report (task #990 regression)", () => {
  const decInternal = internalRow({
    id: "earning-dec28",
    created_at: "2025-12-28T20:00:00Z", // booking near end of December
  });
  const janExternal = externalRow({
    partnerReferenceId: "150:dec28-jan3",
    reportedAt: "2026-01-03T08:00:00Z", // reported 6 days later, in January
  });

  // Without the wider tolerance (default ±3d) → no match
  assert.equal(
    selectMatchCandidate(janExternal, [decInternal], TP_PARTNER_ID, new Set(), DEFAULT_MATCH_TOLERANCE_DAYS),
    null,
    "default ±3d tolerance must NOT match a 6-day-late cross-month report"
  );

  // With LATE_REPORT_TOLERANCE_DAYS (10d) → matched
  // (The SQL widenedStart in matchRecords is what makes decInternal available here.)
  const best = selectMatchCandidate(
    janExternal, [decInternal], TP_PARTNER_ID, new Set(), LATE_REPORT_TOLERANCE_DAYS
  );
  assert.ok(best, "late-report tolerance must match the cross-month commission once the row is loaded");
  assert.equal(best!.id, "earning-dec28");
});

test("amount outside 5% tolerance is rejected; closest date wins among candidates", () => {
  const ext = externalRow({ reportedAt: "2026-08-02" });
  // Amount off by >5%
  assert.equal(
    selectMatchCandidate(
      ext,
      [internalRow({ total_commission: "7.00" })],
      TP_PARTNER_ID,
      new Set(),
      LATE_REPORT_TOLERANCE_DAYS
    ),
    null
  );
  // Two candidates — the one with the smaller date delta wins
  const best = selectMatchCandidate(
    ext,
    [
      internalRow({ id: "far", created_at: "2026-07-25T00:00:00Z" }),
      internalRow({ id: "near", created_at: "2026-07-31T00:00:00Z" }),
    ],
    TP_PARTNER_ID,
    new Set(),
    LATE_REPORT_TOLERANCE_DAYS
  );
  assert.equal(best!.id, "near");
});
