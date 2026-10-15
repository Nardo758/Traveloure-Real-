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
 *   B11 (S1-d-3c) hard timeouts: a timed-out prebook stores nothing; a timed-out BOOK is unknown, never failed —
 *       the row stays `booking` ("still waiting") and the book is sent once
 *   B12 (S1-d-3c) the sync finds a claim with no LiteAPI id by our client reference and records LiteAPI's id and
 *       status as facts — never our status; another reference's booking is not taken for ours
 *   B13 a cancel LiteAPI refuses with a definite 4xx goes to `needs_review` with the reason — never back to
 *       `confirmed`; the item stays purchased and held (no new prebook or book), and the sync reports the row
 *       (ledger `2026-10-15-liteapi-cancel-needs-review`)
 *   B14 the consent gate: a stored policy that is non-refundable, or past its free-cancel deadline, answers
 *       `charges_apply` with the terms and makes NO LiteAPI call; the row and item are untouched
 *   B15 with `acknowledgeCharges`, a cancel LiteAPI answers CANCELLED_WITH_CHARGES is a cancellation: row
 *       cancelled with LiteAPI's status and reported charges, item released (ledger
 *       `2026-10-15-liteapi-cancel-with-charges`)
 *   B16 CANCELLED with a fee: money follows `refund_amount`, never the word — cancelled, amounts stored as returned;
 *       a repeat cancel is answered by our row (`not_confirmed`), makes no LiteAPI call and leaves the amounts
 *   B17 a 204 (empty body) is no answer ⇒ `needs_review`; a currency other than ours, or no `refund_amount`, keeps the
 *       stay cancelled and opens ONE `liteapi_refund_unverified` exception with the raw amounts
 *   B18 any other status word ⇒ `needs_review`, never back to `confirmed`
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
import { LiteapiError, LiteapiTimeoutError } from "../services/liteapi-client";
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

function fakes(opts: { env?: "sandbox" | "production"; rates?: (q: any) => any; prebook?: any | ((q: any, n: number) => any); list?: (ref: string) => any; book?: () => any; cancel?: () => any; get?: () => any } = {}) {
  const calls: Record<string, any[]> = { rates: [], prebook: [], book: [], cancel: [], get: [], list: [] };
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
        cancelBooking: async (bid: string) => (calls.cancel.push(bid), opts.cancel ? opts.cancel() : { data: { bookingId: bid, status: "CANCELLED", cancellation_fee: 0, refund_amount: 312.5, currency: "USD" } }),
        getBooking: async (bid: string) => (calls.get.push(bid), opts.get ? opts.get() : { data: { bookingId: bid, status: "CONFIRMED" } }),
        listBookingsByClientReference: async (ref: string) => (calls.list.push(ref), opts.list ? opts.list(ref) : { data: [] }),
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
  await stay("s5", "trip", "lite");
  await stay("s6", "trip", "lite");
  await stay("s7", "trip", "lite");
  for (const k of ["s8", "s9", "s10", "s11"]) await stay(k, "trip", "lite");
  await stay("notlite", "trip", "other");
  await stay("anon", "trip2", "lite");
});

after(async () => {
  await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'source' = 'liteapi_booking' AND to_email LIKE ${`lbk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM reconciliation_runs WHERE id IN (SELECT run_id FROM reconciliation_exceptions WHERE booking_id IN (SELECT id FROM liteapi_bookings WHERE trip_id LIKE ${`lbk-${RUN}-%`}))`).catch(() => {});
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
  // s2 is booked here for B8; its cancel answered by another status word is B18 (that is no longer a refusal back
  // to `confirmed` — ledger `2026-10-15-liteapi-cancel-with-charges`).
  await prebookStay(q("s2"), fakes().deps);
  await bookStay(q("s2"), fakes().deps);
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

test("B11 a timed-out prebook stores nothing; a timed-out book is still waiting, never failed", async () => {
  const before = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM liteapi_bookings WHERE itinerary_item_id = ${id("s3")}`)) as any).rows[0].n);
  const slowPre = fakes({ prebook: () => { throw new LiteapiTimeoutError("/rates/prebook", 30_000); } });
  assert.deepEqual(await prebookStay(q("s3"), slowPre.deps), { state: "unavailable", reason: "prebook_error" });
  assert.equal(slowPre.calls.prebook.length, 1);
  const after = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM liteapi_bookings WHERE itinerary_item_id = ${id("s3")}`)) as any).rows[0].n);
  assert.equal(after, before, "a prebook that never answered stores nothing");

  assert.equal((await prebookStay(q("s3"), fakes().deps)).state, "prebooked");
  const slowBook = fakes({ book: () => { throw new LiteapiTimeoutError("/rates/book", 60_000); } });
  const out = await bookStay(q("s3"), slowBook.deps);
  assert.equal(out.state, "pending", "unknown, never failed — a charge may exist");
  assert.equal(slowBook.calls.book.length, 1, "sent once");
  const r = await row("s3");
  assert.equal(r.status, "booking");
  assert.equal(r.liteapi_booking_id, null);
  assert.match(r.failure_reason, /no answer within 60000 ms/);
  assert.equal(await itemStatus("s3"), "in_planning");
});

