/**
 * LANE P — a purchase updates the LINKED plan item in place, never a second item.
 *
 * Design doc §5 S5/S6 (`docs/design/CONCIERGE_BOOKING_UNIVERSAL_DESIGN.md`); ledger
 * `2026-09-19-linked-item-purchase-write`. CLAUDE.md §13, §14, §15, §18 rule 1, §18c, Locked
 * Decision 44 (e) and the `routing_status`/`origin` paragraph.
 *
 * THE DEFECT. `PATCH /api/affiliate-booking-requests/:id` (`content.routes.ts`) used to
 * UNCONDITIONALLY create a NEW `itinerary_items` row on every human purchase press that carried a
 * `tripId` — even for a Booking Concierge hand-off request, which already names the plan item it
 * is booking via `affiliate_booking_requests.itinerary_item_id` (migration 312, ledger
 * `2026-09-18-concierge-handoff`). Every concierge hand-off purchase therefore duplicated the item.
 *
 * THE FIX. `server/services/partner-item-write.service.ts` exposes `markLinkedItemBooked` (the
 * human purchase press, S5) and `markLinkedItemConfirmed` (the partner's own confirmation report,
 * S6). Both are proven directly against real Postgres here (this file's actual job — the same
 * "no HTTP exercised" posture `booking-agent-confirmed.db.test.ts` states for this exact route):
 * each is ONE atomic conditional UPDATE, keyed on the request's OWN `itinerary_item_id` AND
 * `trip_id`, that never writes `routing_status`, `booking_id` or `origin` (LD 44).
 *
 * L4 (the UNLINKED legacy branch is kept byte-for-byte, not widened) and the wiring between
 * `content.routes.ts` / `affiliate-booking-confirmation.service.ts` and this module are proven by
 * SOURCE PINS (comments stripped where relevant) rather than by driving Express — the same
 * adapter-pin posture `booking-agent-confirmed.db.test.ts` already uses for this route.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 * No Stripe key and no network — this file never reaches Stripe.
 *
 * Run solo: npx tsx --test server/__tests__/linked-item-purchase-write.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { markLinkedItemBooked, markLinkedItemConfirmed } from "../services/partner-item-write.service";
import { confirmFromPartnerReport } from "../services/affiliate-booking-confirmation.service";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const RUN = crypto.randomUUID().slice(0, 8);
const travelerId = `lp-${RUN}-trav`;

const tripIds: string[] = [];
const itemIds: string[] = [];
const requestIds: string[] = [];
const bookingIds: string[] = [];

async function makeTrip(): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${travelerId}, ${`LP trip ${RUN}`}, '2030-06-01', '2030-06-05', 'Kyoto, Japan')
  `);
  tripIds.push(id);
  return id;
}

async function makeItem(opts: {
  tripId: string;
  title: string;
  status?: string;
  bookingStatus?: string | null;
  bookingReference?: string | null;
  confirmationNumber?: string | null;
  routingStatus?: string;
  bookingId?: string | null;
  origin?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO itinerary_items
      (id, trip_id, title, day_number, status, booking_status, booking_reference,
       confirmation_number, routing_status, booking_id, origin)
    VALUES
      (${id}, ${opts.tripId}, ${opts.title}, 1, ${opts.status ?? "planned"},
       ${opts.bookingStatus ?? null}, ${opts.bookingReference ?? null},
       ${opts.confirmationNumber ?? null}, ${opts.routingStatus ?? "in_planning"},
       ${opts.bookingId ?? null}, ${opts.origin ?? null})
  `);
  itemIds.push(id);
  return id;
}

/** Minimal `service_bookings` row — used only by L3 to prove `booking_id` is left alone, never
 *  written by this rail. Not otherwise money-relevant to this file. */
async function makeUnrelatedBooking(): Promise<string> {
  const serviceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method)
    VALUES (${serviceId}, ${travelerId}, ${`LP unrelated listing ${RUN}`}, '50.00', 'active', 'approved', 'in_person')
  `);
  const bookingId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings)
    VALUES
      (${bookingId}, ${serviceId}, ${travelerId}, ${travelerId}, 'confirmed', '50.00', '10.00', '40.00')
  `);
  bookingIds.push(bookingId);
  // provider_services row is cleaned up alongside the booking in after().
  (bookingIds as any).__serviceIds = [...((bookingIds as any).__serviceIds ?? []), serviceId];
  return bookingId;
}

async function makeRequest(opts: {
  tripId: string | null;
  itineraryItemId: string | null;
  status?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO affiliate_booking_requests
      (id, user_id, trip_id, itinerary_item_id, item_name, partner_name, affiliate_url, status)
    VALUES
      (${id}, ${travelerId}, ${opts.tripId}, ${opts.itineraryItemId}, ${`LP item ${RUN}`},
       ${"LP Partner"}, ${"https://partner.test/lp?ref=1"}, ${opts.status ?? "purchased_by_human"})
  `);
  requestIds.push(id);
  return id;
}

async function readItem(id: string) {
  const { rows } = await db.execute(sql`
    SELECT status, booking_status, booking_reference, confirmation_number, routing_status,
           booking_id, origin, trip_id
    FROM itinerary_items WHERE id = ${id}
  `);
  return rows[0] as any;
}

async function itemCount(tripId: string): Promise<number> {
  const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = ${tripId}`);
  return (rows[0] as any).n as number;
}

