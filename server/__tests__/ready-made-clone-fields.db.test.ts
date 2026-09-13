/**
 * ready-made-clone-fields.db.test.ts — WHAT A BUYER'S CLONE CARRIES, against a real database.
 *
 * (punchlist V-14 + V-15, ledger `2026-09-13-clone-carries-content-not-state`; CLAUDE.md §19,
 *  §13, Locked Decision 39, Locked Decision 21, Locked Decision 29)
 *
 * WHY A DB SUITE AND NOT A UNIT ONE. A unit suite already existed beside the service
 * (`server/services/__tests__/ready-made-clone-routing.test.ts`) and it was GREEN for the whole
 * life of both defects, because it MIRRORED the production expression — it re-typed the spread and
 * the snake_case `routing_status` key into its own fixture and then asserted on that key. It was
 * proving its own copy. Both halves of the failure are only visible where drizzle maps a key to a
 * COLUMN, so this suite runs the REAL `fulfillReadyMadePurchase` and reads the buyer's rows back
 * out of Postgres with raw SQL, in the database's own column names.
 *
 *   C1  the source item's `ready_for_checkout` does NOT reach the buyer — the clone is
 *       `in_planning` (V-14: under LD 39 the cart IS this table's `ready_for_checkout`
 *       projection, so an author row left routed lands in the BUYER's cart on purchase).
 *   C2  no booking linkage travels: `booking_id`, `booking_status`, `booking_reference`,
 *       `confirmation_number`, `actual_cost` are all NULL on the clone (V-15 — the author's
 *       transaction, asserted on a different user's plan item).
 *   C3  no cross-trip identity travels: `user_experience_id` (an event on the AUTHOR's trip —
 *       LD 29 requires the pairing to hold and both live write rails refuse one that does not),
 *       `slot_id`, `vendor_contract_id`, `participant_ids`, `conflicts_with`, `backup_plan_id`.
 *   C4  no absolute date travels: `scheduled_date`, `check_in`, `check_out` — the clone is minted
 *       with its own placeholder window and `day_number` is the relative fact.
 *   C5  the CONTENT does travel, and this is the half that keeps the fix honest: the buyer still
 *       receives the plan they paid for, field by field.
 *   C6  the seller's PRIVATE notes stay behind while the traveler-facing `expert_note` travels —
 *       the per-item reading of the same line LD 21 draws at trip level, which this same
 *       fulfilment already honours for `expert_traveler_note`.
 *   C7  every column of `itinerary_items` is DECIDED — carried or excluded with a reason. The
 *       exhaustiveness pin is computed from `getTableColumns`, so a column added tomorrow fails
 *       here until a human classifies it (the §19 shape: excluded BY DEFAULT, never carried).
 *
 * THE NEGATIVE: C1–C4 FAIL on `origin/main`'s copy of `ready-made-purchase.service.ts`, which
 * spreads the source row minus four names.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/ready-made-clone-fields.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  CLONE_CARRIED_FIELDS,
  CLONE_EXCLUDED_FIELDS,
  cloneFieldCoverage,
  itineraryItemColumnNames,
} from "../services/itinerary-item-clone";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  author: `rmc-${RUN}-author`,
  buyer: `rmc-${RUN}-buyer`,
  service: `rmc-${RUN}-svc`,
  sourceTrip: `rmc-${RUN}-src-trip`,
  listing: `rmc-${RUN}-listing`,
  purchase: `rmc-${RUN}-purchase`,
  booking: `rmc-${RUN}-booking`,
  experienceType: `rmc-${RUN}-etype`,
  event: `rmc-${RUN}-event`,
  loadedItem: `rmc-${RUN}-item-loaded`,
  plainItem: `rmc-${RUN}-item-plain`,
};
let cloneTripId: string | null = null;

// ── Disposable-DB guard (identical posture to reconciliation-detection.db.test.ts) ────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[ready-made-clone-fields] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

/**
 * The source item as an AUTHOR's row really looks after they have built, routed and BOOKED it on
 * their own trip. Every value below is a fact about the author or their transaction; none of them
 * is a fact about the buyer, and that is the whole subject of this suite.
 */