test("B12 the sync finds a timed-out book by our client reference and records facts only", async () => {
  const waiting = await row("s3");
  const other = await row("s4");
  assert.equal(waiting.status, "booking");
  assert.equal(other.status, "booking");
  const f = fakes({
    list: (ref: string) =>
      ref === waiting.id
        ? { data: [{ bookingId: `bk-late-${RUN}`, status: "confirmed", clientReference: waiting.id }, { bookingId: `bk-not-ours-${RUN}`, status: "CONFIRMED", clientReference: "someone-else" }] }
        : { data: [{ bookingId: `bk-not-ours-${RUN}`, status: "CONFIRMED", clientReference: "someone-else" }] },
  });
  const out = await runLiteapiBookingSync({ config: f.deps.config, client: f.deps.client });
  assert.equal(out.error, undefined);
  assert.ok(f.calls.list.includes(waiting.id) && f.calls.list.includes(other.id));
  assert.ok(out.foundByReference >= 1);
  const w = await row("s3");
  assert.equal(w.status, "booking", "the sync never changes our status");
  assert.equal(w.liteapi_booking_id, `bk-late-${RUN}`);
  assert.equal(w.last_sync_status, "CONFIRMED");
  assert.ok(out.disagree.some((d) => d.id === waiting.id && d.ours === "booking" && d.theirs === "CONFIRMED"));
  const o = await row("s4");
  assert.equal(o.liteapi_booking_id, null, "another reference's booking is never taken for ours");
  assert.ok(out.strandedBooking >= 1, "a claim LiteAPI does not hold stays reported");
});

test("B13 a cancel refused with a definite 4xx goes to needs_review with the reason, never confirmed", async () => {
  await prebookStay(q("s5"), fakes().deps);
  assert.equal((await bookStay(q("s5"), fakes().deps)).state, "confirmed");
  // A stale prebook made before the review row exists must not book past it.
  const out: any = await cancelStay(q("s5"), fakes({ cancel: () => { throw new LiteapiError(422, "cancellation not allowed"); } }).deps);
  assert.equal(out.state, "needs_review");
  const r = await row("s5");
  assert.equal(r.status, "needs_review", "never back to confirmed");
  assert.match(r.failure_reason, /^422 cancellation not allowed/);
  assert.equal(await itemStatus("s5"), "purchased", "the item stays held while the outcome is unknown");
  // Held: no second prebook, no second cancel attempt from this row.
  assert.deepEqual(await prebookStay(q("s5"), fakes().deps), { state: "already_booked" });
  assert.deepEqual(await cancelStay(q("s5"), fakes().deps), { state: "not_confirmed" });
  // A prebooked row left over from before cannot book past the review row (the claim's NOT EXISTS).
  await db.execute(sql`INSERT INTO liteapi_bookings (id, trip_id, itinerary_item_id, user_id, status, env, prebook_id, transaction_id, offer_id, amount_cents, currency, checkin, checkout, adults, provider_hotel_id)
    SELECT ${id("s5-stale")}, trip_id, itinerary_item_id, user_id, 'prebooked', env, ${`${RUN}-stale-pb`}, 'tx-stale', offer_id, amount_cents, currency, checkin, checkout, adults, provider_hotel_id
    FROM liteapi_bookings WHERE id = ${r.id}`);
  const f = fakes();
  assert.deepEqual(await bookStay(q("s5"), f.deps), { state: "no_prebook" });
  assert.equal(f.calls.book.length, 0, "no book call while a review is open");
  // The sync reads it and reports it; it never changes our status.
  const sync = await runLiteapiBookingSync({ config: f.deps.config, client: fakes({ get: () => ({ data: { status: "CONFIRMED" } }) }).deps.client });
  assert.ok(sync.needsReview.some((n) => n.id === r.id && n.theirs === "CONFIRMED"));
  assert.equal(((await db.execute(sql`SELECT status FROM liteapi_bookings WHERE id = ${r.id}`)) as any).rows[0].status, "needs_review");
});

