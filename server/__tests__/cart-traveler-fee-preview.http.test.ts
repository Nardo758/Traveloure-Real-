/**
 * THE TRAVELER SERVICE FEE IS SHOWN BEFORE CHECKOUT (ledger `2026-09-27-service-fee-before-checkout`,
 * R144; decision-maker ruled Sep 27, 2026).
 *
 * `GET /api/cart` carries a READ-ONLY `travelerFeePreview` block, resolved per line through the SAME
 * `resolveTravelerServiceFeeSnapshot` the checkout charge loop calls (§18 rule 1), over the server's
 * own cart rows (§14). The cart page and the slip's Finish card read it before checkout.
 *
 *   V1  THE CART READ CARRIES THE PREVIEW, AND IT IS THE CHARGE'S OWN FIGURE. Each line's `charged`,
 *       `wouldHaveBeen` and `capApplied` equal `resolveTravelerServiceFeeSnapshot(price, null)` for
 *       the same line; the totals are the sum; the rate and cap are the band's. (FAILS ON main: the
 *       block does not exist there.)
 *   V2  THE PER-BOOKING CAP IS APPLIED PER LINE. A line priced above the band's cap threshold is
 *       charged exactly the band's `max_amount` and says `capApplied`.
 *   V3  `byTrip` GROUPS BY THE LINE'S OWN PLAN — the slip's figure — and a line on no plan is in the
 *       cart total and in no plan's group.
 *   V4  A LINE THAT CANNOT BE CHARGED IS NOT FEED: a priceless legacy row is named by the cart read
 *       (`unpriceableItemIds`) and is absent from the preview's lines.
 *   V5  §13 — NO ANSWER IS NOT $0: an empty cart carries NO block, and a cart whose band is
 *       unresolvable (the band row deactivated) carries NO block — never a zero fee.
 *   V6  THE TRIP PASS WAIVER, STATED AS WAIVED: the ONE builder, handed the `trip_pass` basis, answers
 *       `charged: 0`, `waived: true` and the real `wouldHaveBeen` — byte-equal to the snapshot the
 *       charge would stamp. (V8 proves the cart read hands it the charge's own per-line basis.)
 *   V7  `total` IS UNCHANGED: the preview is disclosed beside it, never folded into it.
 *   V8  THE CART READ PREVIEWS THE CHARGE'S OWN TRIP PASS BASIS (R148, ledger
 *       `2026-09-27-trip-pass-waiver-per-line`): a line on the buyer's OWN covered plan previews as
 *       waived; a standalone line and a line on SOMEONE ELSE's covered trip do not — the same
 *       per-line, owner-verified `resolveTripPassCoveredTripIds` the checkout calls.
 *
 * NO FEE LITERALS (§8): every expected figure is read off the `fee_bands` row or computed by the
 * resolver itself. SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY.
 *
 * Run solo: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *   server/__tests__/cart-traveler-fee-preview.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { readBand, resolveTravelerServiceFeeSnapshot } from "../services/fee-resolution.service";
import { TRAVELER_SERVICE_FEE_BAND } from "../services/fee-band-requirements";
import { buildTravelerFeePreview } from "../services/traveler-fee-preview.service";
import { grantTripPass } from "../services/trip-entitlement.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `feepv-${RUN}-buyer@t.test`;
const ids = {
  provider: `feepv-${RUN}-prov`,
  small: `feepv-${RUN}-svc-small`,
  big: `feepv-${RUN}-svc-big`,
  priceless: `feepv-${RUN}-svc-null`,
  trip: `feepv-${RUN}-trip`,
  lineSmall: `feepv-${RUN}-line-small`,
  lineBig: `feepv-${RUN}-line-big`,
  lineNoTrip: `feepv-${RUN}-line-notrip`,
  foreignUser: `feepv-${RUN}-foreign`,
  foreignTrip: `feepv-${RUN}-trip-foreign`,
  lineForeign: `feepv-${RUN}-line-foreign`,
  linePriceless: `feepv-${RUN}-line-null`,
};
let buyerId = "";
let buyerCookie = "";
let rate = 0;
let cap = 0;
let smallPrice = 0;
let bigPrice = 0;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(`[cart-fee-preview] REFUSING to write fixtures on '${host ?? "<none>"}'. Set JOURNEY_DB_WRITES_OK=1.`);
  }
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function makeService(id: string, price: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, booking_mode)
    VALUES (${id}, ${ids.provider}, ${`Fee preview ${RUN}`}, 'fixture', ${price}, 'active', 'approved', 'video', 'instant')
  `);
}

async function addLine(id: string, serviceId: string, tripId: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity, trip_id)
    VALUES (${id}, ${buyerId}, ${serviceId}, 1, ${tripId})
  `);
}

async function getCart(): Promise<any> {
  const res = await api("/api/cart", buyerCookie);
  assert.equal(res.status, 200, `GET /api/cart → ${res.status}`);
  return res.json();
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const band = await readBand(TRAVELER_SERVICE_FEE_BAND);
  assert.ok(band, "the traveler_service_fee band must be seeded (migrations)");
  assert.ok(band!.rate > 0, "the band must carry a positive rate");
  assert.ok(band!.maxAmount !== null && band!.maxAmount > 0, "V2 needs the band's per-booking cap");
  rate = band!.rate;
  cap = band!.maxAmount!;
  // Derived from the band, never typed (§8): one price whose fee is half the cap, one at triple it.
  smallPrice = Math.round((cap / rate / 2) * 100) / 100;
  bigPrice = Math.round((cap / rate) * 3 * 100) / 100;

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Fee",
    lastName: "Preview",
  });
  if (reg.status !== 201) assert.fail(`register failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  buyerCookie = reg.headers.get("set-cookie")!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`feepv-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);
  await makeService(ids.small, smallPrice.toFixed(2));
  await makeService(ids.big, bigPrice.toFixed(2));
  await makeService(ids.priceless, null);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${buyerId}, 'Fee preview trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${ids.trip}, ${ids.foreignTrip})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.foreignTrip})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.foreignUser}`);
    await db.execute(sql`DELETE FROM provider_services WHERE id IN (${ids.small}, ${ids.big}, ${ids.priceless})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.provider}`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`);
  } finally {
    await pool.end();
  }
});

test("V5a an empty cart carries no preview block (no answer is not $0)", async () => {
  const cart = await getCart();
  assert.equal(cart.itemCount, 0);
  assert.ok(!("travelerFeePreview" in cart), "an empty cart has nothing to fee");
});

test("V1–V4, V7 the cart read carries the charge's own per-line fee, capped, grouped by plan", async () => {
  await addLine(ids.lineSmall, ids.small, ids.trip);
  await addLine(ids.lineBig, ids.big, ids.trip);
  await addLine(ids.lineNoTrip, ids.small, null);
  await addLine(ids.linePriceless, ids.priceless, ids.trip);

  const cart = await getCart();
  const pv = cart.travelerFeePreview;
  assert.ok(pv, "V1: GET /api/cart must carry travelerFeePreview");
  assert.equal(pv.basis, "estimate");
  assert.equal(pv.rate, rate, "the rate is the band's");
  assert.equal(pv.capPerBooking, cap, "the cap is the band's");

  const expectSmall = await resolveTravelerServiceFeeSnapshot(smallPrice, null);
  const expectBig = await resolveTravelerServiceFeeSnapshot(bigPrice, null);
  const byId = new Map<string, any>(pv.lines.map((l: any) => [l.cartItemId, l]));

  for (const [lineId, exp] of [
    [ids.lineSmall, expectSmall],
    [ids.lineNoTrip, expectSmall],
    [ids.lineBig, expectBig],
  ] as const) {
    const l = byId.get(lineId);
    assert.ok(l, `line ${lineId} is in the preview`);
    assert.equal(l.charged, exp.charged, "V1: charged === the charge's snapshot");
    assert.equal(l.wouldHaveBeen, exp.wouldHaveBeen);
    assert.equal(l.capApplied, exp.capApplied);
    assert.equal(l.waived, false, "no Trip Pass on this plan yet — nothing is waived");
    assert.equal(l.waiverBasis, null);
  }

  // V2 — the cap, per booking.
  assert.equal(expectBig.capApplied, true);
  assert.equal(byId.get(ids.lineBig).charged, cap, "a capped line is charged exactly the band's cap");
  assert.equal(byId.get(ids.lineSmall).capApplied, false);
  assert.equal(pv.capAppliedLineCount, 1);

  // V4 — the priceless line is named and not feed.
  assert.ok(!byId.has(ids.linePriceless), "V4: a line that cannot be charged is not feed");
  assert.deepEqual(cart.unpriceableItemIds, [ids.linePriceless]);

  // Totals are the sum of the lines.
  const sum = Math.round((expectSmall.charged * 2 + expectBig.charged) * 100) / 100;
  assert.equal(pv.lineCount, 3);
  assert.equal(pv.chargedTotal, sum);
  assert.equal(pv.waivedLineCount, 0);

  // V3 — the slip's figure: this plan's two lines, and the trip-less line in no group.
  const g = pv.byTrip[ids.trip];
  assert.ok(g, "V3: the plan has a group");
  assert.equal(g.lineCount, 2);
  assert.equal(g.chargedTotal, Math.round((expectSmall.charged + expectBig.charged) * 100) / 100);
  assert.equal(Object.keys(pv.byTrip).length, 1, "a line on no plan is in no plan's group");

  // V7 — `total` keeps its meaning: the fee is disclosed beside it, not folded in.
  assert.equal(cart.total, (smallPrice * 2 + bigPrice).toFixed(2));
});

test("V5b an unresolvable band omits the block — never a $0 fee", async () => {
  await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = ${TRAVELER_SERVICE_FEE_BAND}`);
  try {
    const cart = await getCart();
    assert.ok(cart.itemCount > 0, "the cart still has lines");
    assert.ok(!("travelerFeePreview" in cart), "no band ⇒ no answer ⇒ no block");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = ${TRAVELER_SERVICE_FEE_BAND}`);
  }
});

test("V6 a Trip-Pass-covered line is stated as waived with its real would-have-been", async () => {
  const pv = await buildTravelerFeePreview([
    { cartItemId: "a", tripId: ids.trip, subtotal: smallPrice, waiverBasis: "trip_pass" },
    { cartItemId: "b", tripId: ids.trip, subtotal: bigPrice, waiverBasis: "trip_pass" },
  ]);
  assert.ok(pv);
  const exp = await resolveTravelerServiceFeeSnapshot(smallPrice, "trip_pass");
  const uncovered = await resolveTravelerServiceFeeSnapshot(smallPrice, null);
  const a = pv!.lines.find((l) => l.cartItemId === "a")!;
  assert.equal(a.charged, 0);
  assert.equal(a.waived, true);
  assert.equal(a.waiverBasis, "trip_pass");
  assert.equal(a.wouldHaveBeen, exp.wouldHaveBeen);
  assert.equal(a.wouldHaveBeen, uncovered.charged, "the covered amount is the real fee, never 0");
  assert.equal(pv!.chargedTotal, 0);
  assert.equal(pv!.waivedLineCount, 2);
  assert.ok(pv!.wouldHaveBeenTotal > 0);
  assert.equal(pv!.byTrip[ids.trip].waivedLineCount, 2);
});

test("V8 the cart read previews the charge's per-line Trip Pass basis (R148)", async () => {
  // Someone else's plan holding an active pass, and a pass on the buyer's own plan.
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.foreignUser}, ${`feepv-${RUN}-foreign@t.test`}, 'Foreign', 'Owner', 'user')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.foreignTrip}, ${ids.foreignUser}, 'Foreign trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
  for (const tid of [ids.trip, ids.foreignTrip]) {
    const { created } = await grantTripPass({
      tripId: tid,
      sourcePaymentId: `feepv-${RUN}-pi-${tid.slice(-8)}`,
      allowancesSnapshot: { priceCents: 1900 },
    });
    assert.equal(created, true, `an active pass on ${tid}`);
  }
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
  await addLine(ids.lineSmall, ids.small, ids.trip);
  await addLine(ids.lineNoTrip, ids.small, null);
  await addLine(ids.lineForeign, ids.small, ids.foreignTrip);

  const pv = (await getCart()).travelerFeePreview;
  assert.ok(pv, "the block is present");
  const byId = new Map<string, any>(pv.lines.map((l: any) => [l.cartItemId, l]));
  const covered = await resolveTravelerServiceFeeSnapshot(smallPrice, "trip_pass");
  const charged = await resolveTravelerServiceFeeSnapshot(smallPrice, null);

  const own = byId.get(ids.lineSmall);
  assert.equal(own.waived, true, "a line on the buyer's OWN covered plan previews as waived");
  assert.equal(own.waiverBasis, "trip_pass");
  assert.equal(own.charged, covered.charged);
  assert.equal(own.wouldHaveBeen, charged.charged, "the real fee is still named");

  for (const lineId of [ids.lineNoTrip, ids.lineForeign]) {
    const l = byId.get(lineId);
    assert.equal(l.waived, false, `${lineId}: a standalone or foreign-plan line is never waived`);
    assert.equal(l.waiverBasis, null);
    assert.equal(l.charged, charged.charged);
  }
  assert.equal(pv.waivedLineCount, 1);
  assert.equal(pv.byTrip[ids.trip].waivedLineCount, 1);
});
