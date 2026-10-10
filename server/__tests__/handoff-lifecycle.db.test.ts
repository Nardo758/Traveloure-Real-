/**
 * Step 7b (R323) — the handoff, end to end, at the service seam (surface spec §12; R-n, R-q, R-s, R-t,
 * R-bd). CI's Stripe key is a stub, so the money calls run through an injected `HandoffPayments`
 * double that records every authorize / capture / cancel / refund — the assertions are on what the
 * lifecycle ASKED Stripe to do, and on the rows it wrote.
 *
 *   H1  Ask → authorized, NOT captured; routing proposes; admin override names the expert
 *   H2  the expert accepts → captured exactly once (a repeat accept captures nothing more); the
 *       advisor row is write-status; the scoped items move to `with_expert`
 *   H3  the expert's item write through the REAL route becomes a suggestion (202), nothing written
 *   H4  two suggestions — one accepted (the item changes), one declined (it does not)
 *   H5  deliver is refused while a suggestion is open, then succeeds
 *   H6  approve → the expert is paid (a HELD earning; the revenue row re-split), the pen returns
 *       (advisor row read-only, scope back to `in_planning`), `post_handoff` opens
 *   H7  withdraw before accept releases the hold and keeps nothing; after accept refunds the fee
 *       less the band share, the traveler fee in proportion
 *   H8  timers: fallback offered at 24 h, hold released at 48 h, auto-approve after 7 days
 *   R1  Ready Made revision: a prepaid handoff (no hold); the author's change arrives as a
 *       suggestion and the author cannot write the copy directly
 *
 * NEGATIVE SPACE (§18d): Stripe itself is not exercised (the double stands in); the client chooser
 * and banner are not driven here.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/handoff-lifecycle.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { insertRoutableExpertForm } from "./helpers/routable-expert";

process.env.STRIPE_SECRET_KEY ||= "sk_test_handoff_lifecycle";
const handoff = await import("../services/handoff.service");
const suggestions = await import("../services/expert-suggestions.service");
const { feedbackState } = await import("../services/feedback.service");
const tripsRoutes = (await import("../routes/trips.routes")).default;
const readyMadeRoutes = (await import("../routes/ready-made.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `ho-${RUN}-owner`,
  expert: `ho-${RUN}-expert`,
  author: `ho-${RUN}-author`,
  trip: `ho-${RUN}-trip`,
  trip2: `ho-${RUN}-trip2`,
  trip3: `ho-${RUN}-trip3`,
  a: `ho-${RUN}-a`,
  b: `ho-${RUN}-b`,
  c: `ho-${RUN}-c`,
  w: `ho-${RUN}-w`,
  x: `ho-${RUN}-x`,
  srcTrip: `ho-${RUN}-src`,
  listing: `ho-${RUN}-listing`,
  purchase: `ho-${RUN}-purchase`,
  clone: `ho-${RUN}-clone`,
  ca: `ho-${RUN}-ca`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[handoff-lifecycle] REFUSING to write fixtures to '${host}'.`);
}

// ── the Stripe double ──
const calls = { authorize: [] as any[], capture: [] as string[], cancel: [] as string[], refund: [] as any[] };
const intents = new Map<string, { amount: number; status: string; metadata: Record<string, string> }>();
handoff.__setHandoffPaymentsForTest({
  async authorize(i) {
    calls.authorize.push(i);
    const id = `pi_${i.idempotencyKey}`;
    if (!intents.has(id)) intents.set(id, { amount: i.amountCents, status: "requires_payment_method", metadata: { type: "expert_handoff" } });
    return { clientSecret: `${id}_secret`, paymentIntentId: id, amountCents: i.amountCents };
  },
  async retrieve(id) {
    const pi = intents.get(id)!;
    return { id, status: pi.status, amountCents: pi.amount, amountCapturableCents: pi.status === "requires_capture" ? pi.amount : 0, metadata: pi.metadata };
  },
  async capture(id, key) {
    calls.capture.push(key);
    const pi = intents.get(id)!;
    pi.status = "succeeded";
    return { id, status: "succeeded", amountReceivedCents: pi.amount };
  },
  async cancel(id, key) {
    calls.cancel.push(key);
    intents.get(id)!.status = "canceled";
    return { id, status: "canceled" };
  },
  async refund(i) {
    calls.refund.push(i);
    return { id: `re_${i.idempotencyKey}`, status: "succeeded" };
  },
});
/** The traveler's card confirms the hold (what Stripe.js does client-side). */
function cardConfirms(piId: string) {
  intents.get(piId)!.status = "requires_capture";
}