async function readRequestStatus(id: string): Promise<string | null> {
  const { rows } = await db.execute(sql`SELECT status FROM affiliate_booking_requests WHERE id = ${id}`);
  return (rows[0] as any)?.status ?? null;
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (${travelerId}, ${`lp-${RUN}-trav@test.local`}, 'traveler')
  `);
});

after(async () => {
  if (requestIds.length > 0) {
    await db.execute(sql`DELETE FROM affiliate_booking_requests WHERE id IN (${sql.join(requestIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (itemIds.length > 0) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id IN (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (bookingIds.length > 0) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${sql.join(bookingIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  const serviceIds: string[] = (bookingIds as any).__serviceIds ?? [];
  if (serviceIds.length > 0) {
    await db.execute(sql`DELETE FROM provider_services WHERE id IN (${sql.join(serviceIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (tripIds.length > 0) {
    await db.execute(sql`DELETE FROM trips WHERE id IN (${sql.join(tripIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${travelerId}`);
});

test("L1: purchase of a LINKED request updates the item in place; the trip's item COUNT is unchanged", async () => {
  const tripId = await makeTrip();
  const itemId = await makeItem({ tripId, title: "Nishiki Market food walk" });
  const requestId = await makeRequest({ tripId, itineraryItemId: itemId });

  assert.equal(await itemCount(tripId), 1, "one item before the purchase");

  const outcome = await markLinkedItemBooked(requestId, { confirmationRef: "CONF-L1" });
  assert.deepEqual(outcome, { updated: true });

  const item = await readItem(itemId);
  assert.equal(item.status, "booked");
  assert.equal(item.booking_status, "pending");
  assert.equal(item.booking_reference, "CONF-L1");
  assert.equal(item.confirmation_number, "CONF-L1");

  assert.equal(await itemCount(tripId), 1, "still one item — never a second item for the same purchase");
});

test("L2: the same purchase re-driven creates and changes nothing", async () => {
  const tripId = await makeTrip();
  const itemId = await makeItem({ tripId, title: "Gion evening walk" });
  const requestId = await makeRequest({ tripId, itineraryItemId: itemId });

  const first = await markLinkedItemBooked(requestId, { confirmationRef: "CONF-L2" });
  assert.deepEqual(first, { updated: true });
  assert.equal(await itemCount(tripId), 1);

  // Re-driven with NO ref this time — COALESCE must never blank a reference an earlier call
  // already recorded, and the retry must still create nothing.
  const second = await markLinkedItemBooked(requestId, { confirmationRef: null });
  assert.deepEqual(second, { updated: true });

  const item = await readItem(itemId);
  assert.equal(item.booking_reference, "CONF-L2", "the retry did not blank the earlier reference");
  assert.equal(item.confirmation_number, "CONF-L2");
  assert.equal(await itemCount(tripId), 1, "the retry created no second item");
});

test("L3: routing_status, booking_id and origin are untouched by the purchase write", async () => {
  const tripId = await makeTrip();
  const unrelatedBookingId = await makeUnrelatedBooking();
  const itemId = await makeItem({
    tripId,
    title: "Fushimi Inari at dawn",
    routingStatus: "ready_for_checkout",
    bookingId: unrelatedBookingId,
    origin: "traveler",
  });
  const requestId = await makeRequest({ tripId, itineraryItemId: itemId });

  const outcome = await markLinkedItemBooked(requestId, { confirmationRef: "CONF-L3" });
  assert.deepEqual(outcome, { updated: true });

  const item = await readItem(itemId);
  assert.equal(item.status, "booked", "the item DID flip status — the write happened");
  assert.equal(item.routing_status, "ready_for_checkout", "routing_status is the CART rail's own column — LD 44 — never touched here");
  assert.equal(item.booking_id, unrelatedBookingId, "booking_id is untouched — never stamped by this rail");
  assert.equal(item.origin, "traveler", "origin stays whatever it was — LD 44's open question, not decided by this rail");
});

test("L4: an UNLINKED request with a tripId still creates one item — the legacy branch is pinned, not widened", () => {
  const source = fs.readFileSync(path.join(ROOT, "server/routes/content.routes.ts"), "utf8");

  // The branch: linked ⇒ markLinkedItemBooked and create nothing; unlinked ⇒ the original create.
  assert.match(source, /if \(updated\.itineraryItemId\) \{\s*\n\s*await markLinkedItemBooked\(updated\.id, \{ confirmationRef: updated\.confirmationRef \?\? null \}\);\s*\n\s*\} else \{/);

  // The unlinked create is byte-for-byte the pre-Lane-P shape: same fields, same values.
  assert.match(source, /await storage\.createItineraryItem\(\{/);
  assert.match(source, /title: updated\.itemName,/);
  assert.match(source, /status: "booked",/);
  assert.match(source, /bookingReference: updated\.confirmationRef \?\? null,/);
  assert.match(source, /bookingStatus: "pending",/);
  assert.match(source, /confirmationNumber: updated\.confirmationRef \?\? null,/);
  assert.match(source, /suggestedBy: "expert",/);
  assert.match(source, /origin: "expert",/);

  // The create call is nested inside the `else` of THIS branch — it no longer runs
  // unconditionally for every purchase with a tripId (the defect this lane fixes). Scoped to a
  // window right after the linked-branch check so an unrelated `} else {` elsewhere in this large
  // monolith file can never satisfy the assertion.
  const branchIdx = source.indexOf("if (updated.itineraryItemId) {");
  assert.ok(branchIdx > -1, "the linked-branch check must exist");
  const window = source.slice(branchIdx, branchIdx + 1500);
  const elseIdx = window.indexOf("} else {");
  const createIdx = window.indexOf("await storage.createItineraryItem({");
  assert.ok(elseIdx > -1 && createIdx > elseIdx, "createItineraryItem must sit inside this branch's else");
});

test("L5: a partner-report confirmation upgrades the LINKED item's bookingStatus and leaves an unlinked request's plan untouched", async () => {
  const tripId = await makeTrip();

  // Linked half: the item already went through S5 (status='booked', bookingStatus='pending').
  const linkedItemId = await makeItem({ tripId, title: "Kiyomizu-dera sunrise", status: "booked", bookingStatus: "pending" });
  const linkedRequestId = await makeRequest({ tripId, itineraryItemId: linkedItemId, status: "purchased_by_human" });

  const linkedOutcome = await confirmFromPartnerReport(linkedRequestId, { partner: "WeGoTrip", partnerReferenceId: "PR-L5" });
  assert.equal(linkedOutcome.confirmed, true);
  assert.equal(await readRequestStatus(linkedRequestId), "confirmed");

  const linkedItem = await readItem(linkedItemId);
  assert.equal(linkedItem.booking_status, "confirmed", "the linked item's bookingStatus is upgraded by the SAME writer");

  // Unlinked half: a traveler-initiated request with no plan item to point at. An unrelated item
  // sits on the same trip and must stay exactly as it was.
  const unrelatedItemId = await makeItem({ tripId, title: "Unrelated planned activity", status: "planned" });
  const unlinkedRequestId = await makeRequest({ tripId, itineraryItemId: null, status: "purchased_by_traveler" });

  const unlinkedOutcome = await confirmFromPartnerReport(unlinkedRequestId, { partner: "WeGoTrip", partnerReferenceId: "PR-L5b" });
  assert.equal(unlinkedOutcome.confirmed, true, "the REQUEST still confirms — this lane never blocks the request's own flip");

  const unrelatedItem = await readItem(unrelatedItemId);
  assert.equal(unrelatedItem.status, "planned", "no linked item existed to touch — the plan is untouched");
  assert.equal(unrelatedItem.booking_status, null, "no linked item existed to touch — the plan is untouched");
});

test("L6: a request whose item belongs to another trip updates 0 rows and creates nothing", async () => {
  const tripA = await makeTrip();
  const tripB = await makeTrip();
  const itemInTripA = await makeItem({ tripId: tripA, title: "Belongs to trip A" });

  // The request NAMES tripB, but its linked item actually lives on tripA — the §14 pairing check
  // must refuse this rather than write across the trip boundary.
  const requestId = await makeRequest({ tripId: tripB, itineraryItemId: itemInTripA });

  const outcome = await markLinkedItemBooked(requestId, { confirmationRef: "CONF-L6" });
  assert.deepEqual(outcome, { updated: false, reason: "item_not_found_or_trip_mismatch" });

  const item = await readItem(itemInTripA);
  assert.equal(item.status, "planned", "the mismatched item is untouched");

  assert.equal(await itemCount(tripA), 1, "still just the one original item on trip A");
  assert.equal(await itemCount(tripB), 0, "no item was created on trip B either");
});

test("L7: both purchase and confirmation call sites import the ONE partner-item-write module (§18 rule 1)", () => {
  const routes = fs.readFileSync(path.join(ROOT, "server/routes/content.routes.ts"), "utf8");
  const confirmation = fs.readFileSync(path.join(ROOT, "server/services/affiliate-booking-confirmation.service.ts"), "utf8");

  assert.match(routes, /from ["']\.\.\/services\/partner-item-write\.service["']/);
  assert.match(routes, /markLinkedItemBooked/);

  assert.match(confirmation, /from ["']\.\/partner-item-write\.service["']/);
  assert.match(confirmation, /markLinkedItemConfirmed/);

  // The module itself never writes the three LD-44-reserved columns.
  const module = fs.readFileSync(path.join(ROOT, "server/services/partner-item-write.service.ts"), "utf8");
  assert.doesNotMatch(module, /routingStatus\s*:/, "never writes routing_status — the cart rail's own column");
  assert.doesNotMatch(module, /\bbookingId\s*:/, "never writes booking_id — the cart rail's own column");
  assert.doesNotMatch(module, /\borigin\s*:/, "never writes origin — LD 44's open question");
});
