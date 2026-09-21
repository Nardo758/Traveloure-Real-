/**
 * RECONCILIATION RUN TALLIES — the ready-made rail's per-pass work is DURABLE
 * (punchlist **D-42** = option A; ledger `2026-09-15-d42-reconciliation-tallies`; migration 301.
 *  CLAUDE.md §13, §17 rule 2, §18 rule 1, the deploy-push durability rule.)
 *
 * WHAT THIS GUARDS
 * ────────────────
 * §17 rule 2: every pass writes a `reconciliation_runs` row — including a clean one and a skipped
 * one — so that silence is distinguishable from the job not having run. Every rail the drift job
 * scans had a per-pass tally column on that row EXCEPT the ready-made one: the D-18 lane computed
 * `checkedReadyMadePurchases` and `readyMadeAnnounceHandOffs`, said out loud that it was not
 * persisting them, and filed D-42. A SCHEDULED pass therefore left no durable record of that
 * rail's work at all — only the manual `run-now` response and a log line.
 *
 *   T1  A PASS WRITES BOTH TALLIES, and they equal what the response reported. Two shapes: an
 *       ordinary examined purchase (a real count), and a DELIVERED-but-unannounced purchase that
 *       the pass hands back to the shared sender (a real hand-off count) — so neither column can
 *       be satisfied by a hardwired zero.
 *
 *   T2  A CLEAN PASS AND A SKIPPED PASS STILL WRITE THE ROW WITH THE TALLIES (§17 rule 2). A pass
 *       that could not consult Stripe records `0` examined — it looked and there was nothing to
 *       look at — which is a DIFFERENT fact from the NULL in T3 and must not be confused with it.
 *
 *   T3  §13 — A PRE-MIGRATION RUN READS NULL, AND THE ADMIN PROJECTION EMITS NULL, NEVER 0. There
 *       is no backfill and no DEFAULT, deliberately: a row written before migration 301 came from
 *       a job that never counted these things, and a stamped `0` would claim that pass examined
 *       zero ready-made purchases — a fact nobody has.
 *
 *   T4  SCHEMA/DB PARITY for the two columns — the deploy-push durability rule made mechanical
 *       (an object `shared/schema.ts` does not declare is dropped at publish and never recreated,
 *       because the migration is stamped by then). Derived from `getTableColumns`, never
 *       hand-typed, and it asserts the NULLABLE / NO-DEFAULT / NO-CHECK posture the ruling names.
 *
 * STATED NEGATIVE SPACE (§18d). This file proves that the two numbers the job already computes
 * are RECORDED and read back as themselves. It says nothing about whether those numbers are the
 * right numbers — the rail's detection predicates, exception kinds, dedupe keys and the hand-off
 * itself are `reconciliation-detection.db.test.ts`'s subject (N23/N27) and are untouched by this
 * lane. T3's admin half is proven in two layers, each with its own limit: the response VALUE is
 * read straight out of the database, and the fact that the two admin SELECTs NAME the columns is a
 * SOURCE pin over `admin.routes.ts` — it proves those queries carry the columns, not that an HTTP
 * client received them.
 *
 * NO FEE LITERALS (§8): no rate is read, written or asserted anywhere in this file.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/reconciliation-run-tallies.db.test.ts
 */
// The ready-made hand-off in T1b drives the REAL shared sender, whose module graph reaches the
// stripe-payment service; a DUMMY test-mode key satisfies its constructor. Nothing here makes a
// network call — every PaymentIntent is a literal and the Stripe reader is injected. T2b deletes
// and restores this variable itself, so setting it here does not weaken that case.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_run_tallies_suite";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getTableColumns, sql } from "drizzle-orm";
import { db } from "../db";
import { reconciliationRuns } from "@shared/schema";
import { runStripeReconciliation, type StripeReader } from "../jobs/stripeReconciliation";