async function seedLoadedSourceItem(): Promise<void> {
  await db.execute(sql`
    INSERT INTO itinerary_items (
      id, trip_id, title, description, item_type, status, day_number, start_time, end_time,
      duration_minutes, location_name, location_address, notes, private_notes, expert_note,
      estimated_cost, actual_cost, currency, origin, suggested_by, sort_order,
      provider_service_id, routing_status, booking_id, booking_status, booking_reference,
      confirmation_number, user_experience_id, scheduled_date, check_in, check_out,
      participant_ids, conflicts_with, backup_plan_id, is_backup_plan
    ) VALUES (
      ${ids.loadedItem}, ${ids.sourceTrip}, 'Kiyomizu-dera at dawn', 'Beat the crowds; enter by 06:10.',
      'activity', 'booked', 2, '06:00', '08:00',
      120, 'Kiyomizu-dera', '1-294 Kiyomizu, Higashiyama', 'Wear shoes you can walk stairs in.',
      'Client hates early starts — sell it hard.', 'Go left at the gate, the queue on the right is for coaches.',
      '18.00', '22.50', 'JPY', 'expert', 'expert', 3,
      ${ids.service}, 'ready_for_checkout', ${ids.booking}, 'confirmed', 'AUTHOR-REF-9912',
      'AUTHOR-CONF-55501', ${ids.event}, CURRENT_DATE + 61, CURRENT_DATE + 61, CURRENT_DATE + 62,
      ${JSON.stringify(["author-participant-1"])}::jsonb, ${JSON.stringify([ids.plainItem])}::jsonb,
      ${ids.plainItem}, true
    )
  `);
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.author}, ${`rmc-${RUN}-a@t.test`}, 'Clone', 'Author'),
           (${ids.buyer}, ${`rmc-${RUN}-b@t.test`}, 'Clone', 'Buyer')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.author}, 'Clone fixture service', '100.00')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.sourceTrip}, ${ids.author}, 'Ready-made source trip', 'Kyoto',
            CURRENT_DATE + 60, CURRENT_DATE + 64)
  `);
  // The AUTHOR's own booking — the row V-15's `booking_id` pointed a different user's item at.
  await db.execute(sql`
    INSERT INTO service_bookings (id, traveler_id, service_id, total_amount, status)
    VALUES (${ids.booking}, ${ids.author}, ${ids.service}, '120.00', 'confirmed')
  `);
  // An event on the AUTHOR's trip (LD 29: an event IS a `user_experiences` row bound to a trip).
  await db.execute(sql`
    INSERT INTO experience_types (id, name, slug)
    VALUES (${ids.experienceType}, ${`Clone fixture occasion ${RUN}`}, ${`clone-fixture-${RUN}`})
  `);
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, trip_id, title)
    VALUES (${ids.event}, ${ids.author}, ${ids.experienceType}, ${ids.sourceTrip}, 'Author event')
  `);
  // A second, ordinary item — both the backup-plan target and the proof that a plain row clones.
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status)
    VALUES (${ids.plainItem}, ${ids.sourceTrip}, 'Nishiki Market wander', 1, 0, 'in_planning')
  `);
  await seedLoadedSourceItem();
  await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status)
    VALUES (${ids.listing}, ${ids.author}, ${ids.sourceTrip}, 'Kyoto', 'Clone fixture listing', 5, 12500, 'approved')
  `);
  await db.execute(sql`
    INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id, status)
    VALUES (${ids.purchase}, ${ids.buyer}, ${ids.listing}, 12500, ${`pi_${RUN}_clone`}, 'paid')
  `);

  // ONE real fulfilment; every case below reads the rows it produced.
  const { fulfillReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const result = await fulfillReadyMadePurchase(ids.purchase);
  cloneTripId = result.cloneTripId;
  assert.ok(cloneTripId, "fixture: the fulfilment minted the buyer's clone trip");
});