async function request(userId: string, method: "PATCH" | "POST" | "DELETE", url: string, body?: unknown, router: any = tripsRoutes) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "T" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const one = async <T = any>(q: any): Promise<T> => ((await db.execute(q)).rows?.[0] as T);

before(async () => {
  assertDisposableDb();
  for (const id of [ids.owner, ids.expert, ids.author]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${id}, ${`${id}@t.test`}, 'Ho', ${id.split("-").pop()})`);
  }
  // B3 (sanctioned fixture edit): the one advisor author takes a NEW advisor only when routable.
  for (const id of [ids.expert, ids.author]) await insertRoutableExpertForm(id);
  for (const t of [ids.trip, ids.trip2, ids.trip3]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
      VALUES (${t}, ${ids.owner}, 'Kyoto days', 'Kyoto, Japan', '2027-05-01', '2027-05-03')`);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status, estimated_cost) VALUES
    (${ids.a}, ${ids.trip}, 'Fushimi Inari', 1, 0, 'in_planning', 0),
    (${ids.b}, ${ids.trip}, 'Tea ceremony', 1, 1, 'in_planning', 80),
    (${ids.c}, ${ids.trip}, 'Gion walk', 2, 0, 'in_planning', 0),
    (${ids.w}, ${ids.trip2}, 'Arashiyama', 1, 0, 'in_planning', 0),
    (${ids.x}, ${ids.trip3}, 'Nishiki market', 1, 0, 'in_planning', 0)`);
  // Ready Made: a source build, its listing, the buyer's clone and the purchase.
  await db.execute(sql`INSERT INTO trips (id, author_id, title, destination, start_date, end_date, status)
    VALUES (${ids.srcTrip}, ${ids.author}, 'RMT build', 'Kyoto, Japan', '2027-05-01', '2027-05-01', 'draft')`);
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, plan_type, price_cents, pricing_mode, status)
    VALUES (${ids.listing}, ${ids.author}, ${ids.srcTrip}, 'Kyoto', 'Kyoto in a day', 1, 'city_itinerary', 3900, 'fixed', 'approved')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.clone}, ${ids.owner}, 'Kyoto in a day', 'Kyoto, Japan', '2027-06-01', '2027-06-01')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status)
    VALUES (${ids.ca}, ${ids.clone}, 'Philosopher''s Path', 1, 0, 'in_planning')`);
  await db.execute(sql`INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id, status, clone_trip_id)
    VALUES (${ids.purchase}, ${ids.owner}, ${ids.listing}, 3900, ${`pi_rmt_${RUN}`}, 'cloned', ${ids.clone})`);
});

