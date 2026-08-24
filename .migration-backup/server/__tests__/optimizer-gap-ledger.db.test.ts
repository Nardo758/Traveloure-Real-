/**
 * OPTIMIZER GAP-FILL LEDGER — behavioural proof (OPTIMIZER_SOURCING_BUILD_SPEC WP-B).
 *
 * WHAT THIS GUARDS
 * ────────────────
 * The sourcing rule's step 3: "every external fill is LEDGERED by data type … so a gap the
 * ledger never saw is a gap the platform never fills." The ledger write sits beside the
 * optimize/Apply flow, never inside its critical path — §15b posture: a plan-adjacent FLAG must
 * never fail the flow that produces it. Two properties, proven against a REAL Postgres:
 *
 *   G1  RECORD ON EXTERNAL FILL — `recordGapFill` / `recordGapFills` append a real row to
 *       `optimizer_gap_fills` with the exact city/category/itemKind/source/tripId given, and
 *       admin's `getGapFillSummary` aggregates it (GROUP BY city, category, itemKind + COUNT),
 *       proving the append-only "dedupe via counts" read shape actually works end to end.
 *   G2  LEDGER FAILURE NEVER FAILS THE CALLER — with the table temporarily unavailable (the
 *       sharpest failure this ledger can have), both write functions swallow the error, return a
 *       non-throwing "nothing written" result, and a caller wrapped exactly like the real
 *       call sites (plancard.routes.ts Apply / dmo-ingestion.service.ts) completes normally.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   npx tsx --test server/__tests__/optimizer-gap-ledger.db.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";

const { db, pool } = await import("../db");
const { optimizerGapFills } = await import("../../shared/schema");
const { eq, and } = await import("drizzle-orm");
const { recordGapFill, recordGapFills, getGapFillSummary } = await import("../services/optimizer-gap-ledger.service");

after(async () => {
  await pool.end().catch(() => {});
});

// Isolate this run's rows behind a unique city so summary assertions can't collide with rows any
// other concurrent test run left behind.
const CITY = `TestCity-${crypto.randomUUID().slice(0, 8)}`;

test("G1a — recordGapFill appends a real row with the exact fields given", async () => {
  const tripId = crypto.randomUUID();
  const ok = await recordGapFill({
    city: CITY,
    category: "photography",
    itemKind: "service",
    source: "unfilled",
    tripId,
    details: { note: "no platform match" },
  });
  assert.equal(ok, true, "recordGapFill should report a successful write");

  const rows = await db
    .select()
    .from(optimizerGapFills)
    .where(and(eq(optimizerGapFills.city, CITY), eq(optimizerGapFills.category, "photography")));
  assert.equal(rows.length, 1, "exactly one row should have landed");
  assert.equal(rows[0].itemKind, "service");
  assert.equal(rows[0].source, "unfilled");
  assert.equal(rows[0].tripId, tripId);
  assert.deepEqual(rows[0].details, { note: "no platform match" });
});

test("G1b — recordGapFills batch-writes many rows in one call, dropping only genuinely malformed ones", async () => {
  const result = await recordGapFills([
    { city: CITY, category: "dining", itemKind: "service", source: "tavily" },
    { city: CITY, category: "dining", itemKind: "service", source: "grok" },
    { city: CITY, category: "transfer", itemKind: "transport", source: "google" },
    // Wrong TYPE (not merely a missing/empty field — those are honest-defaulted by
    // normalizeInput, not dropped) — a number where the schema requires a string tripId fails
    // zod .parse and MUST be dropped without poisoning the rest of the batch.
    { city: CITY, category: "bad-row", itemKind: "service", source: "unfilled", tripId: 12345 as any },
  ]);
  assert.equal(result.written, 3, "the 3 well-formed rows should still write");
  assert.equal(result.dropped, 1, "the malformed row should be dropped, not crash the batch");

  const badRow = await db.select().from(optimizerGapFills).where(and(eq(optimizerGapFills.city, CITY), eq(optimizerGapFills.category, "bad-row")));
  assert.equal(badRow.length, 0, "the dropped row must not have landed");

  const diningRows = await db
    .select()
    .from(optimizerGapFills)
    .where(and(eq(optimizerGapFills.city, CITY), eq(optimizerGapFills.category, "dining")));
  assert.equal(diningRows.length, 2);
});

test("G1c — an empty batch is a no-op, not an error", async () => {
  const result = await recordGapFills([]);
  assert.deepEqual(result, { written: 0, dropped: 0 });
});

test("G1d — getGapFillSummary aggregates append-only rows by (city, category, itemKind) with counts, not UPDATE-in-place", async () => {
  const summary = await getGapFillSummary();
  const diningRow = summary.find((r) => r.city === CITY && r.category === "dining" && r.itemKind === "service");
  assert.ok(diningRow, "the dining/service group should appear in the summary");
  assert.equal(diningRow!.totalCount, 2, "two append-only writes should aggregate to a count of 2, not overwrite each other");
  assert.equal(diningRow!.bySource["tavily"], 1);
  assert.equal(diningRow!.bySource["grok"], 1);

  const photoRow = summary.find((r) => r.city === CITY && r.category === "photography");
  assert.ok(photoRow);
  assert.equal(photoRow!.unfilledCount, 1);
});

test("G2 — a ledger write failure (table unavailable) does not throw, and the caller flow completes", async () => {
  // Simulate the sharpest failure this ledger can have: the table itself is gone (a migration
  // rollback mid-deploy, a permissions change, a connection to the wrong DB — any cause, same
  // shape of failure). Renamed rather than dropped so the fixture is trivially reversible.
  await pool.query(`ALTER TABLE optimizer_gap_fills RENAME TO optimizer_gap_fills_disabled_for_test`);

  let callerFlowCompleted = false;
  try {
    // This mirrors the real call sites EXACTLY: a single try/catch'd function call around the
    // ledger write, sitting after/beside the real work — never gating it.
    try {
      await recordGapFill({ city: CITY, category: "will-fail", itemKind: "service", source: "unfilled" });
    } catch {
      // Real call sites log and continue; the ledger function itself is documented to never
      // throw, so reaching this catch at all would already be a regression — asserted below too.
    }
    try {
      const batchResult = await recordGapFills([{ city: CITY, category: "will-fail-2", itemKind: "service", source: "unfilled" }]);
      assert.equal(batchResult.written, 0, "batch write must report zero written when the table is unavailable");
    } catch {
      /* same posture as above */
    }
    // The "calling flow" (optimize/Apply, DMO gap-fill) proceeds to its own completion regardless.
    callerFlowCompleted = true;
  } finally {
    await pool.query(`ALTER TABLE optimizer_gap_fills_disabled_for_test RENAME TO optimizer_gap_fills`);
  }

  assert.equal(callerFlowCompleted, true, "the calling flow must complete even though the ledger write failed");

  // Prove the functions themselves never threw (not merely that our try/catch masked it) by
  // calling them directly against the still-broken table with no wrapping try/catch at all.
  await pool.query(`ALTER TABLE optimizer_gap_fills RENAME TO optimizer_gap_fills_disabled_for_test`);
  let directCallOk = false;
  let batchDirectOk = false;
  try {
    const single = await recordGapFill({ city: CITY, category: "direct-no-wrap", itemKind: "service", source: "unfilled" });
    directCallOk = single === false;
    const batch = await recordGapFills([{ city: CITY, category: "direct-no-wrap-2", itemKind: "service", source: "unfilled" }]);
    batchDirectOk = batch.written === 0;
  } finally {
    await pool.query(`ALTER TABLE optimizer_gap_fills_disabled_for_test RENAME TO optimizer_gap_fills`);
  }
  assert.equal(directCallOk, true, "recordGapFill must resolve false, never throw, when the DB write fails");
  assert.equal(batchDirectOk, true, "recordGapFills must resolve {written:0}, never throw, when the DB write fails");

  // And normal writes work again once the table is back — the failure was transient, not a
  // permanent poisoning of the module (e.g. a cached bad connection).
  const recovered = await recordGapFill({ city: CITY, category: "post-recovery", itemKind: "service", source: "unfilled" });
  assert.equal(recovered, true);
});
