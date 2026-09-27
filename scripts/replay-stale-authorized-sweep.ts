/**
 * replay-stale-authorized-sweep.ts — REAL-STRIPE proof for R164 (G2, ledger
 * `2026-09-27-stale-authorized-sweep`). Seeds AUTHORIZED claims (PaymentIntent stamped, still
 * `payment_pending`, a slot unit held, the plan item `purchased`) against REAL test-mode PaymentIntents
 * in each state, runs `sweepStaleAuthorizedClaims` with its DEFAULT Stripe path (no stubs), and reads
 * the database and Stripe afterwards:
 *
 *   A  succeeded (pm_card_visa)            ⇒ promoted; Stripe untouched
 *   B  canceled in Stripe already           ⇒ expired, slot released, item back in planning
 *   C  requires_payment_method, 25h old    ⇒ CANCELLED at Stripe (abandoned), expired, released
 *   D  requires_payment_method, 2h old     ⇒ left alone; Stripe still requires_payment_method
 *   E  the same pass run again              ⇒ nothing changes, nothing cancelled twice
 *
 * DISPOSABLE DB ONLY; needs a real sk_test_ key in STRIPE_SECRET_KEY. Every seeded row is deleted.
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure STRIPE_SECRET_KEY=sk_test_… \
 *   npx tsx scripts/replay-stale-authorized-sweep.ts
 */
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

const RAW_KEY = process.env.STRIPE_SECRET_KEY ?? "";
if (!/^sk_test_[A-Za-z0-9]{24,}$/.test(RAW_KEY)) throw new Error("a real sk_test_ key is required in STRIPE_SECRET_KEY");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error(`refusing to seed a non-local database (${host}); opt in with JOURNEY_DB_WRITES_OK=1`);
}

const stripe = new Stripe(RAW_KEY, { maxNetworkRetries: 2, timeout: 30000 });
const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `rpg2-${RUN}-user`, service: `rpg2-${RUN}-svc`, trip: `rpg2-${RUN}-trip` };
const bookings: string[] = [];
const slots: string[] = [];
let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
}

async function main() {
  const { db } = await import("../server/db");
  const { sweepStaleAuthorizedClaims, CLAIM_EXPIRED_STATUS } = await import("../server/services/checkout-claim.service");

  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${ids.user}, ${`rpg2-${RUN}@t.test`}, 'G2', 'Replay')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price) VALUES (${ids.service}, ${ids.user}, 'G2 replay', '100.00')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date) VALUES (${ids.trip}, ${ids.user}, 'G2 replay', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 33)`);

  const claim = async (label: string, pi: string, ageMinutes: number) => {
    const bookingId = `rpg2-${RUN}-${label}`;
    const slotId = `rpg2-${RUN}-slot-${label}`;
    const itemId = `rpg2-${RUN}-item-${label}`;
    await db.execute(sql`INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
      VALUES (${slotId}, ${ids.service}, ${ids.user}, CURRENT_DATE + 20, 1, 1, 'fully_booked')`);
    slots.push(slotId);
    await db.execute(sql`INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, slot_id, status, total_amount, platform_fee,
        stripe_payment_intent_id, booking_details, created_at)
      VALUES (${bookingId}, ${ids.service}, ${ids.user}, ${ids.user}, ${ids.trip}, ${slotId}, 'payment_pending', '100.00', '0.00', ${pi},
        ${JSON.stringify({ itineraryItemId: itemId, stripeAttemptAt: new Date().toISOString() })}::jsonb,
        NOW() - (${String(ageMinutes)} || ' minutes')::interval)`);
    bookings.push(bookingId);
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, routing_status, booking_id, provider_service_id, status)
      VALUES (${itemId}, ${ids.trip}, ${`G2 ${label}`}, 1, 'traveler', 'purchased', ${bookingId}, ${ids.service}, 'planned')`);
    return { bookingId, slotId, itemId, pi };
  };
  const read = async (c: { bookingId: string; slotId: string; itemId: string }) => {
    const b = (await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${c.bookingId}`)).rows[0] as any;
    const s = (await db.execute(sql`SELECT booked_count FROM vendor_availability_slots WHERE id = ${c.slotId}`)).rows[0] as any;
    const i = (await db.execute(sql`SELECT routing_status FROM itinerary_items WHERE id = ${c.itemId}`)).rows[0] as any;
    return { booking: b.status, booked: Number(s.booked_count), item: i.routing_status };
  };
  const mkPi = async (confirm: boolean) =>
    stripe.paymentIntents.create({
      amount: 10000,
      currency: "usd",
      payment_method_types: ["card"],
      ...(confirm ? { payment_method: "pm_card_visa", confirm: true } : {}),
      metadata: { source: "replay-g2", run: RUN },
    });

  const piA = await mkPi(true);
  const piB = await mkPi(false);
  await stripe.paymentIntents.cancel(piB.id);
  const piC = await mkPi(false);
  const piD = await mkPi(false);
  const A = await claim("a", piA.id, 60);
  const B = await claim("b", piB.id, 60);
  const C = await claim("c", piC.id, 25 * 60);
  const D = await claim("d", piD.id, 120);

  const r = await sweepStaleAuthorizedClaims({ onlyBookingIds: [A.bookingId, B.bookingId, C.bookingId, D.bookingId] });
  console.log("[replay] pass 1:", JSON.stringify(r));

  console.log("── A succeeded");
  const a = await read(A);
  check("A promoted to confirmed, slot kept, item purchased", a.booking === "confirmed" && a.booked === 1 && a.item === "purchased", a);

  console.log("── B already canceled in Stripe");
  const b = await read(B);
  check("B expired, slot released, item back in planning", b.booking === CLAIM_EXPIRED_STATUS && b.booked === 0 && b.item === "in_planning", b);

  console.log("── C unpaid for 25h");
  const c = await read(C);
  check("C expired, slot released, item back in planning", c.booking === CLAIM_EXPIRED_STATUS && c.booked === 0 && c.item === "in_planning", c);
  const piCAfter = await stripe.paymentIntents.retrieve(piC.id);
  check("Stripe: C is CANCELLED as abandoned", piCAfter.status === "canceled" && piCAfter.cancellation_reason === "abandoned",
    { status: piCAfter.status, reason: piCAfter.cancellation_reason });

  console.log("── D unpaid for 2h");
  const d = await read(D);
  check("D untouched (payment_pending, slot held, item purchased)", d.booking === "payment_pending" && d.booked === 1 && d.item === "purchased", d);
  check("Stripe: D is still requires_payment_method", (await stripe.paymentIntents.retrieve(piD.id)).status === "requires_payment_method");

  console.log("── E the same pass again");
  const r2 = await sweepStaleAuthorizedClaims({ onlyBookingIds: [A.bookingId, B.bookingId, C.bookingId, D.bookingId] });
  check("second pass changes nothing (only D examined, left young)", r2.examined === 1 && r2.leftYoung === 1 && r2.voidedStale === 0 && r2.voidedCanceled === 0, r2);
  const c2 = await read(C);
  check("C's slot not released twice", c2.booked === 0);

  await stripe.paymentIntents.cancel(piD.id).catch(() => {});
}

main()
  .catch((err) => { failures++; console.error(err); })
  .finally(async () => {
    const { db } = await import("../server/db");
    for (const id of bookings) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
    for (const id of slots) await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
    console.log(failures === 0 ? "[replay] ALL PASS" : `[replay] ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
