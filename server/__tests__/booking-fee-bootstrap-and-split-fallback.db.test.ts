/**
 * Task #1036 — DB-backed proofs for the two retired 25/75 fee-literal surfaces
 * (DECISIONS.md ruling 32: every fee-literal move declares its surface and ships
 * a DB-backed test).
 *
 * Surface 1 — booking_fee_configs 'default' bootstrap
 *   (server/services/booking-fee-bootstrap.ts): creates the source-of-truth row
 *   on an empty DB, and NEVER overwrites an existing row — an admin edit (even
 *   back to the legacy 70/30) must survive a restart. The one-time 70/30
 *   backfill now lives in migration 175, off the startup path.
 *
 * Surface 2 — expert revenue-optimization earnings breakdown fallback
 *   (resolveExpertSharePct in server/services/commission.ts): a present
 *   revenue_splits row wins; a missing row resolves from the fee_bands
 *   `expert_standard` band, so an admin band edit changes the displayed
 *   breakdown. No '75' literal anywhere in the path.
 *
 * Run solo: npx tsx --test server/__tests__/booking-fee-bootstrap-and-split-fallback.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { ensureDefaultBookingFeeConfig } from "../services/booking-fee-bootstrap";
import { resolveExpertSharePct, clearExpertSplitCache } from "../services/commission";

// Snapshots restored in after() so the dev DB leaves this test unchanged.
let savedDefaultRow: any | null = null;
let savedBandRate: string | null = null;

before(async () => {
  const { rows: cfg } = await db.execute(
    sql`SELECT * FROM booking_fee_configs WHERE category = 'default'`,
  );
  savedDefaultRow = cfg[0] ?? null;
  const { rows: band } = await db.execute(
    sql`SELECT default_rate FROM fee_bands WHERE band_key = 'expert_standard'`,
  );
  savedBandRate = band[0] ? String((band[0] as any).default_rate) : null;
});

after(async () => {
  // Restore the 'default' booking fee config EXACTLY as found — full-row restore via
  // jsonb_populate_record so no column (present or future) is dropped. NOTE: run this
  // suite solo (repo convention); it mutates two shared singleton rows for its
  // duration, so a concurrent admin edit during the run would be lost.
  await db.execute(sql`DELETE FROM booking_fee_configs WHERE category = 'default'`);
  if (savedDefaultRow) {
    await db.execute(sql`
      INSERT INTO booking_fee_configs
      SELECT * FROM jsonb_populate_record(NULL::booking_fee_configs, ${JSON.stringify(savedDefaultRow)}::jsonb)
    `);
  }
  // Restore the expert_standard band rate.
  if (savedBandRate !== null) {
    await db.execute(sql`
      UPDATE fee_bands SET default_rate = ${savedBandRate} WHERE band_key = 'expert_standard'
    `);
  }
  clearExpertSplitCache();
  await pool.end();
});

// ── Surface 1: bootstrap creates, never clobbers ─────────────────────────────

test("B1: bootstrap CREATES the canonical default row on an empty table", async () => {
  await db.execute(sql`DELETE FROM booking_fee_configs WHERE category = 'default'`);
  await ensureDefaultBookingFeeConfig();
  const { rows } = await db.execute(
    sql`SELECT platform_fee_percent, expert_share_percent, is_active
        FROM booking_fee_configs WHERE category = 'default'`,
  );
  assert.equal(rows.length, 1, "bootstrap must create exactly one default row");
  assert.equal(Number((rows[0] as any).platform_fee_percent), 25);
  assert.equal(Number((rows[0] as any).expert_share_percent), 75);
});

test("B2: bootstrap NEVER overwrites an admin edit — even one back to legacy 70/30", async () => {
  // Admin deliberately tunes the split (60/40, then the legacy 70/30 that the old
  // startup backfill would have reverted every boot).
  for (const [platform, expert] of [
    ["60.00", "40.00"],
    ["30.00", "70.00"], // legacy shape: expert 70 / platform 30
  ] as const) {
    await db.execute(sql`
      UPDATE booking_fee_configs
      SET platform_fee_percent = ${platform}, expert_share_percent = ${expert}
      WHERE category = 'default'
    `);
    await ensureDefaultBookingFeeConfig(); // simulate restart
    const { rows } = await db.execute(
      sql`SELECT platform_fee_percent, expert_share_percent
          FROM booking_fee_configs WHERE category = 'default'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(String((rows[0] as any).platform_fee_percent), platform,
      "restart bootstrap must not clobber the admin-tuned platform fee");
    assert.equal(String((rows[0] as any).expert_share_percent), expert,
      "restart bootstrap must not clobber the admin-tuned expert share");
  }
});

test("B3: bootstrap is idempotent — double run leaves a single row", async () => {
  await db.execute(sql`DELETE FROM booking_fee_configs WHERE category = 'default'`);
  await ensureDefaultBookingFeeConfig();
  await ensureDefaultBookingFeeConfig();
  const { rows } = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM booking_fee_configs WHERE category = 'default'`,
  );
  assert.equal((rows[0] as any).n, 1);
});

// ── Surface 2: earnings-breakdown share resolves rows-first, band-backed ─────

test("S1: a present revenue_splits row wins over the band", async () => {
  assert.equal(await resolveExpertSharePct({ expertPercentage: "62.5" }), 0.625);
});

test("S2: a missing row band-backs to fee_bands expert_standard — and an admin band edit changes the result", async () => {
  // Baseline: whatever the band says now.
  clearExpertSplitCache();
  const baseline = await resolveExpertSharePct(undefined);
  assert.ok(baseline > 0 && baseline < 1, "band-backed share must be a valid fraction");

  // Admin edits the band: platform take 0.40 → expert share 0.60.
  await db.execute(sql`
    UPDATE fee_bands SET default_rate = '0.40' WHERE band_key = 'expert_standard'
  `);
  clearExpertSplitCache();
  const afterEdit = await resolveExpertSharePct(undefined);
  assert.equal(afterEdit, 0.6,
    "admin edit to expert_standard must drive the displayed breakdown fallback");
  assert.notEqual(afterEdit, baseline === 0.6 ? -1 : baseline);
});

test("S3: invalid split percentages band-back — empty, zero, negative, >100, partial-numeric", async () => {
  // Band is at 0.40 platform take from S2's edit → expert share 0.60.
  clearExpertSplitCache();
  for (const bad of ["", "0", "-10", "101", "75junk", "abc", "  "]) {
    const share = await resolveExpertSharePct({ expertPercentage: bad });
    assert.equal(share, 0.6, `invalid percentage ${JSON.stringify(bad)} must band-back, got ${share}`);
  }
  // undefined row too.
  assert.equal(await resolveExpertSharePct(undefined), 0.6);
  // Boundary: exactly 100 is valid; "0" is absent-equivalent (pre-#1036 semantics).
  assert.equal(await resolveExpertSharePct({ expertPercentage: "100" }), 1);
});
