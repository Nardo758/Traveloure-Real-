/**
 * plan-proposal-charge.db.test.ts — THE APPLY IS THE CHARGE POINT, AND IT CHARGES ONCE.
 *
 * (decision-maker rulings 2026-09-15, punchlist **D-20** = A and **D-21** = A; ledger
 *  `2026-09-15-d20-d21-proposal-charge`; migration 300. CLAUDE.md Locked Decision 45 (3),
 *  Locked Decision 41 (a) and (f), Locked Decision 42 **D3** / **D17** / **D18**,
 *  Locked Decision 43 (c), §8, §13, §14, §15, §15b, §18 rule 1, §19a.)
 *
 *   C1  THE CLAIM IS ATOMIC (§15b) — two concurrent pays produce exactly ONE claim, and both
 *       would have derived the SAME Stripe idempotency key, so a double-click is one charge.
 *   C2  A COVERED TRIP CREATES NO PaymentIntent and applies with `charge_basis = 'trip_pass'`,
 *       `charged_amount_cents` NULL and `stripe_payment_intent_id` NULL.
 *   C3  APPLY WITHOUT AUTHORIZATION is refused 402 and writes NO item rows.
 *   C4  APPLY writes the additions with `origin = 'ai'` (server-stamped) and REFUSES a `replaces`
 *       naming a protected expert item — with the reason, leaving that row untouched (D3/§13).
 *   C5  A SECOND APPLY is 409, creates no second items and records no second ledger row.
 *   C6  DISCARD AFTER A CLAIM is ALLOWED while no PaymentIntent exists and REFUSED once one does.
 *   C7  THE AMOUNT IS THE BAND'S — no literal — and an admin band edit moves it.
 *
 * ── HOW STRIPE IS HANDLED, STATED RATHER THAN HIDDEN (§18d) ──────────────────────────────────
 * **NO STRIPE CALL IS MADE ANYWHERE IN THIS FILE, AND THAT IS THE DESIGN.** Every leg proven here
 * is reachable without one: a Trip-Pass-covered apply creates no PaymentIntent BY RULING
 * (LD 41 (a): unlimited coverage, no claim, no PI), an unauthorized apply never reaches Stripe, and
 * the claim, the stamp, the band read, the apply transaction and the discard refusal are all pure
 * database operations. The two legs that DO touch Stripe — verifying a PaymentIntent and creating
 * one — are proven one layer up, in `proposal-apply-authorization.test.ts`, where `verifyPayment`
 * is an injected seam and the idempotency key is asserted directly (A4/A5/A9). So this file's
 * negative space is exact: it proves the money DECISIONS and the money WRITES, not the network.
 *
 * NO FEE LITERALS (§8). C7 reads the band's own value out of `fee_bands`, asserts the resolver
 * returns THAT, then edits the row and asserts the resolver follows — the assertion is the
 * EQUALITY, never a number typed into this file.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 DATABASE_URL=... npx tsx --test --test-concurrency=1 \
 *     server/__tests__/plan-proposal-charge.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, planProposals, platformRevenue } from "@shared/schema";
import {
  PLAN_PROPOSAL_STATUS_APPLIED,
  PLAN_PROPOSAL_STATUS_DISCARDED,
  PLAN_PROPOSAL_STATUS_PROPOSED,
  planProposalApplyIdempotencyKey,
  type PlanProposalChangeSet,
} from "@shared/plan-proposals";
import { createPlanProposal, discardPlanProposal } from "../services/plan-proposals.service";
import {
  claimProposalCharge,
  resolveAiTaskChargeCents,
  stampProposalPaymentIntent,
} from "../services/proposal-charge.service";
import { CONCIERGE_AI_TASK_BAND } from "../services/fee-resolution.service";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);

// ── Disposable-DB guard (the plan-proposals shape; never defaults open) ──────────────────────────
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
      `[plan-proposal-charge] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const ids = {
  owner: `ppc-${RUN}-owner`,
  covered: `ppc-${RUN}-covered`,
  uncovered: `ppc-${RUN}-uncovered`,
};

/** Mounts the REAL trips router with a chosen session identity (the plan-proposals harness). */
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

async function seedTrip(id: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${ids.owner}, ${`PPC ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto')
  `);
}

async function stage(tripId: string, proposal: PlanProposalChangeSet) {
  return await createPlanProposal({ tripId, proposal: proposal as unknown });
}

