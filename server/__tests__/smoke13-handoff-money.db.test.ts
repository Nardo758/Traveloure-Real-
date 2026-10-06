/**
 * Smoke 13 (ledger `2026-10-06-smoke13-handoff-money`) — the handoff's money and routing repairs,
 * found on build 3ee2903 (request 56fd8286…, PI pi_3UNONpJZ5fFY5Q8L1qRbNy9g).
 *
 *   S1  a `charge.refunded` delivery for a RELEASED, never-captured hold (`captured: false`) writes
 *       NO refunds row — the phantom $53.50 "refund"; a real refund (`captured: true`) writes ONE
 *   S2  migration 355 marks a refund row on a never-captured handoff hold `voided_uncaptured`,
 *       leaves a captured handoff's refund and an unrelated refund untouched, deletes nothing, and
 *       a second run changes nothing
 *   S3  routing names only a ROUTABLE expert: Identity verified + Stripe Connect complete + not
 *       seed-sourced; an unverified, an unpayable and an `@example.com` expert are never routed
 *   S4  the traveler's handoff read names no expert before ACCEPT; the banner city is "Kyoto"
 *   S5  withdraw releases the hold with `requested_by_customer`; the banner reads the withdrawn
 *       state; the 48 h timer releases with `abandoned`
 *   S6  the hold's PaymentIntent names its request (`requestId` → metadata `handoffRequestId`)
 *   S7  the timers are idempotent: two runs a minute apart → ONE fallback offer, ONE release, ONE
 *       cancel
 *   S9  the public directory lists ROUTABLE experts only — never a Pending application, an
 *       unverified, unpayable or seed-sourced account, nor the pool; SHOW_DEMO_EXPERTS=1 relaxes the
 *       routable half (fixture/demo databases) and still never shows the pool
 *   S8  (addendum) the concierge POOL account is excluded from EVERY routing selector — lead
 *       routing, the handoff match and the expert door's candidates — even when it would otherwise
 *       be routable; it stays visible to the display scorer (it is reached as the fallback only)
 *
 * Stripe is not called: the webhook arm is driven with an embedded refund list (the
 * refund-merged-design pattern) and the handoff money calls go through the injected double.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/smoke13-handoff-money.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";

process.env.STRIPE_SECRET_KEY ||= "sk_test_smoke13";
const handoff = await import("../services/handoff.service");
const { projectHandoff } = await import("../routes/handoff.routes");
const { handoffBannerState, handoffCityName } = await import("../../shared/handoff");
const { leadRoutingService } = await import("../services/lead-routing.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `s13-${RUN}-owner`,
  ok: `s13-${RUN}-ok`,
  unverified: `s13-${RUN}-unv`,
  unpayable: `s13-${RUN}-unp`,
  seed: `s13-${RUN}-seed`,
  pool: `s13-${RUN}-pool`,
  pendingApp: `s13-${RUN}-pend`,
  poolListing: `s13-${RUN}-pool-svc`,
  okListing: `s13-${RUN}-ok-svc`,
  trip3: `s13-${RUN}-trip3`,
  trip: `s13-${RUN}-trip`,
  trip2: `s13-${RUN}-trip2`,
  item: `s13-${RUN}-item`,
  item2: `s13-${RUN}-item2`,
};
// A destination no other fixture covers, so the scorer's candidate set is exactly ours.
const CITY = `s13city${RUN}`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[smoke13] REFUSING to write fixtures to '${host}'.`);
}

// ── the Stripe double ──
const calls = { authorize: [] as any[], cancel: [] as Array<{ key: string; reason?: string }> };
const intents = new Map<string, { amount: number; status: string; metadata: Record<string, string> }>();
handoff.__setHandoffPaymentsForTest({
  async authorize(i) {
    calls.authorize.push(i);
    const id = `pi_${i.idempotencyKey}`;
    if (!intents.has(id)) intents.set(id, { amount: i.amountCents, status: "requires_capture", metadata: { type: "expert_handoff" } });
    return { clientSecret: `${id}_secret`, paymentIntentId: id, amountCents: i.amountCents };
  },
  async retrieve(id) {
    const pi = intents.get(id)!;
    return { id, status: pi.status, amountCents: pi.amount, amountCapturableCents: pi.status === "requires_capture" ? pi.amount : 0, metadata: pi.metadata };
  },
  async capture(id) {
    const pi = intents.get(id)!;
    pi.status = "succeeded";
    return { id, status: "succeeded", amountReceivedCents: pi.amount };
  },
  async cancel(id, key, reason) {
    calls.cancel.push({ key, reason });
    if (intents.has(id)) intents.get(id)!.status = "canceled";
    return { id, status: "canceled" };
  },
  async refund(i) {
    return { id: `re_${i.idempotencyKey}`, status: "succeeded" };
  },
});

const createdRequestIds: string[] = [];
const createdPis: string[] = [];

before(async () => {
  assertDisposableDb();
  const people: Array<[string, string, string | null, string | null]> = [
    // id, email, identity, connect
    [ids.owner, `${ids.owner}@t.test`, null, null],
    [ids.ok, `${ids.ok}@routable.invalid`, "verified", "complete"],
    [ids.unverified, `${ids.unverified}@routable.invalid`, "pending", "complete"],
    [ids.unpayable, `${ids.unpayable}@routable.invalid`, "verified", "pending"],
    [ids.seed, `${ids.seed}@example.com`, "verified", "complete"],
    [ids.pool, `${ids.pool}@routable.invalid`, "verified", "complete"],
    [ids.pendingApp, `${ids.pendingApp}@routable.invalid`, "verified", "complete"],
  ];
  for (const [id, email] of people) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id}, ${email}, 'S13', ${id.split("-").pop()}, 'local_expert')`);
  }
  for (const [id, , identity, connect] of people.slice(1)) {
    await db.execute(sql`
      INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, specialties,
                                      identity_verification_status, stripe_connect_status)
      VALUES (${`${id}-form`}, ${id}, 'S13', 'Fixture', ${`${id}@form.invalid`}, ${id === ids.pendingApp ? "pending" : "approved"}, ${JSON.stringify([CITY])}::jsonb, '[]'::jsonb,
              ${identity}, ${connect})
    `);
  }
  for (const [t, item] of [[ids.trip, ids.item], [ids.trip2, ids.item2]]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
      VALUES (${t}, ${ids.owner}, 'S13 plan', 'Kyoto, Japan', '2027-04-01', '2027-04-03', 'planning')`);
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, item_type, status)
      VALUES (${item}, ${t}, 'Yasaka Shrine', 1, 'activity', 'in_planning')`);
  }
});

after(async () => {
  for (const pi of createdPis) await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id IN (${ids.trip}, ${ids.trip2})`).catch(() => {});
  for (const id of createdRequestIds) await db.execute(sql`DELETE FROM expert_requests WHERE id = ${id}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${ids.trip}, ${ids.trip2})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.trip2})`).catch(() => {});
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip3}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip3}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip3}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${ids.poolListing}, ${ids.okListing})`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id IN (${ids.ok}, ${ids.unverified}, ${ids.unpayable}, ${ids.seed}, ${ids.pool}, ${ids.pendingApp})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.ok}, ${ids.unverified}, ${ids.unpayable}, ${ids.seed}, ${ids.pool}, ${ids.pendingApp})`).catch(() => {});
  handoff.__setHandoffPaymentsForTest(null);
});

function refundEvent(pi: string, captured: boolean, refundId: string, cents: number) {
  return {
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${pi}`,
        payment_intent: pi,
        amount: cents,
        amount_refunded: cents,
        captured,
        currency: "usd",
        refunds: { has_more: false, data: [{ id: refundId, amount: cents, status: "succeeded", currency: "usd", metadata: {} }] },
      },
    },
  } as any;
}

const refundRows = async (pi: string) =>
  (await db.execute(sql`SELECT stripe_refund_id, status FROM refunds WHERE stripe_payment_intent_id = ${pi} ORDER BY stripe_refund_id`)).rows as any[];

test("S1 a released hold's charge.refunded writes no refund; a real refund writes one", async () => {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  const held = `pi_s13_${RUN}_held`;
  const paid = `pi_s13_${RUN}_paid`;
  createdPis.push(held, paid);
  await stripePaymentService.handleWebhook(refundEvent(held, false, `re_s13_${RUN}_held`, 5350));
  assert.deepEqual(await refundRows(held), [], "a released hold is not a refund");
  await stripePaymentService.handleWebhook(refundEvent(paid, true, `re_s13_${RUN}_paid`, 5350));
  const rows = await refundRows(paid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "succeeded");
});

test("S2 migration 355 marks only a never-captured hold's refund, deletes nothing, and is idempotent", async () => {
  const held = `pi_s13_${RUN}_m_held`;
  const captured = `pi_s13_${RUN}_m_cap`;
  const unrelated = `pi_s13_${RUN}_m_other`;
  createdPis.push(held, captured, unrelated);
  for (const [pi, capturedAt] of [[held, null], [captured, new Date()]] as const) {
    const r = await db.execute(sql`
      INSERT INTO expert_requests (user_id, trip_id, request_type, status, handoff_kind, payment_intent_id, captured_at)
      VALUES (${ids.owner}, ${ids.trip2}, 'handoff_polish', 'withdrawn', 'polish', ${pi}, ${capturedAt}) RETURNING id
    `);
    createdRequestIds.push(String((r.rows[0] as any).id));
  }
  for (const pi of [held, captured, unrelated]) {
    await db.execute(sql`INSERT INTO refunds (stripe_refund_id, stripe_payment_intent_id, amount, currency, status)
      VALUES (${`re_${pi}`}, ${pi}, 53.50, 'usd', 'succeeded')`);
  }
  const migration = fs.readFileSync(path.resolve(import.meta.dirname, "../migrations/355_refunds_voided_uncaptured.sql"), "utf8");
  await db.execute(sql.raw(migration));
  const first = await db.execute(sql.raw(migration));
  assert.equal((first as any).rowCount ?? 0, 0, "a second run updates nothing");
  assert.deepEqual((await refundRows(held)).map((r) => r.status), ["voided_uncaptured"]);
  assert.deepEqual((await refundRows(captured)).map((r) => r.status), ["succeeded"]);
  assert.deepEqual((await refundRows(unrelated)).map((r) => r.status), ["succeeded"]);
});

test("S3 routing names only a verified, payable, non-seed expert", async () => {
  const routed = await leadRoutingService.routeLead({ destination: CITY });
  const named = (routed.scores ?? []).map((s) => s.expertId);
  assert.ok(named.includes(ids.ok), JSON.stringify(named));
  for (const no of [ids.unverified, ids.unpayable, ids.seed, ids.pendingApp]) assert.ok(!named.includes(no), `${no} must never be routed`);
  // A display read (content matching) is unchanged — routability is a ROUTING rule.
  const display = (await leadRoutingService.scoreExperts({ destination: CITY })).map((s) => s.expertId);
  assert.ok(display.includes(ids.unverified));
});

test("S4 + S6 no expert is named before accept; the banner city is the city name; the hold names its request", async () => {
  const out = await handoff.askHandoff({ tripId: ids.trip, userId: ids.owner, kind: "polish", itemIds: [ids.item] });
  assert.ok("ok" in out && out.ok, JSON.stringify(out));
  const requestId = (out as any).request.id as string;
  createdRequestIds.push(requestId);
  assert.equal(calls.authorize.at(-1)?.requestId, requestId, "the authorize call carries the request id");
  await handoff.confirmHandoffAuthorization(requestId, ids.owner);
  await handoff.adminAssignHandoff(requestId, ids.ok);
  const row = (await handoff.getHandoff(requestId))!;
  assert.equal(row.assignedExpertId, ids.ok);
  const before = projectHandoff(row, { expertName: "Named Person" })!;
  assert.equal(before.expertName, null);
  assert.equal(before.expertId, null);
  assert.equal(handoffCityName(row.destinationCity), "Kyoto");
  assert.deepEqual(handoffBannerState({ status: row.status, city: handoffCityName(row.destinationCity) }), { kind: "finding", city: "Kyoto" });
  const accepted = projectHandoff({ ...row, acceptedAt: new Date() } as any, { expertName: "Named Person" })!;
  assert.equal(accepted.expertName, "Named Person");
});

test("S5 withdraw releases the hold as requested_by_customer and reads the withdrawn state", async () => {
  const live = (await handoff.getTripHandoff(ids.trip))!;
  const w = await handoff.withdrawHandoff(live.id, ids.owner);
  assert.ok("ok" in w && w.ok);
  assert.equal(calls.cancel.at(-1)?.reason, "requested_by_customer");
  const after = (await handoff.getHandoff(live.id))!;
  assert.deepEqual(handoffBannerState({ status: after.status, capturedAt: after.capturedAt }), { kind: "withdrawn", holdReleased: true });
});

test("S7 timers are idempotent: one fallback offer, one release, one cancel (abandoned)", async () => {
  const out = await handoff.askHandoff({ tripId: ids.trip, userId: ids.owner, kind: "polish", itemIds: [ids.item] });
  assert.ok("ok" in out && out.ok, JSON.stringify(out));
  const requestId = (out as any).request.id as string;
  createdRequestIds.push(requestId);
  await handoff.confirmHandoffAuthorization(requestId, ids.owner);
  // Authorized 30 h ago: past the 24 h fallback, not the 48 h release.
  await db.execute(sql`UPDATE expert_requests SET authorized_at = NOW() - INTERVAL '30 hours', status = 'proposed' WHERE id = ${requestId}`);
  const cancelsBefore = calls.cancel.length;
  const a = await handoff.runHandoffTimers();
  const b = await handoff.runHandoffTimers(new Date(Date.now() + 60_000));
  const offers = (await db.execute(sql`SELECT fallback_offered_at FROM expert_requests WHERE id = ${requestId}`)).rows[0] as any;
  assert.ok(offers.fallback_offered_at, "the fallback was offered");
  assert.ok(a.fallbackOffered >= 1 && b.fallbackOffered === 0, `${JSON.stringify(a)} ${JSON.stringify(b)}`);
  // Now 50 h: the release fires once.
  await db.execute(sql`UPDATE expert_requests SET authorized_at = NOW() - INTERVAL '50 hours' WHERE id = ${requestId}`);
  const c = await handoff.runHandoffTimers();
  const d = await handoff.runHandoffTimers(new Date(Date.now() + 60_000));
  assert.ok(c.released >= 1 && d.released === 0, `${JSON.stringify(c)} ${JSON.stringify(d)}`);
  const mine = calls.cancel.slice(cancelsBefore).filter((x) => x.key === `handoff-release-${requestId}`);
  assert.equal(mine.length, 1, "one cancel for one release");
  assert.equal(mine[0].reason, "abandoned");
});

test("S8 the concierge pool account is excluded from every routing selector, and reached only as the fallback", async () => {
  const { invalidatePlatformConciergeCache, PLATFORM_CONCIERGE_USER_ID_SETTING_KEY } = await import("../services/platform-concierge.service");
  const prev = (await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`)).rows[0] as any;
  const setPool = async (v: string | null) => {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
    if (v !== null) await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}, ${v})`);
    invalidatePlatformConciergeCache();
  };
  try {
    // The fixture pool account is verified, payable and covers CITY — routable in every other way.
    await setPool(ids.pool);

    // (1) lead routing
    const routed = (await leadRoutingService.routeLead({ destination: CITY })).scores.map((x) => x.expertId);
    assert.ok(!routed.includes(ids.pool), "lead routing never names the pool account");
    assert.ok(routed.includes(ids.ok));
    const display = (await leadRoutingService.scoreExperts({ destination: CITY })).map((x) => x.expertId);
    assert.ok(display.includes(ids.pool), "the display scorer still sees it (it is not hidden, only never routed)");

    // (2) the handoff match
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
      VALUES (${ids.trip3}, ${ids.owner}, 'S13 pool plan', ${CITY}, '2027-04-01', '2027-04-03', 'planning')`);
    const r = await db.execute(sql`
      INSERT INTO expert_requests (user_id, trip_id, destination_city, request_type, status, handoff_kind, scope_item_ids, fee_cents, traveler_fee_cents, change_rounds, authorized_at)
      VALUES (${ids.owner}, ${ids.trip3}, ${CITY}, 'handoff_polish', 'proposed', 'polish', '[]'::jsonb, 0, 0, 0, NOW()) RETURNING id
    `);
    const requestId = String((r.rows[0] as any).id);
    await handoff.matchHandoff(requestId);
    const matched = (await handoff.getHandoff(requestId))!;
    assert.notEqual(matched.assignedExpertId, ids.pool, "the handoff is never proposed to the pool account");
    assert.equal(matched.assignedExpertId, ids.ok);

    // (3) the expert door's candidates (every listing the door could show, before its byline gate)
    const { loadCandidates } = await import("../services/expert-door.service");
    for (const [id, owner] of [[ids.poolListing, ids.pool], [ids.okListing, ids.ok]] as const) {
      await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, expert_offering_type_key, city)
        VALUES (${id}, ${owner}, 'S13 help', '40.00', 'active', 'approved', 'ask_me_anything', 'Kyoto')`);
    }
    const door = (await loadCandidates("kyoto")).map((c) => c.expertId);
    assert.ok(!door.includes(ids.pool), "the expert door never offers the pool account");
    assert.ok(door.includes(ids.ok));
  } finally {
    await setPool(prev?.setting_value ?? null);
  }
});

test("S9 the directory lists routable experts only, never the pool; the demo switch relaxes routability only", async () => {
  const { directoryExperts } = await import("../services/expert-routability");
  const { invalidatePlatformConciergeCache, PLATFORM_CONCIERGE_USER_ID_SETTING_KEY } = await import("../services/platform-concierge.service");
  const prev = (await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`)).rows[0] as any;
  const setPool = async (v: string | null) => {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
    if (v !== null) await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}, ${v})`);
    invalidatePlatformConciergeCache();
  };
  const all = [ids.ok, ids.unverified, ids.unpayable, ids.seed, ids.pool, ids.pendingApp].map((id) => ({ id }));
  const prevDemo = process.env.SHOW_DEMO_EXPERTS;
  try {
    await setPool(ids.pool);
    delete process.env.SHOW_DEMO_EXPERTS;
    assert.deepEqual((await directoryExperts(all)).map((e) => e.id), [ids.ok]);
    process.env.SHOW_DEMO_EXPERTS = "1";
    const demo = (await directoryExperts(all)).map((e) => e.id);
    assert.ok(!demo.includes(ids.pool), "the pool account is never listed, demo or not");
    assert.ok(demo.includes(ids.unverified));
  } finally {
    if (prevDemo === undefined) delete process.env.SHOW_DEMO_EXPERTS;
    else process.env.SHOW_DEMO_EXPERTS = prevDemo;
    await setPool(prev?.setting_value ?? null);
  }
});