after(async () => {
  const trips = [ids.trip, ids.trip2, ids.trip3, ids.clone, ids.srcTrip];
  await db.execute(sql`DELETE FROM expert_suggestions WHERE trip_id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)})`);
  const pis = (await db.execute(sql`SELECT payment_intent_id FROM expert_requests WHERE trip_id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)}) AND payment_intent_id IS NOT NULL`)).rows?.map((r: any) => r.payment_intent_id) ?? [];
  if (pis.length) {
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id IN (${sql.join(pis.map((p) => sql`${p}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id IN (${sql.join(pis.map((p) => sql`${p}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM fee_ledger WHERE source_id IN (${sql.join(pis.map((p) => sql`${p}`), sql`, `)})`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)})`);
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${ids.purchase}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  for (const t of trips) await db.execute(sql`DELETE FROM trips WHERE id = ${t}`);
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${ids.owner}, ${ids.expert}, ${ids.author})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert}, ${ids.author})`);
});

let requestId = "";
let piId = "";

test("H1: Ask authorizes and does not capture; routing proposes; admin names the expert", async () => {
  const quote = await handoff.quoteHandoff({ tripId: ids.trip, kind: "polish", itemIds: [ids.a, ids.b] });
  assert.ok(!("ok" in quote));
  assert.ok((quote as any).feeCents > 0, "the fee comes from the expert-review band");

  const out = await handoff.askHandoff({ tripId: ids.trip, userId: ids.owner, kind: "polish", itemIds: [ids.a, ids.b] });
  assert.ok(out.ok, JSON.stringify(out));
  requestId = (out as any).request.id;
  assert.equal((out as any).request.status, "authorizing");
  assert.ok((out as any).clientSecret, "the hold's client secret comes back");
  piId = (out as any).request.paymentIntentId;
  assert.equal(calls.authorize.length, 1);
  assert.equal(calls.authorize[0].amountCents, (quote as any).totalCents, "the hold is the quoted total, server-derived");

  // A second ask on the same plan is refused while this one is live.
  const again = await handoff.askHandoff({ tripId: ids.trip, userId: ids.owner, kind: "book", itemIds: [ids.a] });
  assert.equal((again as any).code, "handoff_in_progress");

  // Not yet authorized: the confirm is refused until the card holds.
  const early = await handoff.confirmHandoffAuthorization(requestId, ids.owner);
  assert.equal((early as any).code, "not_authorized");
  cardConfirms(piId);
  const confirmed = await handoff.confirmHandoffAuthorization(requestId, ids.owner);
  assert.ok(confirmed.ok);
  const row = await handoff.getHandoff(requestId);
  assert.ok(row!.authorizedAt);
  assert.ok(row!.status === "proposed" || row!.status === "unmatched");

  const assigned = await handoff.adminAssignHandoff(requestId, ids.expert);
  assert.ok(assigned.ok);
  const proposed = await handoff.getHandoff(requestId);
  assert.equal(proposed!.status, "proposed");
  assert.equal(proposed!.assignedExpertId, ids.expert);
  assert.equal(calls.capture.length, 0, "nothing is captured before the expert accepts (R-q)");
  const adv = await one<any>(sql`SELECT status FROM trip_expert_advisors WHERE trip_id = ${ids.trip} AND local_expert_id = ${ids.expert}`);
  assert.equal(adv.status, "pending", "a proposal grants READ only");
});

test("H2: the expert accepts → captured once; write-status advisor; scope moves to with_expert", async () => {
  const out = await handoff.acceptHandoff(requestId, ids.expert);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(calls.capture, [`handoff-capture-${requestId}`]);
  const again = await handoff.acceptHandoff(requestId, ids.expert);
  assert.ok(again.ok);
  assert.equal(calls.capture.length, 1, "a repeat accept captures nothing more");
  const row = await handoff.getHandoff(requestId);
  assert.equal(row!.status, "accepted");
  assert.ok(row!.capturedAt);
  const adv = await one<any>(sql`SELECT status FROM trip_expert_advisors WHERE trip_id = ${ids.trip} AND local_expert_id = ${ids.expert}`);
  assert.equal(adv.status, "accepted");
  const scoped = (await db.execute(sql`SELECT id, routing_status FROM itinerary_items WHERE trip_id = ${ids.trip} ORDER BY sort_order, day_number`)).rows as any[];
  const by = Object.fromEntries(scoped.map((r) => [r.id, r.routing_status]));
  assert.equal(by[ids.a], "with_expert");
  assert.equal(by[ids.b], "with_expert");
  assert.equal(by[ids.c], "in_planning", "an unscoped item stays the traveler's");
  const rev = await one<any>(sql`SELECT gross_amount, expert_id FROM platform_revenue WHERE source_id = ${piId} AND source_type = 'expert_review_fee'`);
  assert.ok(rev, "the captured fee is revenue");
  assert.equal(rev.expert_id, null, "unsplit until approval");
});

test("H3: the expert's write through the route becomes a suggestion; nothing is written", async () => {
  const res = await request(ids.expert, "PATCH", `/api/trips/${ids.trip}/itinerary-items/${ids.a}`, { title: "Fushimi Inari at dawn" });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  assert.equal(res.body.suggested, true);
  assert.equal(res.body.suggestion.kind, "edit");
  assert.equal(res.body.suggestion.requestId, requestId, "the suggestion names the handoff");
  const item = await one<any>(sql`SELECT title FROM itinerary_items WHERE id = ${ids.a}`);
  assert.equal(item.title, "Fushimi Inari", "the plan is untouched until the traveler accepts");

  const del = await request(ids.expert, "DELETE", `/api/trips/${ids.trip}/itinerary-items/${ids.c}`);
  assert.equal(del.status, 202);
  const still = await one<any>(sql`SELECT id FROM itinerary_items WHERE id = ${ids.c}`);
  assert.ok(still, "a suggested removal removes nothing");
});

test("H4: one suggestion accepted, one declined", async () => {
  const pending = await suggestions.listExpertSuggestions(ids.trip, { pendingOnly: true });
  const edit = pending.find((s) => s.kind === "edit")!;
  const remove = pending.find((s) => s.kind === "remove")!;
  const ok = await suggestions.resolveExpertSuggestion(ids.trip, edit.id, "accept");
  assert.ok(ok.ok);
  assert.equal((await one<any>(sql`SELECT title FROM itinerary_items WHERE id = ${ids.a}`)).title, "Fushimi Inari at dawn");
  const no = await suggestions.resolveExpertSuggestion(ids.trip, remove.id, "decline");
  assert.ok(no.ok);
  assert.ok(await one(sql`SELECT id FROM itinerary_items WHERE id = ${ids.c}`), "declined: the stop stays");
  const twice = await suggestions.resolveExpertSuggestion(ids.trip, edit.id, "accept");
  assert.equal((twice as any).code, "not_pending", "an answer is given once");
  // Another plan's suggestion is not reachable through this plan.
  const cross = await suggestions.resolveExpertSuggestion(ids.trip2, edit.id, "accept");
  assert.equal((cross as any).code, "not_found");
});

test("H5: deliver is refused while a suggestion is open", async () => {
  const s = await suggestions.fileExpertSuggestion({ tripId: ids.trip, expertId: ids.expert, kind: "add", payload: { item: { title: "Kaiseki dinner", dayNumber: 2 } } });
  const refused = await handoff.deliverHandoff(requestId, ids.expert);
  assert.equal((refused as any).code, "open_suggestions");
  const acc = await suggestions.resolveExpertSuggestion(ids.trip, s.id, "accept");
  assert.ok(acc.ok);
  const added = await one<any>(sql`SELECT origin, suggested_by FROM itinerary_items WHERE trip_id = ${ids.trip} AND title = 'Kaiseki dinner'`);
  assert.equal(added.origin, "expert");
  const out = await handoff.deliverHandoff(requestId, ids.expert, { offerOnTripSupport: true });
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal((await handoff.getHandoff(requestId))!.status, "delivered");
});

test("H6: approve pays the expert and returns the pen", async () => {
  const out = await handoff.approveHandoff(requestId, "traveler", ids.owner);
  assert.ok(out.ok, JSON.stringify(out));
  const row = await handoff.getHandoff(requestId);
  assert.equal(row!.status, "approved");
  assert.equal(row!.approvedBy, "traveler");
  const rev = await one<any>(sql`SELECT expert_id, expert_earnings FROM platform_revenue WHERE source_id = ${piId} AND source_type = 'expert_review_fee'`);
  assert.equal(rev.expert_id, ids.expert, "the revenue row is re-split on approval");
  const earning = await one<any>(sql`SELECT status, amount FROM expert_earnings WHERE expert_id = ${ids.expert} AND reference_id = ${piId}`);
  assert.equal(earning.status, "held", "the expert's pay is a held earning (escrow)");
  assert.ok(Number(earning.amount) > 0);
  const adv = await one<any>(sql`SELECT status FROM trip_expert_advisors WHERE trip_id = ${ids.trip} AND local_expert_id = ${ids.expert}`);
  assert.equal(adv.status, "pending", "the pen returns: the advisor is read-only again");
  assert.equal((await one<any>(sql`SELECT routing_status FROM itinerary_items WHERE id = ${ids.a}`)).routing_status, "in_planning");
  const fb = await feedbackState(ids.trip, ids.owner);
  assert.ok(fb.open.includes("post_handoff"));
  const paidAgain = await handoff.approveHandoff(requestId, "auto");
  assert.ok(paidAgain.ok);
  const n = await one<any>(sql`SELECT count(*)::int AS n FROM expert_earnings WHERE expert_id = ${ids.expert} AND reference_id = ${piId}`);
  assert.equal(n.n, 1, "approval pays once");
});

test("H7: withdraw — before accept nothing is kept; after accept the band share is kept", async () => {
  const before1 = await handoff.askHandoff({ tripId: ids.trip2, userId: ids.owner, kind: "polish", itemIds: [ids.w] });
  assert.ok(before1.ok);
  const id1 = (before1 as any).request.id;
  cardConfirms((before1 as any).request.paymentIntentId);
  await handoff.confirmHandoffAuthorization(id1, ids.owner);
  const w1 = await handoff.withdrawHandoff(id1, ids.owner);
  assert.ok(w1.ok);
  assert.equal((w1 as any).keptCents, 0);
  assert.ok(calls.cancel.includes(`handoff-withdraw-${id1}`), "the hold is released");

  const ask2 = await handoff.askHandoff({ tripId: ids.trip2, userId: ids.owner, kind: "polish", itemIds: [ids.w] });
  assert.ok(ask2.ok, JSON.stringify(ask2));
  const id2 = (ask2 as any).request.id;
  cardConfirms((ask2 as any).request.paymentIntentId);
  await handoff.confirmHandoffAuthorization(id2, ids.owner);
  await handoff.adminAssignHandoff(id2, ids.expert);
  await handoff.acceptHandoff(id2, ids.expert);
  const row = (await handoff.getHandoff(id2))!;
  const w2 = await handoff.withdrawHandoff(id2, ids.owner);
  assert.ok(w2.ok, JSON.stringify(w2));
  const band = await one<any>(sql`SELECT default_rate FROM fee_bands WHERE band_key = 'handoff_withdrawal_accepted' AND is_active = true`);
  const expectedKept = band ? Math.round((row.feeCents ?? 0) * Number(band.default_rate)) : 0;
  assert.equal((w2 as any).keptCents, expectedKept, "kept = the band's share of the fee");
  assert.equal(
    (w2 as any).refundedCents,
    handoff.withdrawalRefundCents(row.feeCents ?? 0, row.travelerFeeCents ?? 0, expectedKept),
  );
  const again = await handoff.withdrawHandoff(id2, ids.owner);
  assert.ok(again.ok);
  assert.equal(calls.refund.filter((r) => r.requestId === id2).length, 1, "a repeat withdraw refunds once");
});

test("H8: timers — fallback at 24 h, release at 48 h, auto-approve after 7 days", async () => {
  const ask = await handoff.askHandoff({ tripId: ids.trip3, userId: ids.owner, kind: "polish", itemIds: [ids.x] });
  assert.ok(ask.ok);
  const id = (ask as any).request.id;
  cardConfirms((ask as any).request.paymentIntentId);
  await handoff.confirmHandoffAuthorization(id, ids.owner);
  await db.execute(sql`UPDATE expert_requests SET status = 'unmatched', assigned_expert_id = NULL, authorized_at = NOW() - INTERVAL '25 hours' WHERE id = ${id}`);
  await handoff.runHandoffTimers();
  let row = (await handoff.getHandoff(id))!;
  assert.ok(row.fallbackOfferedAt, "fallback offered at 24 h");
  assert.equal(row.status, "unmatched");
  await db.execute(sql`UPDATE expert_requests SET authorized_at = NOW() - INTERVAL '49 hours' WHERE id = ${id}`);
  await handoff.runHandoffTimers();
  row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "released");
  assert.ok(calls.cancel.includes(`handoff-release-${id}`), "the hold is released at 48 h");

  // Auto-approve: a delivered handoff 8 days old approves itself.
  const ask2 = await handoff.askHandoff({ tripId: ids.trip3, userId: ids.owner, kind: "polish", itemIds: [ids.x] });
  assert.ok(ask2.ok);
  const id2 = (ask2 as any).request.id;
  cardConfirms((ask2 as any).request.paymentIntentId);
  await handoff.confirmHandoffAuthorization(id2, ids.owner);
  await handoff.adminAssignHandoff(id2, ids.expert);
  await handoff.acceptHandoff(id2, ids.expert);
  await handoff.deliverHandoff(id2, ids.expert);
  await db.execute(sql`UPDATE expert_requests SET delivered_at = NOW() - INTERVAL '8 days' WHERE id = ${id2}`);
  await handoff.runHandoffTimers();
  row = (await handoff.getHandoff(id2))!;
  assert.equal(row.status, "approved");
  assert.equal(row.approvedBy, "auto");
});

test("R1: Ready Made revision — a prepaid handoff; the author's change is a suggestion", async () => {
  const res = await request(ids.owner, "POST", `/api/ready-made/purchases/${ids.purchase}/request-revision`, { note: "Swap the afternoon" }, readyMadeRoutes);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = await handoff.getTripHandoff(ids.clone);
  assert.ok(row);
  assert.equal(row!.sourcePurchaseId, ids.purchase);
  assert.equal(row!.feeCents, 0, "prepaid: price 0");
  assert.equal(row!.paymentIntentId, null, "no hold on a prepaid handoff");
  assert.equal(row!.status, "accepted");
  assert.equal(row!.assignedExpertId, ids.author);

  const write = await request(ids.author, "PATCH", `/api/trips/${ids.clone}/itinerary-items/${ids.ca}`, { title: "Philosopher's Path at dusk" });
  assert.equal(write.status, 202, JSON.stringify(write.body));
  const item = await one<any>(sql`SELECT title FROM itinerary_items WHERE id = ${ids.ca}`);
  assert.equal(item.title, "Philosopher's Path", "the author cannot write the copy directly");
  const pending = await suggestions.listExpertSuggestions(ids.clone, { pendingOnly: true });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].expertId, ids.author);
});