after(async () => {
  await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${ids.purchase}`).catch(() => {});
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${ids.purchase}`).catch(() => {});
  if (cloneTripId) {
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${cloneTripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${cloneTripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${cloneTripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${cloneTripId}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${ids.purchase}`).catch(() => {});
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.sourceTrip}`).catch(() => {});
  await db.execute(sql`DELETE FROM user_experiences WHERE id = ${ids.event}`).catch(() => {});
  await db.execute(sql`DELETE FROM experience_types WHERE id = ${ids.experienceType}`).catch(() => {});
  await db.execute(sql`DELETE FROM service_bookings WHERE id = ${ids.booking}`).catch(() => {});
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.sourceTrip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.sourceTrip}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.author}, ${ids.buyer})`).catch(() => {});
});

/** The clone of the loaded source item, read back in the DATABASE's own column names. */
async function clonedLoadedRow(): Promise<any> {
  const r = await db.execute(sql`
    SELECT * FROM itinerary_items
    WHERE trip_id = ${cloneTripId} AND title = 'Kiyomizu-dera at dawn'
  `);
  assert.equal(r.rows.length, 1, "exactly one clone of the loaded source item");
  return r.rows[0] as any;
}

test("C1: the author's `ready_for_checkout` does not reach the buyer — the clone is in_planning", async () => {
  // THE V-14 NEGATIVE. On `origin/main` the override names `routing_status`, drizzle reads
  // `routingStatus`, and the spread carries the author's own value straight through — so this row
  // comes back `ready_for_checkout` and, under LD 39, sits in the buyer's CART the moment they buy.
  const row = await clonedLoadedRow();
  assert.equal(row.routing_status, "in_planning",
    "DB FACT: a clone is born in the buyer's planner, never in their cart");

  const plain = await db.execute(sql`
    SELECT routing_status FROM itinerary_items WHERE trip_id = ${cloneTripId} AND title = 'Nishiki Market wander'
  `);
  assert.equal((plain.rows[0] as any).routing_status, "in_planning", "and so is an ordinary item");
});

test("C2: no booking linkage travels — the author's transaction stays the author's", async () => {
  // THE V-15 NEGATIVE. `booking_id` arrived in migration 159, long after the four-name spread was
  // written, and was carried BY DEFAULT: a buyer's plan item pointing at the AUTHOR's
  // `service_bookings` row and displaying the AUTHOR's confirmation number.
  const row = await clonedLoadedRow();
  assert.equal(row.booking_id, null, "DB FACT: no FK to a booking that belongs to someone else");
  assert.equal(row.booking_status, null);
  assert.equal(row.booking_reference, null);
  assert.equal(row.confirmation_number, null, "DB FACT: the buyer is shown no confirmation they do not hold");
  assert.equal(row.actual_cost, null, "what the AUTHOR paid is not what the buyer will pay");
  assert.equal(row.slot_id, null, "an availability slot the author picked is not the buyer's");
  assert.equal(row.vendor_contract_id, null, "the author's vendor contract is not the buyer's");

  // And the source row is untouched — the fix strips the COPY, never the original.
  const src = await db.execute(sql`SELECT booking_id, confirmation_number FROM itinerary_items WHERE id = ${ids.loadedItem}`);
  assert.equal((src.rows[0] as any).booking_id, ids.booking, "the AUTHOR keeps their own booking linkage");
  assert.equal((src.rows[0] as any).confirmation_number, "AUTHOR-CONF-55501");
});

test("C3: no pointer into the author's own trip travels", async () => {
  const row = await clonedLoadedRow();
  // LD 29: a non-null `user_experience_id` must name an event whose `trip_id` IS the item's trip,
  // and both live write rails refuse a pairing that fails it — so carrying the author's event id
  // wrote precisely what those rails exist to reject. NULL is the clone's own implicit event.
  assert.equal(row.user_experience_id, null, "DB FACT: the author's event does not follow the item");
  assert.equal(row.backup_plan_id, null, "a backup pointing at an item on another trip is a dangling id");
  assert.deepEqual(row.participant_ids, [], "the author's participants are not the buyer's party");
  assert.deepEqual(row.conflicts_with, [], "conflicts naming the author's items resolve to nothing here");
  // `is_backup_plan` is a fact about the CONTENT ("this item is a fallback"), so it does travel.
  assert.equal(row.is_backup_plan, true);
});

test("C4: no absolute date travels — the buyer re-dates their own plan", async () => {
  const row = await clonedLoadedRow();
  assert.equal(row.scheduled_date, null, "DB FACT: the author's calendar day is not the buyer's");
  assert.equal(row.check_in, null);
  assert.equal(row.check_out, null);
  assert.equal(row.day_number, 2, "the RELATIVE fact is the content, and it travels");
});

test("C5: the content the buyer paid for does travel, field by field", async () => {
  const row = await clonedLoadedRow();
  assert.equal(row.title, "Kiyomizu-dera at dawn");
  assert.equal(row.description, "Beat the crowds; enter by 06:10.");
  assert.equal(row.item_type, "activity");
  assert.equal(row.start_time, "06:00");
  assert.equal(row.end_time, "08:00");
  assert.equal(row.duration_minutes, 120);
  assert.equal(row.location_name, "Kiyomizu-dera");
  assert.equal(row.location_address, "1-294 Kiyomizu, Higashiyama");
  assert.equal(row.notes, "Wear shoes you can walk stairs in.");
  assert.equal(Number(row.estimated_cost), 18, "the author's own estimate is part of the published plan");
  assert.equal(row.currency, "JPY");
  assert.equal(row.provider_service_id, ids.service, "a catalog pointer is a recommendation, not a booking");
  assert.equal(row.origin, "expert", "the item really was written by an expert (LD 42 D3/D23 read this)");
  assert.equal(row.suggested_by, "expert");
  assert.equal(row.sort_order, 3);
  // Behaviour unchanged: the buyer receives the whole plan, not a subset of it.
  const n = await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = ${cloneTripId}`);
  assert.equal((n.rows[0] as any).n, 2, "one clone per source item");
  // `status` is the item's own lifecycle and includes booked/confirmed — an author's claim, so the
  // clone takes the column default instead.
  assert.equal(row.status, "planned", "DB FACT: the author's 'booked' is not asserted of the buyer's item");
});