async function itemsOn(tripId: string) {
  return await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, role)
    VALUES (${ids.owner}, ${`ppc-${RUN}-owner@t.test`}, 'user')
  `);
  await seedTrip(ids.covered);
  await seedTrip(ids.uncovered);
  // An ACTIVE Trip Pass on one plan and none on the other. Written directly rather than through
  // `grantTripPass` because this file proves the CHARGE POINT, not the grant path: a 'stripe'-source
  // grant would need a fabricated PaymentIntent id, which §19a refuses on principle.
  await db.execute(sql`
    INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source, allowances_snapshot)
    VALUES (${`ppc-${RUN}-ent`}, ${ids.covered}, 'trip_pass', 'active', 'beta', '{}'::jsonb)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id LIKE ${`ppc-${RUN}%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM plan_proposals WHERE trip_id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.covered}, ${ids.uncovered})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.owner}`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C1 — THE CLAIM IS THE GUARD (§15b)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C1: two concurrent pays produce exactly ONE claim, and both derive the SAME idempotency key", async () => {
  const proposal = await stage(ids.uncovered, { additions: [{ title: `C1 ${RUN}` }] });

  // The STATEMENT is the guard — never a SELECT followed by a decision. Fired concurrently on
  // purpose: a check-then-update would let both through, which is the TOCTOU bug §15 names by hand.
  const [a, b] = await Promise.all([
    claimProposalCharge(proposal.id, ids.uncovered),
    claimProposalCharge(proposal.id, ids.uncovered),
  ]);
  const winners = [a, b].filter(Boolean);
  assert.equal(winners.length, 1, "exactly one concurrent pay may claim the proposal");
  assert.ok(winners[0]!.chargeClaimedAt, "the winner carries the §15b pre-flight marker");

  // D-21: the key is derived from the PROPOSAL, so the loser's retry — and the winner's — would
  // both hand Stripe the same key and get the same PaymentIntent. One charge per distinct proposal.
  assert.equal(
    planProposalApplyIdempotencyKey(proposal.id),
    `ai-apply-${proposal.id}`,
    "the idempotency key is the proposal's identity and nothing else",
  );

  // A third attempt after the fact is refused by the same clause, with no Stripe call behind it.
  assert.equal(await claimProposalCharge(proposal.id, ids.uncovered), undefined);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C2 — A TRIP PASS CREATES NO PaymentIntent AND APPLIES ON ITS OWN BASIS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C2: a covered trip pays nothing, creates no PaymentIntent, and applies with basis trip_pass", async () => {
  const proposal = await stage(ids.covered, { additions: [{ title: `C2 ${RUN}` }] });

  const paid = await asUser(ids.owner, async (base) => {
    const res = await fetch(`${base}/api/trips/${ids.covered}/proposals/${proposal.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: res.status, body: await res.json() };
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.coveredByTripPass, true);
  assert.equal(paid.body.runBasis, "trip_pass");
  assert.equal("clientSecret" in paid.body, false, "a covered pay returns no client secret at all");

  // LD 41 (a): a covered run takes NO claim — there is no counter to race on, so there is nothing
  // to claim and nothing to release.
  const [afterPay] = await db.select().from(planProposals).where(eq(planProposals.id, proposal.id));
  assert.equal(afterPay.chargeClaimedAt, null, "a covered pay takes no claim");
  assert.equal(afterPay.stripePaymentIntentId, null, "a covered pay creates no PaymentIntent");

  const applied = await asUser(ids.owner, async (base) => {
    const res = await fetch(`${base}/api/trips/${ids.covered}/proposals/${proposal.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: res.status, body: await res.json() };
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal(applied.body.runBasis, "trip_pass");

  const [row] = await db.select().from(planProposals).where(eq(planProposals.id, proposal.id));
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_APPLIED);
  assert.equal(row.chargeBasis, "trip_pass");
  // §13: NULL, never 0 — "no charge was made", not "we charged them nothing".
  assert.equal(row.chargedAmountCents, null);
  assert.equal(row.stripePaymentIntentId, null);
  assert.ok(row.appliedAt, "an applied proposal records WHEN (a record, never an undo — D18)");
  assert.equal(row.appliedItemIds?.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C3 — NO AUTHORIZATION, NO WRITE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C3: applying without a pass and without a payment is 402 and writes NO item rows", async () => {
  const proposal = await stage(ids.uncovered, { additions: [{ title: `C3 ${RUN}` }] });
  const before = (await itemsOn(ids.uncovered)).length;

  const res = await asUser(ids.owner, async (base) => {
    const r = await fetch(`${base}/api/trips/${ids.uncovered}/proposals/${proposal.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(res.status, 402, JSON.stringify(res.body));
  assert.equal(res.body.reason, "payment_required");

  assert.equal((await itemsOn(ids.uncovered)).length, before, "an unauthorized apply writes nothing");
  const [row] = await db.select().from(planProposals).where(eq(planProposals.id, proposal.id));
  assert.equal(row.status, PLAN_PROPOSAL_STATUS_PROPOSED, "and the proposal stays applicable");
  assert.equal(row.chargeBasis, null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C4 — origin 'ai', AND D3's PROTECTED SET IS REFUSED WITH THE REASON
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C4: an apply stamps origin 'ai', and a `replaces` naming expert work is REFUSED, not skipped", async () => {
  // The expert's row: `origin='expert'` is one half of the ONE protected-class predicate
  // (`itineraryItemIsExpertWork`, shared/itinerary-item-expert.ts) the optimizer baseline uses.
  const expertItemId = `ppc-${RUN}-expert-item`;
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, expert_note)
    VALUES (${expertItemId}, ${ids.covered}, ${`Expert pick ${RUN}`}, 1, 'expert', 'Booked this personally.')
  `);

  const refusing = await stage(ids.covered, {
    additions: [{ title: `C4 addition ${RUN}` }],
    replaces: [{ itemId: expertItemId, reason: "cheaper alternative" }],
  });

  const refused = await asUser(ids.owner, async (base) => {
    const r = await fetch(`${base}/api/trips/${ids.covered}/proposals/${refusing.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: r.status, body: await r.json() };
  });
  // §13: the reason is said out loud. A silent skip would have applied a proposal the traveler read
  // as replacing something, and left that something in place.
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.equal(refused.body.reason, "protected_item");
  assert.deepEqual(refused.body.itemIds, [expertItemId]);

  // The whole apply is ONE transaction, so a refusal leaves the plan exactly as it was.
  const [expertRow] = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.id, expertItemId));
  assert.ok(expertRow, "the expert's row is untouched");
  assert.equal(expertRow.origin, "expert");
  const [refusedProposal] = await db.select().from(planProposals).where(eq(planProposals.id, refusing.id));
  assert.equal(refusedProposal.status, PLAN_PROPOSAL_STATUS_PROPOSED);
  assert.equal(
    (await itemsOn(ids.covered)).filter((i) => i.title === `C4 addition ${RUN}`).length,
    0,
    "and the refused proposal's addition was never written",
  );

  // The clean apply: additions land, and their author is stamped SERVER-SIDE (ruling 12 / D23).
  const clean = await stage(ids.covered, {
    additions: [{ title: `C4 clean ${RUN}`, description: "An AI idea." }],
  });
  const ok = await asUser(ids.owner, async (base) => {
    const r = await fetch(`${base}/api/trips/${ids.covered}/proposals/${clean.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const created = (await itemsOn(ids.covered)).filter((i) => i.title === `C4 clean ${RUN}`);
  assert.equal(created.length, 1);
  assert.equal(created[0].origin, "ai", "an applied AI proposal is the AI's, never the expert's (D4/D23)");
  // §13: an addition with no price stays NULL. "$0" would be a claim the source never made.
  assert.equal(created[0].estimatedCost, null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C5 — ONE CHARGE, ONE APPLY (D-21)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C5: a second apply is 409, creates no second items, and records no second ledger row", async () => {
  const proposal = await stage(ids.covered, { additions: [{ title: `C5 ${RUN}` }] });

  const first = await asUser(ids.owner, async (base) => {
    const r = await fetch(`${base}/api/trips/${ids.covered}/proposals/${proposal.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return r.status;
  });
  assert.equal(first, 200);
  const afterFirst = (await itemsOn(ids.covered)).filter((i) => i.title === `C5 ${RUN}`).length;
  assert.equal(afterFirst, 1);

  const second = await asUser(ids.owner, async (base) => {
    const r = await fetch(`${base}/api/trips/${ids.covered}/proposals/${proposal.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.equal(
    (await itemsOn(ids.covered)).filter((i) => i.title === `C5 ${RUN}`).length,
    1,
    "a second apply creates no second copy of the proposal's items",
  );

  // §13 AND `fee_ledger`'s own `amount <> 0` CHECK, one table over: a Trip-Pass-covered apply
  // writes NO revenue row at all — not one, and certainly not a $0 one. The durable record of the
  // covered apply is `charge_basis = 'trip_pass'` plus the absence of a PaymentIntent.
  const ledgered = await db
    .select({ n: sql<number>`count(*)` })
    .from(platformRevenue)
    .where(eq(platformRevenue.sourceType, "ai_task_fee"));
  assert.equal(Number(ledgered[0].n), 0, "no covered apply in this file has ledgered a charge");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C6 — DISCARD AFTER A CLAIM (the ruled answer, pinned)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C6: a CLAIMED proposal is still discardable; one carrying a PaymentIntent is not", async () => {
  // THE RULED ANSWER (D-21, this lane): a CLAIM alone does not block a discard — a claim with no
  // PaymentIntent is a pay attempt whose Stripe call never landed, and leaving that row
  // undiscardable would brick a proposal on a transient error. Discard is its recovery.
  const recoverable = await stage(ids.uncovered, { additions: [{ title: `C6a ${RUN}` }] });
  assert.ok(await claimProposalCharge(recoverable.id, ids.uncovered));
  const discarded = await discardPlanProposal(recoverable.id, ids.uncovered);
  assert.ok(discarded, "a claimed-but-unpaid proposal is still the traveler's to discard");
  assert.equal(discarded!.status, PLAN_PROPOSAL_STATUS_DISCARDED);

  // Once a PaymentIntent EXISTS, money may yet move on this proposal: discarding the row underneath
  // it would take a charge with nothing to apply it to. Refused — by one more clause in the SAME
  // atomic conditional, never a pre-check (§15/§18b).
  const charged = await stage(ids.uncovered, { additions: [{ title: `C6b ${RUN}` }] });
  assert.ok(await claimProposalCharge(charged.id, ids.uncovered));
  assert.ok(await stampProposalPaymentIntent(charged.id, `ppc-${RUN}-pi`));
  assert.equal(
    await discardPlanProposal(charged.id, ids.uncovered),
    undefined,
    "a proposal with a live PaymentIntent is not discardable",
  );
  const [stillProposed] = await db.select().from(planProposals).where(eq(planProposals.id, charged.id));
  assert.equal(stillProposed.status, PLAN_PROPOSAL_STATUS_PROPOSED);

  // §19a: the payment identity has ONE writer and an atomic conditional guards it — a second stamp
  // matches zero rows and can never overwrite the first.
  assert.equal(await stampProposalPaymentIntent(charged.id, `ppc-${RUN}-pi-other`), false);
  const [unchanged] = await db.select().from(planProposals).where(eq(planProposals.id, charged.id));
  assert.equal(unchanged.stripePaymentIntentId, `ppc-${RUN}-pi`);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C7 — D-20: THE PRICE IS THE BAND'S, AND ONLY THE BAND'S
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("C7: the AI-task amount equals the concierge:ai_task band's flat_cents, and a band edit moves it", async () => {
  const seeded = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate, rate_type
      FROM fee_bands WHERE band_key = ${CONCIERGE_AI_TASK_BAND} AND is_active = true
  `);
  const band = seeded.rows[0] as { rate: number; rate_type: string } | undefined;
  assert.ok(band, "the concierge:ai_task band must exist — the charge point is fail-loud without it");
  assert.equal(band!.rate_type, "flat_cents", "D-20 = A: FLAT, from fee_bands");

  // The assertion is the EQUALITY against the row, never a number typed into this file (§8).
  assert.equal(await resolveAiTaskChargeCents(), Math.round(band!.rate));

  // An admin edit moves the charge — which is the whole point of the band being the authority.
  const moved = Math.round(band!.rate) + 100;
  try {
    await db.execute(sql`
      UPDATE fee_bands SET default_rate = ${moved} WHERE band_key = ${CONCIERGE_AI_TASK_BAND}
    `);
    assert.equal(await resolveAiTaskChargeCents(), moved, "the resolver follows the band, not a literal");
  } finally {
    await db.execute(sql`
      UPDATE fee_bands SET default_rate = ${band!.rate} WHERE band_key = ${CONCIERGE_AI_TASK_BAND}
    `);
  }
  assert.equal(await resolveAiTaskChargeCents(), Math.round(band!.rate), "and the fixture is restored");
});