const RUN = crypto.randomUUID().slice(0, 8);
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const ids = {
  user: `rtal-${RUN}-user`,
  trip: `rtal-${RUN}-trip`,
  rmSourceTrip: `rtal-${RUN}-rm-src`,
  listing: `rtal-${RUN}-listing`,
};
const createdPurchaseIds: string[] = [];
const createdBuyerIds: string[] = [];
const createdRunIds: string[] = [];

// ── Disposable-DB guard (identical posture to reconciliation-detection.db.test.ts) ────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[reconciliation-run-tallies] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`rtal-${RUN}@t.test`}, 'Tally', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'Tally clone trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.rmSourceTrip}, ${ids.user}, 'Tally source trip', 'Kyoto', CURRENT_DATE + 60, CURRENT_DATE + 64)
  `);
  await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status)
    VALUES (${ids.listing}, ${ids.user}, ${ids.rmSourceTrip}, 'Kyoto', 'Tally fixture listing', 5, 12500, 'approved')
  `);
});

after(async () => {
  for (const id of createdPurchaseIds) {
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    // T1b's hand-off runs the REAL shared sender, which writes a bell row and enqueues an email.
    await db
      .execute(sql`DELETE FROM notifications WHERE dedupe_key = ${`ready_made_purchase:${id}:delivered`}`)
      .catch(() => {});
    await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'purchaseId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`).catch(() => {});
  for (const id of createdBuyerIds) {
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.rmSourceTrip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
  for (const id of createdRunIds) {
    await db.execute(sql`DELETE FROM reconciliation_exceptions WHERE run_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM reconciliation_runs WHERE id = ${id}`).catch(() => {});
  }
});

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

/** A ready-made purchase exactly as `/purchase/confirm` leaves it: born `paid`, carrying a
 *  NOT-NULL UNIQUE PaymentIntent id. Each purchase gets its OWN buyer (the partial UNIQUE on
 *  (buyer_id, ready_made_trip_id) allows one live purchase of a listing per buyer). */
async function makePurchase(opts: {
  paymentIntentId: string;
  status?: string;
  cloneTripId?: string | null;
  ageMinutes?: number;
}): Promise<string> {
  const n = createdPurchaseIds.length;
  const buyerId = `rtal-${RUN}-buyer-${n}`;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${buyerId}, ${`rtal-${RUN}-b${n}@t.test`}, 'Tally', 'Buyer')
  `);
  createdBuyerIds.push(buyerId);

  const id = `rtal-${RUN}-rmp-${n}`;
  await db.execute(sql`
    INSERT INTO ready_made_purchases (
      id, buyer_id, ready_made_trip_id, price_paid_cents, currency,
      stripe_payment_intent_id, clone_trip_id, status, purchased_at
    ) VALUES (
      ${id}, ${buyerId}, ${ids.listing}, 12500, 'USD',
      ${opts.paymentIntentId}, ${opts.cloneTripId ?? null}, ${opts.status ?? "paid"},
      NOW() - make_interval(mins => ${opts.ageMinutes ?? 120})
    )
  `);
  createdPurchaseIds.push(id);
  return id;
}

/** A PaymentIntent shaped exactly as the ready-made purchase rail writes it: the metadata `type`
 *  triple, and deliberately NO `bookingIds` — which is what keeps the three rails from judging
 *  each other's payments. */
function rmPi(id: string): any {
  return {
    id,
    object: "payment_intent",
    status: "succeeded",
    amount: 12500,
    amount_received: 12500,
    currency: "usd",
    latest_charge: `ch_${id}`,
    created: Math.floor(Date.now() / 1000),
    metadata: { type: "ready_made_purchase", listingId: ids.listing, buyerId: `rtal-${RUN}-buyer` },
  };
}

function reader(paymentIntents: any[]): StripeReader {
  return {
    listPaymentIntents: async () => paymentIntents as any,
    listCharges: async () => [],
    listRefunds: async () => [],
    // Ledger `2026-09-21-membership-reconciliation` added a fourth rail to the SAME injectable
    // seam. This suite predates it and asserts nothing about memberships, so it lists NO
    // subscriptions — the membership rail then scans zero and changes none of these counts.
    listSubscriptions: async () => [],
  };
}

/** Both rails scoped, so a neighbouring row in the same database cannot change a count these
 *  cases assert. The cart rail is scoped to NOTHING throughout this file. */
async function scanReadyMade(paymentIntents: any[], purchaseIds: string[]) {
  const result = await runStripeReconciliation({
    triggeredBy: "test",
    stripeReader: reader(paymentIntents),
    onlyBookingIds: [],
    onlyPurchaseIds: purchaseIds,
  });
  if (result.runId) createdRunIds.push(result.runId);
  return result;
}

/** The two tallies as the DATABASE holds them. `null` is returned as `null` — the readback never
 *  coerces, because the whole point of the column is that NULL and 0 are different answers. */
async function talliesOf(runId: string): Promise<{
  status: string;
  checked: number | null;
  handOffs: number | null;
}> {
  const r = await db.execute(sql`
    SELECT status, checked_ready_made_purchases, ready_made_announce_hand_offs
    FROM reconciliation_runs WHERE id = ${runId}
  `);
  const row = r.rows[0] as any;
  assert.ok(row, `run row ${runId} must exist`);
  return {
    status: String(row.status),
    checked: row.checked_ready_made_purchases == null ? null : Number(row.checked_ready_made_purchases),
    handOffs: row.ready_made_announce_hand_offs == null ? null : Number(row.ready_made_announce_hand_offs),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: T1 — A PASS WRITES BOTH TALLIES, AND THEY MATCH THE RESPONSE
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T1a: a pass that examined a ready-made purchase RECORDS that on its run row", async () => {
  const piId = `pi_${RUN}_t1a`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "cloned", cloneTripId: ids.trip });
  // Announced already, so this pass examines the row and hands nothing back — the two tallies are
  // deliberately different numbers here, which is how a column wired to the wrong source shows up.
  await db.execute(sql`UPDATE ready_made_purchases SET notified_at = NOW() WHERE id = ${purchaseId}`);

  const result = await scanReadyMade([rmPi(piId)], [purchaseId]);

  assert.equal(result.checkedReadyMadePurchases, 1, "the pass reports ONE purchase examined");
  assert.deepEqual(result.readyMadeAnnounceHandOffs, [], "and no hand-off — the buyer was already told");
  assert.ok(result.runId, "a run row was recorded");

  const row = await talliesOf(result.runId!);
  assert.equal(row.status, "completed");
  assert.equal(
    row.checked,
    result.checkedReadyMadePurchases,
    "DB FACT: the examined count is DURABLE and equals the response — a scheduled pass leaves this behind too",
  );
  assert.equal(row.handOffs, 0, "DB FACT: zero hand-offs is RECORDED as 0 — the pass tallied and found none");
  assert.notEqual(row.handOffs, null, "and 0 is not NULL: 'none to do' is not 'never counted' (§13)");
});

test("T1b: a pass that handed a delivered-but-unannounced purchase back to the shared sender RECORDS that too", async () => {
  const piId = `pi_${RUN}_t1b`;
  // The D-18 liveness shape: the `paid → cloned` claim took (the buyer HAS their plan) and nothing
  // on disk says they were told. Past the announce grace, so the pass hands it to the ONE sender.
  const purchaseId = await makePurchase({
    paymentIntentId: piId,
    status: "cloned",
    cloneTripId: ids.trip,
    ageMinutes: 24 * 60,
  });

  const result = await scanReadyMade([rmPi(piId)], [purchaseId]);

  assert.deepEqual(
    result.readyMadeAnnounceHandOffs,
    [purchaseId],
    "the pass reports the hand-off (D-18) — proving this tally is not hardwired to zero",
  );

  const row = await talliesOf(result.runId!);
  assert.equal(
    row.handOffs,
    result.readyMadeAnnounceHandOffs.length,
    "DB FACT: the hand-off COUNT is durable and equals the response's list length",
  );
  assert.equal(row.checked, result.checkedReadyMadePurchases, "DB FACT: and so is the examined count");

  // The IDS are deliberately NOT on the run row: which purchases were announced is a per-purchase
  // fact and lives on the purchase (`ready_made_purchases.notified_at`), not on a run summary.
  const stamped = await db.execute(
    sql`SELECT notified_at FROM ready_made_purchases WHERE id = ${purchaseId}`,
  );
  assert.ok((stamped.rows[0] as any)?.notified_at, "the per-purchase fact stays where D-18 put it");

  // §17 is unchanged by this lane: recording a tally is not repairing anything, and `promoted`
  // still means money recovery alone.
  assert.equal(result.promoted, 0, "no money moved and none is claimed to have moved");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: T2 — A CLEAN PASS AND A SKIPPED PASS STILL CARRY THE TALLIES (§17 rule 2)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T2a: a CLEAN pass writes the run row WITH the tallies — silence is still distinguishable from a dead job", async () => {
  const result = await scanReadyMade([], []);

  assert.equal(result.exceptions.length, 0, "nothing in the window — a clean pass");
  assert.equal(result.checkedReadyMadePurchases, 0);
  assert.ok(result.runId, "and yet a run WAS recorded");

  const row = await talliesOf(result.runId!);
  assert.equal(row.status, "completed");
  assert.equal(row.checked, 0, "DB FACT: a clean pass records that it looked and saw none");
  assert.equal(row.handOffs, 0, "DB FACT: and that it handed nothing back");
  assert.notEqual(row.checked, null, "these are TALLIED zeros, not the untallied NULL of T3");
});

test("T2b: a SKIPPED pass (no Stripe key) writes the run row WITH the tallies", async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const result = await runStripeReconciliation({ triggeredBy: "test" });
    if (result.runId) createdRunIds.push(result.runId);
    assert.equal(result.status, "skipped");
    assert.ok(result.runId, "a run row exists even though nothing was compared");

    const row = await talliesOf(result.runId!);
    assert.equal(row.status, "skipped", "DB FACT: 'we could not look' is a recorded state of its own");
    assert.equal(row.checked, 0, "DB FACT: the tally columns are written on THIS path too (§17 rule 2)");
    assert.equal(row.handOffs, 0);
  } finally {
    if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: T3 — §13: A PRE-MIGRATION RUN IS NULL, AND NULL IS NEVER RENDERED AS 0
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T3a: a run row shaped like a pre-migration pass reads NULL for both tallies — never 0", async () => {
  // Exactly what migration 301 left behind: the row exists, every other tally is a real number,
  // and these two were never written because the job that wrote the row did not count them.
  const runId = `rtal-${RUN}-legacy-run`;
  createdRunIds.push(runId);
  await db.execute(sql`
    INSERT INTO reconciliation_runs (
      id, triggered_by, status, started_at, finished_at,
      scanned_payment_intents, scanned_cart_bookings, scanned_legacy_bookings,
      exceptions_detected, exceptions_new, promoted
    ) VALUES (
      ${runId}, 'test', 'completed', NOW(), NOW(), 3, 2, 1, 0, 0, 0
    )
  `);

  const row = await talliesOf(runId);
  assert.equal(row.checked, null, "DB FACT: NOT TALLIED — there is no backfill and no default");
  assert.equal(row.handOffs, null, "DB FACT: likewise for the hand-off count");

  // The projection the admin reads emits the NULL as a NULL. A `COALESCE(...,0)` anywhere on this
  // path would turn "we never counted" into "this pass examined nothing", which is a claim that
  // run never made (§13) — and would be indistinguishable from T2a's genuinely-zero clean pass.
  const projected = await db.execute(sql`
    SELECT checked_ready_made_purchases, ready_made_announce_hand_offs
    FROM reconciliation_runs WHERE id = ${runId}
  `);
  const p = projected.rows[0] as any;
  assert.equal(p.checked_ready_made_purchases, null, "the admin projection emits null, never 0");
  assert.equal(p.ready_made_announce_hand_offs, null);
});

test("T3b: BOTH admin reconciliation SELECTs name the two columns (SOURCE pin)", () => {
  // The two `/api/admin/reconciliation/*` queries list their columns explicitly, so a column the
  // page renders must be named in each of them. This is a source pin over the FILE, not an HTTP
  // assertion — stated so a green run is read within its bounds (§18d).
  const src = fs.readFileSync(path.join(REPO_ROOT, "server/routes/admin.routes.ts"), "utf8");
  const reconSelects = src
    .split("FROM reconciliation_runs")
    .slice(0, -1)
    .map((chunk) => chunk.slice(-1000));
  assert.equal(reconSelects.length, 2, "there are exactly two SELECTs over reconciliation_runs");
  for (const chunk of reconSelects) {
    assert.match(chunk, /checked_ready_made_purchases/, "each SELECT names the examined-count column");
    assert.match(chunk, /ready_made_announce_hand_offs/, "each SELECT names the hand-off-count column");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: T4 — SCHEMA/DB PARITY (the deploy-push durability rule, made mechanical)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T4: the two columns exist in BOTH shared/schema.ts and the database, nullable and default-free", async () => {
  // The DECLARATION is the licence: an object `shared/schema.ts` does not declare is dropped by
  // Replit's publish-time push and never recreated, because migration 301 is stamped by then. The
  // expectation is DERIVED from the declaration, never hand-typed.
  const declared = getTableColumns(reconciliationRuns) as any;
  const expected = new Map<string, { notNull: boolean }>();
  for (const col of Object.values(declared) as any[]) {
    expected.set(col.name, { notNull: !!col.notNull });
  }
  assert.ok(expected.has("checked_ready_made_purchases"), "shared/schema.ts declares the examined-count column");
  assert.ok(expected.has("ready_made_announce_hand_offs"), "shared/schema.ts declares the hand-off-count column");

  const info = await db.execute(sql`
    SELECT column_name, is_nullable, column_default, data_type
    FROM information_schema.columns
    WHERE table_name = 'reconciliation_runs'
  `);
  const actual = new Map<string, any>();
  for (const r of info.rows as any[]) actual.set(String(r.column_name), r);

  assert.ok(actual.size > 0, "reconciliation_runs must exist after migrations");
  assert.deepEqual(
    [...actual.keys()].sort(),
    [...expected.keys()].sort(),
    "the DB's columns and shared/schema.ts's declaration must be the same set",
  );
  for (const [name, want] of expected) {
    assert.equal(
      actual.get(name).is_nullable === "NO",
      want.notNull,
      `${name}: nullability must match the declaration`,
    );
  }

  // The ruling's own posture, asserted rather than assumed: NULLABLE, NO DEFAULT — so "not
  // tallied" stays expressible and no pass is ever credited with a count it did not take (§13).
  for (const name of ["checked_ready_made_purchases", "ready_made_announce_hand_offs"]) {
    const got = actual.get(name);
    assert.equal(got.is_nullable, "YES", `${name} must be NULLABLE — NULL is "not tallied"`);
    assert.equal(got.column_default, null, `${name} must have NO DB DEFAULT — a stamped 0 is a claim`);
    assert.equal(got.data_type, "integer", `${name} must be an integer count`);
  }

  // NO DB CHECK was added by migration 301 — the publish-trap posture. Any CHECK found here must
  // predate this lane; the two new columns must appear in none of them.
  const checks = await db.execute(sql`
    SELECT cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'reconciliation_runs' AND tc.constraint_type = 'CHECK'
  `);
  for (const row of checks.rows as any[]) {
    const clause = String(row.check_clause ?? "");
    assert.ok(
      !clause.includes("checked_ready_made_purchases") && !clause.includes("ready_made_announce_hand_offs"),
      `no CHECK may constrain the new tally columns (found: ${clause})`,
    );
  }
});