const exceptionsFor = async (bookingRowId: string) =>
  ((await db.execute(sql`SELECT count(*)::int AS n FROM reconciliation_exceptions WHERE booking_id = ${bookingRowId} AND kind = 'liteapi_refund_unverified'`)) as any).rows[0].n;
const book = async (k: string) => {
  await prebookStay(q(k), fakes().deps);
  assert.equal((await bookStay(q(k), fakes().deps)).state, "confirmed");
};

const setPolicy = async (k: string, policy: unknown) =>
  db.execute(sql`UPDATE liteapi_bookings SET cancellation_policy = ${JSON.stringify(policy)}::jsonb WHERE itinerary_item_id = ${id(k)} AND status = 'confirmed'`);

test("B14 the consent gate: charges apply ⇒ 422 terms, no LiteAPI call, nothing changes", async () => {
  await prebookStay(q("s6"), fakes().deps);
  assert.equal((await bookStay(q("s6"), fakes().deps)).state, "confirmed");
  await setPolicy("s6", { refundableTag: "NRFN", cancelPolicyInfos: [{ cancelTime: "2026-01-01 00:00:00", amount: 312.5, currency: "USD" }] });
  const f = fakes();
  const out: any = await cancelStay(q("s6"), f.deps);
  assert.equal(out.state, "charges_apply");
  assert.equal(out.policy, "NRFN");
  assert.equal(out.amount, 312.5);
  assert.equal(out.currency, "USD");
  assert.equal(f.calls.cancel.length, 0, "no LiteAPI call without consent");
  assert.equal((await row("s6")).status, "confirmed");
  assert.equal(await itemStatus("s6"), "purchased");

  // A refundable rate past its free-cancel deadline is gated the same way; one still inside it is not.
  await prebookStay(q("s7"), fakes().deps);
  assert.equal((await bookStay(q("s7"), fakes().deps)).state, "confirmed");
  await setPolicy("s7", { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2026-01-01 00:00:00", amount: 50, currency: "USD" }] });
  const g = fakes();
  const past: any = await cancelStay(q("s7"), g.deps);
  assert.equal(past.state, "charges_apply");
  assert.equal(past.deadline, "2026-01-01T00:00:00.000Z");
  assert.equal(past.amount, 50);
  assert.equal(g.calls.cancel.length, 0);
  await setPolicy("s7", { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2099-01-01 00:00:00", amount: 50, currency: "USD" }] });
  const free: any = await cancelStay(q("s7"), fakes().deps);
  assert.equal(free.state, "cancelled", "inside the free window there is nothing to consent to");
  assert.equal(free.liteapiStatus, "CANCELLED");
  const r7 = await row("s7");
  assert.deepEqual(r7.cancel_amounts, { cancellation_fee: 0, refund_amount: 312.5, currency: "USD" }, "CANCELLED, fee 0, stored as returned");
  assert.equal(await exceptionsFor(r7.id), 0);
});

test("B15 acknowledged: CANCELLED_WITH_CHARGES is a cancellation — row cancelled, charges stored, item released", async () => {
  const f = fakes({ cancel: () => ({ data: { bookingId: "x", status: "CANCELLED_WITH_CHARGES", cancellation_fee: 312.5, refund_amount: 0, currency: "USD" } }) });
  const out: any = await cancelStay({ ...q("s6"), acknowledgeCharges: true }, f.deps);
  assert.equal(out.state, "cancelled");
  assert.equal(out.liteapiStatus, "CANCELLED_WITH_CHARGES");
  assert.equal(f.calls.cancel.length, 1);
  const r = await row("s6");
  assert.equal(r.status, "cancelled", "the room is gone at LiteAPI, so our row says so");
  assert.ok(r.cancelled_at);
  assert.equal(r.last_sync_status, "CANCELLED_WITH_CHARGES");
  assert.deepEqual(r.cancel_amounts, { cancellation_fee: 312.5, refund_amount: 0, currency: "USD" }, "exactly as returned");
  assert.equal(await exceptionsFor(r.id), 0, "a stated refund in our currency opens nothing");
  assert.equal(await itemStatus("s6"), "in_planning");
  assert.equal(await itemCode("s6"), null);
});

test("B16 CANCELLED with a fee: money follows refund_amount; a repeat cancel is our row's answer", async () => {
  await book("s8");
  const f = fakes({ cancel: () => ({ data: { bookingId: "x", status: "CANCELLED", cancellation_fee: 25, refund_amount: 287.5, currency: "USD" } }) });
  const out: any = await cancelStay(q("s8"), f.deps);
  assert.equal(out.state, "cancelled");
  const r = await row("s8");
  assert.equal(r.status, "cancelled");
  assert.deepEqual(r.cancel_amounts, { cancellation_fee: 25, refund_amount: 287.5, currency: "USD" });
  assert.equal(await itemStatus("s8"), "in_planning");
  // LiteAPI answers a repeat cancel CANCELLED_WITH_CHARGES (run 38762970892); our row gates it first.
  const again = fakes({ cancel: () => ({ data: { status: "CANCELLED_WITH_CHARGES", cancellation_fee: 999, refund_amount: 0, currency: "USD" } }) });
  assert.deepEqual(await cancelStay(q("s8"), again.deps), { state: "not_confirmed" });
  assert.equal(again.calls.cancel.length, 0);
  assert.deepEqual((await row("s8")).cancel_amounts, { cancellation_fee: 25, refund_amount: 287.5, currency: "USD" }, "amounts untouched");
});

test("B17 a 204 goes to review; a currency mismatch or a missing refund stays cancelled with ONE exception", async () => {
  await book("s9");
  const gone: any = await cancelStay(q("s9"), fakes({ cancel: () => { throw new LiteapiError(204, "LiteAPI /bookings/:id answered 204"); } }).deps);
  assert.equal(gone.state, "needs_review");
  const r9 = await row("s9");
  assert.equal(r9.status, "needs_review", "never back to confirmed");
  assert.match(r9.failure_reason, /^204 /);
  assert.equal(await itemStatus("s9"), "purchased");

  await book("s10");
  const other: any = await cancelStay(q("s10"), fakes({ cancel: () => ({ data: { status: "CANCELLED_WITH_CHARGES", cancellation_fee: 40, refund_amount: 260, currency: "EUR" } }) }).deps);
  assert.equal(other.state, "cancelled");
  const r10 = await row("s10");
  assert.equal(r10.status, "cancelled", "never re-marked for review");
  assert.equal(await exceptionsFor(r10.id), 1);
  const ex = ((await db.execute(sql`SELECT * FROM reconciliation_exceptions WHERE booking_id = ${r10.id}`)) as any).rows[0];
  assert.equal(ex.rail, "liteapi");
  assert.equal(ex.severity, "warning");
  assert.equal(ex.details.reason, "currency_mismatch");
  assert.equal(ex.details.cancellation_fee, 40);
  assert.equal(ex.details.refund_amount, 260);
  assert.equal(ex.details.currency, "EUR");
  assert.equal(ex.currency, "USD");
  const run = ((await db.execute(sql`SELECT triggered_by, status FROM reconciliation_runs WHERE id = ${ex.run_id}`)) as any).rows[0];
  assert.deepEqual(run, { triggered_by: "liteapi_cancel", status: "completed" });

  await book("s11");
  const blank: any = await cancelStay(q("s11"), fakes({ cancel: () => ({ data: { status: "CANCELLED", currency: "USD" } }) }).deps);
  assert.equal(blank.state, "cancelled");
  const r11 = await row("s11");
  assert.deepEqual(r11.cancel_amounts, { currency: "USD" }, "only what LiteAPI returned");
  const ex11 = ((await db.execute(sql`SELECT details, actual_amount FROM reconciliation_exceptions WHERE booking_id = ${r11.id}`)) as any).rows;
  assert.equal(ex11.length, 1);
  assert.equal(ex11[0].details.reason, "refund_amount_missing");
  assert.equal(ex11[0].actual_amount, null);
});

test("B18 any other status word goes to review, never back to confirmed", async () => {
  const out: any = await cancelStay(q("s2"), fakes({ cancel: () => ({ data: { status: "CONFIRMED" } }) }).deps);
  assert.equal(out.state, "needs_review");
  const r = await row("s2");
  assert.equal(r.status, "needs_review");
  assert.equal(r.last_sync_status, "CONFIRMED");
  assert.match(r.failure_reason, /LiteAPI answered CONFIRMED/);
  assert.equal(await itemStatus("s2"), "purchased");
});