test("C6: the seller's private notes stay behind; the traveler-facing expert note travels", async () => {
  const row = await clonedLoadedRow();
  assert.equal(row.private_notes, null,
    "organizer-only notes written by the SELLER — the item-level twin of trips.expert_notes (LD 21)");
  assert.equal(row.expert_note, "Go left at the gate, the queue on the right is for coaches.",
    "the 'from your expert' field IS what the buyer paid for");
});

test("C7: every itinerary_items column is decided — carried, or excluded with a reason", () => {
  // The §19 shape made mechanical: the decided set is checked against `getTableColumns`, so a
  // column added tomorrow belongs to NEITHER list and this fails until a human classifies it. The
  // builder copies only the allowlist, so until then the new column is excluded BY DEFAULT — the
  // opposite of the denylist that carried `booking_id` onto a stranger's plan for two migrations.
  const { undecided, unknown } = cloneFieldCoverage();
  assert.deepEqual(undecided, [],
    `undecided itinerary_items column(s): ${undecided.join(", ")} — add each to CLONE_CARRIED_FIELDS ` +
    `(content the buyer paid for) or to CLONE_EXCLUDED_FIELDS with the reason it stays behind.`);
  assert.deepEqual(unknown, [],
    `name(s) in the clone lists that are not columns: ${unknown.join(", ")} — a renamed or dropped column.`);
  assert.equal(
    CLONE_CARRIED_FIELDS.length + Object.keys(CLONE_EXCLUDED_FIELDS).length,
    itineraryItemColumnNames().length,
    "the two lists partition the table exactly once — no column named twice",
  );
});
