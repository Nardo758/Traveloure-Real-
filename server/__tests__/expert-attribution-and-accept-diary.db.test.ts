/**
 * CC-1 + EX-3 — expert provenance on itinerary-item CREATE, and the accept-transition diary row.
 * D1 + D2 (ratified Aug 7 2026) — "a PENDING advisor may not write" + `itinerary_items.origin`.
 *
 * CC-1: `POST /api/trips/:tripId/itinerary-items` (server/routes.ts, the mounted/authoritative
 * handler — trips.routes.ts's duplicate copy is shadowed per the §9 mount-order-dead note and
 * never serves traffic) now derives `itineraryItems.suggestedBy` server-side from the SESSION
 * user's `trip_expert_advisors` standing (via `storage.isExpertAssignedToTripForWrite`, the
 * canonical `isTripAdvisorWithWriteAccess` allow-list predicate — D1), never from `req.body`
 * (§14 posture). The tests below reproduce the route's own derivation using the SAME exported
 * building blocks the route calls (`insertItineraryItemSchema`, `storage.isExpertAssignedToTrip`
 * / `storage.isExpertAssignedToTripForWrite`, `storage.createItineraryItem`) — the same
 * "reproduce the route, don't reimplement it" approach as booking-birth-provenance.db.test.ts's
 * `postBooking` helper.
 *
 * D1: the route's access gate (`owned || assigned || authored`) now resolves `assigned` via the
 * WRITE-access predicate — a PENDING advisor no longer passes it (403), only accepted/assigned
 * advisors do (201).
 *
 * D2: the route also derives `itineraryItems.origin` ('ai'|'traveler'|'expert') server-side from
 * the same WRITE-gated `isAdvisor` flag, mirroring `suggestedBy`'s derivation exactly — a
 * client-sent `origin` is stripped and ignored.
 *
 * EX-3: `storage.acceptTripAssignment` (the pending -> accepted atomic flip) now writes one
 * append-only `item_transition_log` row in the SAME transaction as the flip, mirroring task
 * #1028's `updateExpertAssignmentWorkspaceStatus` convention (trip-scoped, itemId NULL,
 * actorType "expert", actorId = the accepting expert). The atomic conditional itself
 * (WHERE status='pending') is untouched (§15/§18b) — proven by T3 (a second accept on an
 * already-accepted row still writes zero additional rows and returns undefined).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: DATABASE_URL=postgresql://postgres@127.0.0.1:5433/traveloure npx tsx --test server/__tests__/expert-attribution-and-accept-diary.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { insertItineraryItemSchema, itineraryItems } from "@shared/schema";
import { eq, and, or, isNull, ne } from "drizzle-orm";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `eap-${RUN}-owner`,
  expert: `eap-${RUN}-expert`,
  trip: `eap-${RUN}-trip`,
  // D1: a SEPARATE trip whose advisor assignment stays 'pending' until T6 explicitly accepts it —
  // isolated from `ids.trip` so T1's accept transition (T1 runs first) doesn't contaminate the
  // pending-gate assertions.
  trip2: `eap-${RUN}-trip2`,
  // D2: a SEPARATE trip used only for the regenerate-delete-predicate test (T8), so its item set
  // isn't polluted by the items T3/T4/T5/T7 create on `ids.trip`.
  trip3: `eap-${RUN}-trip3`,
};
const createdItemIds: string[] = [];
let assignmentId = "";
let assignment2Id = "";

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ──────
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
      `[expert-attribution-and-accept-diary] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** Reproduces EXACTLY what the routes.ts CREATE handler does with a body, post D1+D2:
 *  (1) the access gate — `owned || assigned` where `assigned` is now WRITE-gated
 *      (`storage.isExpertAssignedToTripForWrite`, D1) instead of read-gated — a pending advisor
 *      fails this and gets `{ status: 403 }`, never reaching the insert;
 *  (2) parse via the exported insert schema (which OMITS `origin` at the schema layer, D2 layer
 *      1), strip whatever the client sent for `suggestedBy`/`origin`, and re-derive BOTH from
 *      `isAdvisor` (the SAME write-gated flag computed for the access gate — never from the
 *      body, §14). Returns `{ status: 403 }` or `{ status: 201, item }`, mirroring the route's
 *      HTTP contract without standing up an HTTP server (same DB-layer-reproduction approach as
 *      the rest of this file / booking-birth-provenance.db.test.ts's `postBooking`). */
