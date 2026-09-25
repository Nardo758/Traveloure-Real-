/**
 * planning-tolls-ledger.db.test.ts — EVERY TOLL IS ONE FEE ROW, PLUS ONE WAIVER WHEN COVERED.
 *
 * (ruling `2026-09-25-planning-tolls`, decision-maker GO on the Phase 0 note 2026-09-25; ledger
 *  `2026-09-25-tolls-fee-ledger`. CLAUDE.md §8, §13, §14, §15, §15b, §18 rule 1, LD 41, LD 45 (3).)
 *
 * The matrix, one test per row, each PRINTING the `fee_ledger` rows it proves:
 *   T1  AI task, Trip Pass          — through the REAL pay + apply routes ⇒ fee + `trip_pass` waiver
 *   T2  AI task, double apply       — a second apply (409) ⇒ still exactly those two rows
 *   T3  AI task, paid               — ⇒ ONE fee row at Stripe's amount, band named; a retry adds none
 *   T4  AI task, refused → refunded — ⇒ fee + LINKED reversal; a retry adds none
 *   T5  Optimizer, paid             — ⇒ ONE fee row keyed on the PaymentIntent; a re-run on it adds none
 *   T6  Optimizer, Trip Pass        — ⇒ fee + `trip_pass` waiver
 *   T7  Optimizer, free re-run      — ⇒ fee + `free_rerun` waiver; a SECOND run is a second pair
 *   T8  Free draft and plan mint    — ⇒ NO row
 *   T9  The run plan (pure)         — which basis records what; a reused payment records nothing
 *   T10 Never a $0 row              — a non-positive price writes nothing, and says why
 *
 * ── WHAT IS REACHED THROUGH A ROUTE, AND WHAT IS NOT (§18d, stated) ───────────────────────────
 * No Stripe call is made in this file (the `plan-proposal-charge.db.test.ts` posture). T1/T2 drive the
 * real trips router, because a covered apply needs no PaymentIntent. The PAID apply and the refund
 * need a verified PaymentIntent, so T3/T4 call the exact writer each hook calls
 * (`recordAiTaskToll` at the apply route, `recordAiTaskRefundToll` inside
 * `refundRefusedProposalCharge`); the optimizer's run points live in the `server/routes.ts` monolith,
 * so T5–T7 call `recordOptimizerRunToll` and T9 pins the pure decision the run points make. The
 * wiring of each hook is pinned by source in T11.
 *
 * NO FEE LITERALS (§8): every expected amount is read out of `fee_bands` / `optimization_fees` or is
 * the value this file itself passed in.
 *
 * DISPOSABLE DB ONLY; every row written is deleted in after().
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createPlanProposal } from "../services/plan-proposals.service";
import { CONCIERGE_AI_TASK_BAND } from "../services/fee-resolution.service";
import { getFee } from "../services/optimization-fee.service";
import { complexityTier } from "../services/smart-sequencing.service";
import {
  aiTaskTollLedgerKey,
  optimizerRunTollPlan,
  recordAiTaskRefundToll,
  recordAiTaskToll,
  recordOptimizerRunToll,
} from "../services/fee-ledger.service";
import { storage } from "../storage";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[planning-tolls-ledger] REFUSING to write fixtures on '${host ?? "<none>"}'. ` +
        `Opt in deliberately with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const ids = {
  owner: `tol-${RUN}-owner`,
  covered: `tol-${RUN}-covered`,
  uncovered: `tol-${RUN}-uncovered`,
};
const mintedTripIds: string[] = [];

async function asUser<T>(userId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "Test Actor" } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function post(base: string, path: string) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { status: res.status, body: await res.json() };
}

type LedgerRow = {
  id: string;
  source_type: string;
  source_id: string;
  fee_type: string;
  amount: string;
  borne_by: string;
  band_id: string | null;
  rate_source: string;
  stripe_payment_ref: string | null;
  stripe_refund_ref: string | null;
  reverses_ledger_id: string | null;
  idempotency_key: string;
  metadata: Record<string, any>;
};

async function rowsFor(sourceType: string, sourceId: string, label: string): Promise<LedgerRow[]> {
  const r = await db.execute(sql`
    SELECT id, source_type, source_id, fee_type, amount::text AS amount, borne_by, band_id::text AS band_id,
           rate_source, stripe_payment_ref, stripe_refund_ref, reverses_ledger_id, idempotency_key, metadata
      FROM fee_ledger
     WHERE source_type = ${sourceType} AND source_id = ${sourceId}
     ORDER BY created_at, fee_type
  `);
  const rows = r.rows as unknown as LedgerRow[];
  // The proof the PR body carries: every case prints what it wrote.
  console.log(
    `[${label}] fee_ledger rows:`,
    JSON.stringify(
      rows.map((x) => ({
        fee_type: x.fee_type,
        amount: x.amount,
        borne_by: x.borne_by,
        rate_source: x.rate_source,
        band: x.band_id ? "named" : null,
        covered_by: x.metadata?.covered_by ?? null,
        reverses: x.reverses_ledger_id ? "linked" : null,
      })),
    ),
  );
  return rows;
}

async function aiTaskBand(): Promise<{ id: string; cents: number }> {
  const r = await db.execute(sql`
    SELECT id::text AS id, CAST(default_rate AS FLOAT) AS rate FROM fee_bands
     WHERE band_key = ${CONCIERGE_AI_TASK_BAND} AND is_active = true LIMIT 1
  `);
  const row = r.rows[0] as any;
  assert.ok(row, `the ${CONCIERGE_AI_TASK_BAND} band must exist (migration 258)`);
  return { id: String(row.id), cents: Math.round(Number(row.rate)) };
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ids.owner}, ${`tol-${RUN}@t.test`}, 'user')`);
  for (const id of [ids.covered, ids.uncovered]) {
    await db.execute(sql`
      INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
      VALUES (${id}, ${ids.owner}, ${`TOL ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto')
    `);
  }
  await db.execute(sql`
    INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source, allowances_snapshot)
    VALUES (${`tol-${RUN}-ent`}, ${ids.covered}, 'trip_pass', 'active', 'beta', '{}'::jsonb)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM fee_ledger WHERE metadata->>'tripId' LIKE ${`tol-${RUN}%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM fee_ledger WHERE source_id LIKE ${`tol-${RUN}%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id LIKE ${`tol-${RUN}%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM plan_proposals WHERE trip_id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  for (const id of mintedTripIds) {
    await db.execute(sql`DELETE FROM trip_destinations WHERE trip_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.owner}`).catch(() => {});
});

// ── AI task ─────────────────────────────────────────────────────────────────────────────────────

let coveredProposalId = "";

test("T1: a Trip-Pass AI task applied through the real routes writes fee + trip_pass waiver", async () => {
  const band = await aiTaskBand();
  const proposal = await createPlanProposal({
    tripId: ids.covered,
    proposal: { additions: [{ title: `T1 ${RUN}` }] } as unknown,
  });
  coveredProposalId = proposal.id;
  const { pay, apply } = await asUser(ids.owner, async (base) => ({
    pay: await post(base, `/api/trips/${ids.covered}/proposals/${proposal.id}/pay`),
    apply: await post(base, `/api/trips/${ids.covered}/proposals/${proposal.id}/apply`),
  }));
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  assert.equal(apply.status, 200, JSON.stringify(apply.body));
  assert.equal(apply.body.runBasis, "trip_pass");

  const rows = await rowsFor("ai_task", proposal.id, "T1 AI task covered by Trip Pass");
  assert.equal(rows.length, 2);
  const fee = rows.find((r) => r.fee_type === "ai_concierge_fee")!;
  const waiver = rows.find((r) => r.fee_type === "fee_waiver")!;
  assert.equal(fee.amount, dollars(band.cents), "the fee is the band's price — no literal");
  assert.equal(fee.borne_by, "traveler");
  assert.equal(fee.rate_source, "band");
  assert.equal(fee.band_id, band.id);
  assert.equal(fee.stripe_payment_ref, null, "a covered task has no PaymentIntent");
  assert.equal(waiver.amount, `-${dollars(band.cents)}`);
  assert.equal(waiver.borne_by, "platform");
  assert.equal(waiver.metadata.covered_by, "trip_pass");
  assert.equal(fee.metadata.tripId, ids.covered);
});

test("T2: a second apply of the same proposal adds no row", async () => {
  assert.ok(coveredProposalId, "T1 must have run");
  const second = await asUser(ids.owner, (base) =>
    post(base, `/api/trips/${ids.covered}/proposals/${coveredProposalId}/apply`),
  );
  assert.equal(second.status, 409, JSON.stringify(second.body));
  // And a retry of the WRITE itself is absorbed by the key.
  await recordAiTaskToll({ proposalId: coveredProposalId, tripId: ids.covered, actor: ids.owner, basis: "trip_pass" });
  const rows = await rowsFor("ai_task", coveredProposalId, "T2 AI task double apply");
  assert.equal(rows.length, 2, "still exactly one fee row and one waiver");
});

test("T3: a paid AI task writes ONE fee row at Stripe's amount, naming the band; a retry adds none", async () => {
  const band = await aiTaskBand();
  const proposalId = `tol-${RUN}-paid`;
  const pi = `pi_tol_${RUN}_paid`;
  const input = {
    proposalId,
    tripId: ids.uncovered,
    actor: ids.owner,
    basis: "paid" as const,
    amountCents: band.cents,
    paymentIntentId: pi,
  };
  const first = await recordAiTaskToll(input);
  const retry = await recordAiTaskToll(input);
  assert.equal(first.inserted, 1);
  assert.equal(retry.inserted, 0, "the key absorbs a retry");

  const rows = await rowsFor("ai_task", proposalId, "T3 AI task charged");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fee_type, "ai_concierge_fee");
  assert.equal(rows[0].amount, dollars(band.cents));
  assert.equal(rows[0].band_id, band.id, "band provenance: a band-priced row names its band");
  assert.equal(rows[0].stripe_payment_ref, pi);
  assert.equal(rows[0].idempotency_key, aiTaskTollLedgerKey(proposalId));
});

test("T4: a refused, refunded AI task writes the fee AND a linked reversal; a retry adds none", async () => {
  const band = await aiTaskBand();
  const proposalId = `tol-${RUN}-refunded`;
  const opts = {
    proposalId,
    tripId: ids.uncovered,
    paymentIntentId: `pi_tol_${RUN}_ref`,
    amountCents: band.cents,
    stripeRefundId: `re_tol_${RUN}`,
    actor: "proposal-refund",
  };
  const first = await recordAiTaskRefundToll(opts);
  const retry = await recordAiTaskRefundToll(opts);
  assert.equal(first.inserted, 2);
  assert.equal(retry.inserted, 0);

  const rows = await rowsFor("ai_task", proposalId, "T4 AI task refused then refunded");
  assert.equal(rows.length, 2);
  const fee = rows.find((r) => r.fee_type === "ai_concierge_fee")!;
  const reversal = rows.find((r) => r.fee_type === "reversal")!;
  assert.equal(fee.amount, dollars(band.cents));
  assert.equal(reversal.amount, `-${dollars(band.cents)}`);
  assert.equal(reversal.reverses_ledger_id, fee.id, "the reversal points at the fee row");
  assert.equal(reversal.stripe_refund_ref, opts.stripeRefundId);
});

// ── Optimizer ───────────────────────────────────────────────────────────────────────────────────

async function optimizerPrice(): Promise<{ tier: string; cents: number }> {
  const eventType = await storage.getTripEventType(ids.uncovered);
  const tier = complexityTier(eventType ?? undefined);
  const fee = await getFee(eventType ?? undefined, tier);
  assert.ok(fee.priceCents > 0, "the resolver must price this tier");
  return { tier, cents: fee.priceCents };
}

test("T5: a paid optimizer run writes ONE fee row keyed on the PaymentIntent; a re-run on it adds none", async () => {
  const price = await optimizerPrice();
  const comparisonId = `tol-${RUN}-cmp-paid`;
  const base = {
    comparisonId,
    tripId: ids.uncovered,
    userExperienceId: null,
    eventType: null,
    tier: price.tier,
    priceCents: price.cents,
    actor: ids.owner,
    basis: "paid" as const,
    paymentIntentId: `pi_tol_${RUN}_opt`,
  };
  assert.equal((await recordOptimizerRunToll(base)).inserted, 1);
  assert.equal((await recordOptimizerRunToll(base)).inserted, 0);

  const rows = await rowsFor("optimizer_run", comparisonId, "T5 Optimizer paid");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, dollars(price.cents));
  assert.equal(rows[0].rate_source, "flat", "the optimizer price is not a fee_bands row");
  assert.equal(rows[0].band_id, null);
  assert.equal(rows[0].metadata.tier, price.tier);
});

for (const coverage of ["trip_pass", "free_rerun"] as const) {
  test(`T${coverage === "trip_pass" ? 6 : 7}: an optimizer run covered by ${coverage} writes fee + waiver`, async () => {
    const price = await optimizerPrice();
    const comparisonId = `tol-${RUN}-cmp-${coverage}`;
    const run = (runId: string) =>
      recordOptimizerRunToll({
        comparisonId,
        tripId: ids.covered,
        userExperienceId: null,
        eventType: null,
        tier: price.tier,
        priceCents: price.cents,
        actor: ids.owner,
        basis: coverage,
        runId,
      });
    const runA = crypto.randomUUID();
    assert.equal((await run(runA)).inserted, 2);
    assert.equal((await run(runA)).inserted, 0, "a retried WRITE for the same run adds nothing");

    let rows = await rowsFor("optimizer_run", comparisonId, `T Optimizer ${coverage}`);
    assert.equal(rows.length, 2);
    const waiver = rows.find((r) => r.fee_type === "fee_waiver")!;
    assert.equal(waiver.metadata.covered_by, coverage);
    assert.equal(waiver.amount, `-${dollars(price.cents)}`);

    if (coverage === "free_rerun") {
      // A regenerate is a SECOND run on the same comparison, so it is a second pair (ruling 1).
      assert.equal((await run(crypto.randomUUID())).inserted, 2);
      rows = await rowsFor("optimizer_run", comparisonId, "T7 Optimizer second free re-run");
      assert.equal(rows.length, 4);
    }
  });
}

// ── Nothing where nothing is owed ───────────────────────────────────────────────────────────────

test("T8: minting a plan writes no fee_ledger row, and the free draft rail has no toll writer", async () => {
  const trip = await storage.createTrip({
    userId: ids.owner,
    title: `TOL mint ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2030-02-01",
    endDate: "2030-02-03",
  } as any);
  mintedTripIds.push(trip.id);
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM fee_ledger WHERE metadata->>'tripId' = ${trip.id}`);
  assert.equal((r.rows[0] as any).n, 0, "a plan mint is never tolled");

  // The free draft (`POST /api/ai/generate-itinerary`, content.routes.ts) makes a model call, so it
  // is pinned by source: the rail imports no toll writer at all (ruling 1 — no row, no price).
  const content = readFileSync(new URL("../routes/content.routes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(content, /recordAiTaskToll|recordOptimizerRunToll|appendFeeLedgerRows/);
});

test("T9: the run plan — a fresh payment keys on it, a reused one records nothing, a covered run gets a run id", () => {
  const mint = () => "run-1";
  assert.deepEqual(
    optimizerRunTollPlan({ authorized: true, basis: "paid", optimizationPaymentId: "pi_1", claimRequired: true }, mint),
    { basis: "paid", paymentIntentId: "pi_1" },
  );
  assert.equal(
    optimizerRunTollPlan({ authorized: true, basis: "paid", optimizationPaymentId: "pi_1", claimRequired: false }, mint),
    null,
    "a regenerate reusing the comparison's recorded payment is not a new charge",
  );
  assert.deepEqual(optimizerRunTollPlan({ authorized: true, basis: "trip_pass" }, mint), { basis: "trip_pass", runId: "run-1" });
  assert.deepEqual(optimizerRunTollPlan({ authorized: true, basis: "free_rerun" }, mint), { basis: "free_rerun", runId: "run-1" });
});

test("T10: a non-positive price writes nothing and says why — never a $0 row", async () => {
  const comparisonId = `tol-${RUN}-cmp-zero`;
  const res = await recordOptimizerRunToll({
    comparisonId,
    tripId: ids.covered,
    userExperienceId: null,
    eventType: null,
    tier: "x",
    priceCents: 0,
    actor: ids.owner,
    basis: "trip_pass",
    runId: crypto.randomUUID(),
  });
  assert.deepEqual(res, { inserted: 0, skipped: "price_unresolved" });
  assert.equal((await rowsFor("optimizer_run", comparisonId, "T10 zero price")).length, 0);
});

test("T11: each hook is wired where the ruling says", () => {
  const trips = readFileSync(new URL("../routes/trips.routes.ts", import.meta.url), "utf8");
  const charge = readFileSync(new URL("../services/proposal-charge.service.ts", import.meta.url), "utf8");
  const mono = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
  // The apply route records the toll for BOTH bases, after the apply.
  assert.match(trips, /logProposalApplyBasis\(auth\.basis[\s\S]{0,2500}await recordAiTaskToll\(/);
  // Both issued-refund returns record the refund toll first.
  assert.equal((charge.match(/await recordAiTaskRefundToll\(/g) ?? []).length, 2);
  // Both optimizer run points call the ONE helper, right after announcing the basis.
  assert.match(mono, /logOptimizerRunBasis\(runBasis, \{ tripId, comparisonId: comparison\.id \}\);[\s\S]{0,800}recordOptimizerRunTollFor\(/);
  assert.match(mono, /logOptimizerRunBasis\(runAuth\.basis, \{ tripId: comparison\.tripId, comparisonId \}\);[\s\S]{0,400}recordOptimizerRunTollFor\(/);
});
