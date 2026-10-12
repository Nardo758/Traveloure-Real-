/**
 * S1-d-3a — booking the chosen LiteAPI stay, against a disposable database (ledger
 * `2026-10-10-s1-d3a-liteapi-booking`; migration 371). LiteAPI is a fake: no network.
 *
 *   B1 one not_found for a stranger, the managing-assistant-free owner gate, an item that is not a chosen
 *      LiteAPI stay; production env ⇒ booking_unavailable and no call
 *   B2 prebook re-quotes the plan's own dates and party (the offer id is the re-quote's, never the browser's),
 *      stores the prebookId/transactionId pair BEFORE the SDK, never the secret key, and returns the price
 *   B3 the booking margin: under the SSP at the band ⇒ ONE re-quote at max(band, SSP/net − 1) and THAT offer is
 *      prebooked; no SSP stated ⇒ refused by name; a prebook still below the SSP is refused; nothing is stored
 *   B4 book: the holder is the session user, the payment method is TRANSACTION_ID, and confirmed is ONE
 *      transaction — row confirmed with commission/fee cents, item `purchased`, one voucher in the outbox
 *   B5 a second prebook on a booked item is refused; a second book finds no prebook
 *   B6 cancel: claim then PUT; CANCELLED ⇒ row cancelled and the item back to `in_planning`; no refund row
 *   B7 a definite LiteAPI refusal fails the booking; an unreadable answer leaves the claim for the sync
 *   B8 the sync records LiteAPI's status and never changes ours; it reports disagreement and stranded claims
 *   B9 a missing holder name is refused, never invented
 *   B10 (S1-d-3c) a prebook below its OWN SSP ⇒ ONE re-quote at the margin that floor needs and ONE more prebook;
 *       a second answer below its floor is refused — never more than two prebook calls
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { prebookStay, bookStay, cancelStay, stayBookingView, type StayBookingDeps } from "../services/liteapi-booking.service";
import { runLiteapiBookingSync } from "../jobs/liteapiBookingSync";
import { LiteapiError } from "../services/liteapi-client";
import { LITEAPI_PAYMENT_METHOD } from "@shared/liteapi-booking";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `lbk-${RUN}-${k}`;
const CITY = `Bookcity${RUN}`;
const sandbox = { apiKey: "k", env: "sandbox" as const, dataBaseUrl: "https://api.test/v3.0", bookBaseUrl: "https://book.test/v3.0", maxRps: 1000, staleAfterDays: 2 };
const production = { ...sandbox, env: "production" as const };
// Shapes as the founder's sandbox run (2026-10-09) returned them: the SSP rides on the room type, and the
// prebook answer states none of its own.
const rates = { data: [{ hotelId: `${RUN}-lp`, roomTypes: [{ offerId: `offer-${RUN}`, suggestedSellingPrice: { amount: 300, currency: "USD" }, rates: [{ retailRate: { total: [{ amount: 300, currency: "USD" }] } }] }] }] };
let prebookN = 0;
const prebookAnswer = (over: Record<string, unknown> = {}) => ({
  data: { prebookId: `pb-${RUN}-${++prebookN}`, transactionId: `tx-${RUN}-${prebookN}`, secretKey: "sk-secret", price: 312.5, currency: "USD", priceDifferencePercent: 0, ...over },
});

function fakes(opts: { env?: "sandbox" | "production"; rates?: (q: any) => any; prebook?: any | ((q: any, n: number) => any); book?: () => any; cancel?: () => any; get?: () => any } = {}) {
  const calls: Record<string, any[]> = { rates: [], prebook: [], book: [], cancel: [], get: [] };
  const deps: StayBookingDeps = {
    config: () => (opts.env === "production" ? production : sandbox),
    client: () =>
      ({
        hotelRates: async (q: any) => (calls.rates.push(q), opts.rates ? opts.rates(q) : rates),
        prebook: async (q: any) => (calls.prebook.push(q), typeof opts.prebook === "function" ? opts.prebook(q, calls.prebook.length) : opts.prebook ?? prebookAnswer()),
        book: async (q: any) => {
          // The body the real client sends is built by the ONE builder; assert its payment method there.
          const { bookRequestBody } = await import("../services/liteapi-client");
          calls.book.push(bookRequestBody(q));
          return opts.book ? opts.book() : { data: { bookingId: `bk-${RUN}`, status: "CONFIRMED", hotelConfirmationCode: "HC-42", clientCommission: 33.25, processingFee: 1.5 } };
        },
        cancelBooking: async (bid: string) => (calls.cancel.push(bid), opts.cancel ? opts.cancel() : { data: { bookingId: bid, status: "CANCELLED" } }),
        getBooking: async (bid: string) => (calls.get.push(bid), opts.get ? opts.get() : { data: { bookingId: bid, status: "CONFIRMED" } }),
      }) as any,
    gate: { dailyCap: () => 10, countToday: async () => 0, record: async () => {} },
    marginFraction: async () => 0.12,
    timeoutMs: () => 2000,
  };
  return { deps, calls };
}

const q = (k: string, user = "owner") => ({ tripId: id("trip"), itemId: id(k), userId: id(user) });
const row = async (itemKey: string) => ((await db.execute(sql`SELECT * FROM liteapi_bookings WHERE itinerary_item_id = ${id(itemKey)} ORDER BY created_at DESC LIMIT 1`)) as any).rows[0];
const itemStatus = async (k: string) => ((await db.execute(sql`SELECT routing_status FROM itinerary_items WHERE id = ${id(k)}`)) as any).rows[0].routing_status;
const itemCode = async (k: string) => ((await db.execute(sql`SELECT confirmation_number FROM itinerary_items WHERE id = ${id(k)}`)) as any).rows[0].confirmation_number;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id("owner")}, ${`${id("owner")}@t.test`}, 'Aiko', 'Tanaka', 'user')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id("stranger")}, ${`${id("stranger")}@t.test`}, 'S', 'T', 'user')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id("noname")}, ${`${id("noname")}@t.test`}, NULL, NULL, 'user')`);
  const exp = new Date(Date.now() + 2 * 86_400_000);
  await db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, name, latitude, longitude, city, provider, provider_hotel_id, expires_at)
    VALUES (${id("lite")}, ${id("lite")}, 'BKC', 'Fixture Ryokan', 35, 135, ${CITY}, 'liteapi', ${`${RUN}-lp`}, ${exp}),
           (${id("other")}, ${id("other")}, 'BKC', 'Other Hotel', 35, 135, ${CITY}, 'booking_com', NULL, ${exp})`);
  for (const [trip, owner] of [["trip", "owner"], ["trip2", "noname"]]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, adults, kids, dates_confirmed_at)
      VALUES (${id(trip)}, ${id(owner)}, 'LB', ${`${CITY}, Japan`}, '2027-05-10', '2027-05-13', 'planning', 2, 0, now())`);
  }
  // A chosen LiteAPI stay per item key, each through its own accommodation set (item → set → option → hotel_cache).
  const stay = async (k: string, trip: string, hotel: string) => {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, item_type) VALUES (${id(k)}, ${id(trip)}, 'Stay', 1, 'accommodation')`);
    await db.execute(sql`INSERT INTO plan_option_sets (id, trip_id, itinerary_item_id, category_key, status, chosen_option_id) VALUES (${id(k + "-set")}, ${id(trip)}, ${id(k)}, 'accommodation', 'chosen', ${id(k + "-opt")})`);
    await db.execute(sql`INSERT INTO plan_options (id, set_id, position, source_kind, hotel_cache_id, title) VALUES (${id(k + "-opt")}, ${id(k + "-set")}, 1, 'engine', ${id(hotel)}, 'Stay')`);
  };
  await stay("s1", "trip", "lite");
  await stay("s2", "trip", "lite");
  await stay("s3", "trip", "lite");
  await stay("s4", "trip", "lite");
  await stay("notlite", "trip", "other");
  await stay("anon", "trip2", "lite");
});

after(async () => {
  await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'source' = 'liteapi_booking' AND to_email LIKE ${`lbk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM liteapi_bookings WHERE trip_id LIKE ${`lbk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`lbk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${`lbk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`lbk-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

test("B1 not_found for a stranger and a non-LiteAPI stay; production ⇒ booking_unavailable with no call", async () => {
  const f = fakes();
  assert.deepEqual(await prebookStay(q("s1", "stranger"), f.deps), { state: "not_found" });
  assert.deepEqual(await prebookStay({ ...q("s1"), userId: null }, f.deps), { state: "not_found" });
  assert.deepEqual(await prebookStay(q("notlite"), f.deps), { state: "not_found" });
  assert.deepEqual(await bookStay(q("s1", "stranger"), f.deps), { state: "not_found" });
  assert.deepEqual(await cancelStay(q("s1", "stranger"), f.deps), { state: "not_found" });
  assert.equal(await stayBookingView(q("s1", "stranger")), null);
  // d-3b: "Book" draws only on a chosen LiteAPI stay with booking on (sandbox).
  assert.equal(((await stayBookingView(q("s1"), f.deps)) as any).bookable, true);
  assert.equal(((await stayBookingView(q("notlite"), f.deps)) as any).bookable, false);
  const p = fakes({ env: "production" });
  assert.equal(((await stayBookingView(q("s1"), p.deps)) as any).bookable, false);
  assert.deepEqual(await prebookStay(q("s1"), p.deps), { state: "booking_unavailable" });
  assert.deepEqual(await bookStay(q("s1"), p.deps), { state: "booking_unavailable" });
  assert.equal(f.calls.rates.length + p.calls.rates.length + f.calls.prebook.length + p.calls.prebook.length, 0);
});

test("B2/B3 prebook re-quotes server-side, stores the pair before the SDK, never the secret; the margin meets the SSP", async () => {
  const low = fakes({ prebook: prebookAnswer({ price: 280 }) }); // the prebook's guard: below the re-quote's SSP of 300
  assert.deepEqual(await prebookStay(q("s1"), low.deps), { state: "unavailable", reason: "below_ssp" });
  assert.equal(await row("s1"), undefined, "nothing stored below the SSP");
  assert.equal(low.calls.prebook.length, 2, "S1-d-3c: one re-prebook, then refused — never a third");

  // No SSP stated ⇒ refused by name; nothing prebooked, nothing stored.
  const bare = { data: [{ hotelId: `${RUN}-lp`, roomTypes: [{ offerId: `offer-${RUN}`, rates: [{ retailRate: { total: [{ amount: 300, currency: "USD" }] } }] }] }] };
  const noSsp = fakes({ rates: () => bare });
  assert.deepEqual(await prebookStay(q("s1"), noSsp.deps), { state: "unavailable", reason: "no_ssp" });
  assert.equal(noSsp.calls.prebook.length, 0);
  assert.equal(await row("s1"), undefined);

  // At the 12% band the price sits under the SSP (net 250 ⇒ retail 280 < 300): ONE more re-quote at 20%, and
  // the offer that answer returns is the one prebooked.
  const under = fakes({
    rates: (rq: any) =>
      rq.marginPercent === 12
        ? { data: [{ roomTypes: [{ offerId: `offer-band-${RUN}`, offerRetailRate: { amount: 280, currency: "USD" }, commission: [{ amount: 30, currency: "USD" }], suggestedSellingPrice: { amount: 300, currency: "USD" } }] }] }
        : { data: [{ roomTypes: [{ offerId: `offer-floor-${RUN}`, offerRetailRate: { amount: 300, currency: "USD" }, suggestedSellingPrice: { amount: 300, currency: "USD" } }] }] },
    prebook: prebookAnswer({ price: 300 }),
  });
  const lifted: any = await prebookStay(q("s1"), under.deps);
  assert.equal(lifted.state, "prebooked");
  assert.deepEqual(under.calls.rates.map((c: any) => c.marginPercent), [12, 20]);
  assert.deepEqual(under.calls.prebook[0], { offerId: `offer-floor-${RUN}` }, "the floor re-quote's offer is prebooked");
  await db.execute(sql`DELETE FROM liteapi_bookings WHERE itinerary_item_id = ${id("s1")}`);

  const f = fakes();
  const out: any = await prebookStay(q("s1"), f.deps);
  assert.equal(out.state, "prebooked");
  assert.equal(out.amountCents, 31250);
  assert.equal(out.currency, "USD");
  assert.equal(out.secretKey, "sk-secret");
  assert.deepEqual([f.calls.rates[0].checkin, f.calls.rates[0].checkout, f.calls.rates[0].adults, f.calls.rates[0].hotelId], ["2027-05-10", "2027-05-13", 2, `${RUN}-lp`]);
  assert.deepEqual(f.calls.prebook[0], { offerId: `offer-${RUN}` }, "the offer is the re-quote's");
  const r = await row("s1");
  assert.equal(r.status, "prebooked");
  assert.equal(r.offer_id, `offer-${RUN}`);
  assert.equal(r.prebook_id, out.bookingId ? r.prebook_id : null);
  assert.equal(r.transaction_id, out.transactionId);
  assert.equal(r.env, "sandbox");
  assert.ok(!JSON.stringify(r).includes("sk-secret"), "the SDK secret is never stored");
});

test("B4/B5 book: session holder, TRANSACTION_ID, one confirmed transaction with the voucher; then refusals", async () => {
  const f = fakes();
  const out: any = await bookStay(q("s1"), f.deps);
  assert.deepEqual(out.state, "confirmed");
  assert.equal(out.hotelConfirmationCode, "HC-42");
  const body = f.calls.book[0];
  assert.equal(body.payment.method, LITEAPI_PAYMENT_METHOD);
  assert.equal(body.payment.method, "TRANSACTION_ID");
  assert.deepEqual(body.holder, { firstName: "Aiko", lastName: "Tanaka", email: `${id("owner")}@t.test` });
  const r = await row("s1");
  assert.equal(r.status, "confirmed");
  assert.equal(r.liteapi_booking_id, `bk-${RUN}`);
  assert.equal(r.hotel_confirmation_code, "HC-42");
  assert.equal(r.commission_cents, 3325);
  assert.equal(r.processing_fee_cents, 150);
  assert.equal(await itemStatus("s1"), "purchased");
  assert.equal(await itemCode("s1"), "HC-42", "d-3b: the code rides the item's existing confirmation_number");
  const mails: any[] = ((await db.execute(sql`SELECT * FROM email_outbox WHERE metadata->>'bookingId' = ${r.id}`)) as any).rows;
  assert.equal(mails.length, 1);
  assert.equal(mails[0].metadata.eventKey, `liteapi_voucher:${r.id}`);
  assert.ok(mails[0].text_body.includes("HC-42"));
  assert.equal(((await db.execute(sql`SELECT count(*)::int AS n FROM payment_intents WHERE metadata::text LIKE ${`%${r.id}%`}`).catch(() => ({ rows: [{ n: 0 }] }))) as any).rows[0].n, 0);

  assert.deepEqual(await prebookStay(q("s1"), fakes().deps), { state: "already_booked" });
  assert.deepEqual(await bookStay(q("s1"), fakes().deps), { state: "no_prebook" });
  const view: any = await stayBookingView(q("s1"));
  assert.equal(view.booking.status, "confirmed");
  assert.equal(view.booking.hotelConfirmationCode, "HC-42");
});

test("B6 cancel: claim, then CANCELLED ⇒ cancelled, item back in planning, no refund row", async () => {
  const f = fakes();
  const out: any = await cancelStay(q("s1"), f.deps);
  assert.equal(out.state, "cancelled");
  assert.deepEqual(f.calls.cancel, [`bk-${RUN}`]);
  const r = await row("s1");
  assert.equal(r.status, "cancelled");
  assert.ok(r.cancelled_at);
  assert.equal(await itemStatus("s1"), "in_planning");
  assert.equal(await itemCode("s1"), null, "d-3b: the code this booking wrote is cleared");
  assert.deepEqual(await cancelStay(q("s1"), f.deps), { state: "not_confirmed" });
  const refunds = ((await db.execute(sql`SELECT count(*)::int AS n FROM refunds WHERE reason LIKE ${`%${r.id}%`}`).catch(() => ({ rows: [{ n: 0 }] }))) as any).rows[0].n;
  assert.equal(refunds, 0);
  // A refused cancel puts the claim back.
  await prebookStay(q("s2"), fakes().deps);
  await bookStay(q("s2"), fakes().deps);
  assert.equal((await cancelStay(q("s2"), fakes({ cancel: () => ({ data: { status: "CONFIRMED" } }) }).deps)).state, "cancel_refused");
  assert.equal((await row("s2")).status, "confirmed");
});

test("B7 a definite refusal fails; an unreadable answer leaves the claim", async () => {
  await prebookStay(q("s3"), fakes().deps);
  const refused = await bookStay(q("s3"), fakes({ book: () => { throw new LiteapiError(400, "offer expired"); } }).deps);
  assert.equal(refused.state, "failed");
  assert.equal((await row("s3")).status, "failed");
  assert.equal(await itemStatus("s3"), "in_planning");

  await prebookStay(q("s4"), fakes().deps);
  const lost = await bookStay(q("s4"), fakes({ book: () => { throw new TypeError("fetch failed"); } }).deps);
  assert.equal(lost.state, "pending");
  const r = await row("s4");
  assert.equal(r.status, "booking");
  assert.equal(r.liteapi_booking_id, null);
  assert.equal(await itemStatus("s4"), "in_planning");
});

test("B8 the sync records LiteAPI's status and never changes ours", async () => {
  const f = fakes({ get: () => ({ data: { status: "CANCELLED" } }) });
  const out = await runLiteapiBookingSync({ config: f.deps.config, client: f.deps.client });
  assert.equal(out.error, undefined);
  assert.ok(out.read >= 1);
  const r = await row("s2");
  assert.equal(r.status, "confirmed", "the sync never changes our status");
  assert.equal(r.last_sync_status, "CANCELLED");
  assert.ok(r.last_synced_at);
  assert.ok(out.disagree.some((d) => d.id === r.id && d.ours === "confirmed" && d.theirs === "CANCELLED"));
  assert.ok(out.strandedBooking >= 1, "the lost claim (s4) is reported");
  const off = await runLiteapiBookingSync({ config: () => production, client: f.deps.client });
  assert.equal(off.skipped, "booking_disabled");
});

test("B9 a missing holder name is refused, never invented", async () => {
  const anon = { tripId: id("trip2"), itemId: id("anon"), userId: id("noname") };
  assert.equal((await prebookStay(anon, fakes().deps)).state, "prebooked");
  const f = fakes();
  assert.deepEqual(await bookStay(anon, f.deps), { state: "holder_incomplete" });
  assert.equal(f.calls.book.length, 0);
  const r = ((await db.execute(sql`SELECT status FROM liteapi_bookings WHERE itinerary_item_id = ${id("anon")}`)) as any).rows[0];
  assert.equal(r.status, "prebooked");
});

test("B10 a prebook below its own SSP is re-quoted once and prebooked once more, then refused", async () => {
  // CI shape: the re-quote's SSP agrees with the price, the prebook's own SSP is a few cents higher.
  const quoteAt = (m: number) => ({
    data: [{ roomTypes: [{ offerId: `offer-m${m}-${RUN}`, offerRetailRate: { amount: 202.27, currency: "USD" }, suggestedSellingPrice: { amount: 202.27, currency: "USD" } }] }],
  });
  const lifted = fakes({
    rates: (rq: any) => quoteAt(rq.marginPercent),
    prebook: (_q: any, n: number) => prebookAnswer(n === 1 ? { price: 202.27, suggestedSellingPrice: 202.3 } : { price: 202.31, suggestedSellingPrice: 202.3 }),
  });
  const ok: any = await prebookStay(q("s1"), lifted.deps);
  assert.equal(ok.state, "prebooked");
  assert.equal(ok.amountCents, 20231);
  assert.deepEqual(lifted.calls.rates.map((c: any) => c.marginPercent), [12, 12.02], "the second quote is at max(band, floor / net − 1): net 202.27 / 1.12 ⇒ 12.017% ⇒ 12.02%");
  assert.equal(lifted.calls.prebook.length, 2);
  assert.deepEqual(lifted.calls.prebook[1], { offerId: `offer-m12.02-${RUN}` }, "the floor re-quote's offer is the one prebooked");
  assert.equal((await row("s1")).offer_id, `offer-m12.02-${RUN}`);
  await db.execute(sql`DELETE FROM liteapi_bookings WHERE itinerary_item_id = ${id("s1")}`);

  const still = fakes({
    rates: (rq: any) => quoteAt(rq.marginPercent),
    prebook: () => prebookAnswer({ price: 202.27, suggestedSellingPrice: 202.3 }),
  });
  assert.deepEqual(await prebookStay(q("s1"), still.deps), { state: "unavailable", reason: "below_ssp" });
  assert.equal(still.calls.prebook.length, 2, "never more than two prebook calls");
  assert.equal(await row("s1"), undefined);
});