async function postItineraryItem(
  actingUserId: string,
  tripId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; item?: any }> {
  const owned = actingUserId === ids.owner;
  const isAdvisor = owned ? false : await storage.isExpertAssignedToTripForWrite(tripId, actingUserId);
  const assigned = owned || isAdvisor;
  if (!assigned) {
    return { status: 403 };
  }
  const parsed = insertItineraryItemSchema.safeParse({ ...body, tripId });
  assert.ok(parsed.success, `fixture body must parse: ${JSON.stringify((parsed as any).error?.errors)}`);
  const itemData = parsed.data as any;
  delete itemData.suggestedBy;
  if (isAdvisor) {
    itemData.suggestedBy = "expert";
  }
  delete itemData.origin;
  itemData.origin = isAdvisor ? "expert" : "traveler";
  const item = await storage.createItineraryItem(itemData);
  createdItemIds.push(item.id);
  return { status: 201, item };
}

/** Reproduces EXACTLY the regenerate-delete predicate (server/routes.ts, D2/T1-1): delete rows
 *  whose `origin = 'ai'`, OR whose `origin IS NULL` and the legacy `suggestedBy`-based heuristic
 *  says "not expert" — sparing `origin = 'traveler'`, `origin = 'expert'`, and legacy
 *  `suggestedBy = 'expert'` rows. */
async function regenerateDeleteItineraryItems(tripId: string): Promise<void> {
  await db.delete(itineraryItems).where(
    and(
      eq(itineraryItems.tripId, tripId),
      or(
        eq(itineraryItems.origin, "ai"),
        and(
          isNull(itineraryItems.origin),
          or(isNull(itineraryItems.suggestedBy), ne(itineraryItems.suggestedBy, "expert")),
        ),
      ),
    ),
  );
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.owner}, ${`eap-${RUN}-owner@t.test`}, 'EAP', 'Owner', 'traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`eap-${RUN}-expert@t.test`}, 'EAP', 'Expert', 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.owner}, 'EAP fixture trip', 'Lisbon', CURRENT_DATE + 10, CURRENT_DATE + 15)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip2}, ${ids.owner}, 'EAP fixture trip 2 (D1 pending-gate)', 'Porto', CURRENT_DATE + 10, CURRENT_DATE + 15)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip3}, ${ids.owner}, 'EAP fixture trip 3 (D2 regenerate)', 'Faro', CURRENT_DATE + 10, CURRENT_DATE + 15)
  `);
  const created = await storage.createTripExpertAdvisor({
    tripId: ids.trip,
    localExpertId: ids.expert,
    message: "fixture assignment",
  });
  assignmentId = created.id;
  assert.equal(created.status, "pending", "fixture assignment must start pending");

  const created2 = await storage.createTripExpertAdvisor({
    tripId: ids.trip2,
    localExpertId: ids.expert,
    message: "fixture assignment 2 (D1 pending-gate)",
  });
  assignment2Id = created2.id;
  assert.equal(created2.status, "pending", "fixture assignment 2 must start pending");
});

after(async () => {
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id IN (${ids.trip}, ${ids.trip2}, ${ids.trip3})`).catch(() => {});
  for (const id of createdItemIds) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${ids.trip}, ${ids.trip2}, ${ids.trip3})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${ids.trip}, ${ids.trip2}, ${ids.trip3})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.trip2}, ${ids.trip3})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// EX-3 — the accept transition writes exactly one diary row, with the correct actor
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T1: acceptTripAssignment flips pending -> accepted and writes exactly one item_transition_log row", async () => {
  const before = await db.execute(sql`
    SELECT count(*)::int AS n FROM item_transition_log WHERE trip_id = ${ids.trip}
  `);
  assert.equal((before.rows[0] as any).n, 0, "no diary rows before accept");

  const updated = await storage.acceptTripAssignment(assignmentId, ids.expert);
  assert.ok(updated, "accept must succeed on a pending row owned by the expert");
  assert.equal(updated.status, "accepted");

  const rows = await db.execute(sql`
    SELECT trip_id, item_id, event_type, from_status, to_status, actor_type, actor_id
    FROM item_transition_log WHERE trip_id = ${ids.trip}
  `);
  assert.equal(rows.rows.length, 1, "exactly one diary row for the accept");
  const row = rows.rows[0] as any;
  assert.equal(row.trip_id, ids.trip);
  assert.equal(row.item_id, null, "trip-scoped event (ruling 16)");
  assert.equal(row.event_type, "assignment_accepted");
  assert.equal(row.from_status, "pending");
  assert.equal(row.to_status, "accepted");
  assert.equal(row.actor_type, "expert");
  assert.equal(row.actor_id, ids.expert, "actor is the accepting expert, derived from the call's own expertId param");
});

test("T2: a second accept on the now-accepted row is a no-op — atomic conditional unweakened, no extra diary row", async () => {
  const again = await storage.acceptTripAssignment(assignmentId, ids.expert);
  assert.equal(again, undefined, "the WHERE status='pending' guard still rejects a non-pending row (§15/§18b)");

  const rows = await db.execute(sql`
    SELECT count(*)::int AS n FROM item_transition_log WHERE trip_id = ${ids.trip}
  `);
  assert.equal((rows.rows[0] as any).n, 1, "still exactly one diary row — the loser wrote nothing");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CC-1 — expert-authored items are stamped server-side; a client-forged value is ignored
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T3: an accepted expert advisor's item is stamped suggestedBy='expert' + origin='expert', overriding client forgeries", async () => {
  // Sanity: the expert is now `accepted` on this trip (T1), so the WRITE-access predicate must be true.
  const isAdvisor = await storage.isExpertAssignedToTripForWrite(ids.trip, ids.expert);
  assert.equal(isAdvisor, true);

  const { status, item } = await postItineraryItem(ids.expert, ids.trip, {
    title: "Fado night in Alfama",
    dayNumber: 1,
    // The forgery: a hostile/naive client claims this was traveler-authored.
    suggestedBy: "user",
  });

  assert.equal(status, 201);
  assert.equal(
    item.suggestedBy,
    "expert",
    "server-derived from the session's trip_expert_advisors standing — the client's 'user' value is ignored",
  );
  assert.equal(item.origin, "expert", "D2: origin is server-derived from the same write-gated advisor flag");
});

test("T4: an unassigned caller is denied outright (403) — never reaches the stamping logic at all", async () => {
  const strangerId = `eap-${RUN}-stranger`;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${strangerId}, ${`eap-${RUN}-stranger@t.test`}, 'EAP', 'Stranger', 'traveler')
  `);
  try {
    const isAdvisor = await storage.isExpertAssignedToTripForWrite(ids.trip, strangerId);
    assert.equal(isAdvisor, false, "a user with no trip_expert_advisors row is not a write-access advisor");

    // A stranger is neither the trip owner nor a write-access advisor, so the route's access gate
    // (owned || assigned) denies them before the suggestedBy/origin derivation is even reached —
    // a STRONGER property than "the forged value is stripped": there is no create at all.
    const { status, item } = await postItineraryItem(strangerId, ids.trip, {
      title: "Forged expert item",
      dayNumber: 1,
      suggestedBy: "expert", // the forgery
      origin: "expert", // the forgery
    });
    assert.equal(status, 403, "no trip_collaborators/trip_expert_advisors standing ⇒ access denied");
    assert.equal(item, undefined, "nothing was created");
  } finally {
    await db.execute(sql`DELETE FROM users WHERE id = ${strangerId}`).catch(() => {});
  }
});

test("T5: owner-authored items are unaffected — no suggestedBy sent, none stamped; origin='traveler'", async () => {
  const { status, item } = await postItineraryItem(ids.owner, ids.trip, {
    title: "Owner-added museum visit",
    dayNumber: 2,
  });
  assert.equal(status, 201);
  assert.equal(item.suggestedBy, null, "owner path behavior unchanged: null when the client sends nothing");
  assert.equal(item.origin, "traveler", "D2: the owner/traveler path is stamped origin='traveler'");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// D1 — "a PENDING advisor may not write": denied while pending, allowed once accepted
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T6a: a PENDING advisor's item-create is denied (403) — write access requires accepted/assigned", async () => {
  const isReadAdvisor = await storage.isExpertAssignedToTrip(ids.trip2, ids.expert);
  assert.equal(isReadAdvisor, true, "sanity: the pending row still grants READ access (assigned-trips/inbox)");
  const isWriteAdvisor = await storage.isExpertAssignedToTripForWrite(ids.trip2, ids.expert);
  assert.equal(isWriteAdvisor, false, "a PENDING row does not grant WRITE access");

  const { status, item } = await postItineraryItem(ids.expert, ids.trip2, {
    title: "Premature edit while still pending",
    dayNumber: 1,
  });
  assert.equal(status, 403, "pending advisor cannot create an itinerary item");
  assert.equal(item, undefined);
});

test("T6b: after accepting, the SAME advisor's item-create succeeds (201) with origin='expert'", async () => {
  const before = await db.execute(sql`
    SELECT count(*)::int AS n FROM item_transition_log WHERE trip_id = ${ids.trip2}
  `);
  assert.equal((before.rows[0] as any).n, 0);

  const updated = await storage.acceptTripAssignment(assignment2Id, ids.expert);
  assert.ok(updated, "accept must succeed on trip2's pending row");
  assert.equal(updated.status, "accepted");

  const isWriteAdvisor = await storage.isExpertAssignedToTripForWrite(ids.trip2, ids.expert);
  assert.equal(isWriteAdvisor, true, "now accepted, write access is granted");

  const { status, item } = await postItineraryItem(ids.expert, ids.trip2, {
    title: "Post-accept edit",
    dayNumber: 1,
  });
  assert.equal(status, 201, "the previously-denied advisor may now create an item");
  assert.equal(item.suggestedBy, "expert");
  assert.equal(item.origin, "expert");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// D2 — itinerary_items.origin: 'ai' from AI-generation code paths; server-derived, never
// client-trusted; regenerate spares 'traveler'/'expert' rows and replaces 'ai' rows
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T7: an AI-generated item is stamped origin='ai' (the generate-itinerary insert path)", async () => {
  // AI-generation inserts are literal server-constructed objects (server/routes.ts's
  // generate-itinerary handler, db.insert(itineraryItems).values({..., origin: 'ai'})) — there is
  // no client body to forge here by construction (unlike the POST route's schema-parsed path
  // covered by T3/T4/T5), so this proves the value lands correctly rather than that a forgery is
  // ignored.
  const [created] = await db
    .insert(itineraryItems)
    .values({
      tripId: ids.trip,
      title: "AI-suggested walking tour",
      dayNumber: 3,
      origin: "ai",
    } as any)
    .returning();
  createdItemIds.push(created.id);
  assert.equal(created.origin, "ai");
});

test("T8: regenerate delete predicate spares origin='traveler' and origin='expert' rows, replaces origin='ai' rows, and legacy NULL rows keep the old suggestedBy heuristic", async () => {
  const rows = await db
    .insert(itineraryItems)
    .values([
      { tripId: ids.trip3, title: "AI row (replaced)", dayNumber: 1, origin: "ai" },
      { tripId: ids.trip3, title: "Traveler row (spared)", dayNumber: 1, origin: "traveler" },
      { tripId: ids.trip3, title: "Expert row (spared)", dayNumber: 1, origin: "expert" },
      // Legacy rows born before this column existed: origin IS NULL, fall back to the
      // pre-existing suggestedBy heuristic (T1-1's original fix).
      { tripId: ids.trip3, title: "Legacy expert row (spared, suggestedBy)", dayNumber: 1, suggestedBy: "expert" },
      { tripId: ids.trip3, title: "Legacy ambiguous row (replaced)", dayNumber: 1, suggestedBy: null },
    ] as any)
    .returning({ id: itineraryItems.id, title: itineraryItems.title });
  for (const r of rows) createdItemIds.push(r.id);

  await regenerateDeleteItineraryItems(ids.trip3);

  const survivors = await db
    .select({ title: itineraryItems.title })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, ids.trip3));
  const survivorTitles = survivors.map((s) => s.title).sort();

  assert.deepEqual(
    survivorTitles,
    ["Expert row (spared)", "Legacy expert row (spared, suggestedBy)", "Traveler row (spared)"].sort(),
    "only the AI row and the legacy ambiguous row were deleted; traveler/expert rows (by origin, " +
      "old or new) survive",
  );
});
