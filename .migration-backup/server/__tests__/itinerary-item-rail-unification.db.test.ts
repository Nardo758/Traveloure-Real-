/**
 * V4 — itinerary-item edit/delete rail unification (info-level finding, decision-maker approved).
 *
 * Prior state: TWO rails existed for editing/deleting an itinerary item —
 *  - CANONICAL (trip-scoped): PATCH/DELETE /api/trips/:tripId/itinerary-items/:itemId
 *    (server/routes/trips.routes.ts) — advisor-aware (`getTripWriteRole`/`canMutateTrip`/
 *    `isTripAuthor`) AND applies the plan-approval mode-flip (`isPlanApprovedForExpert` ->
 *    409 plan_approved_suggest_instead once the client approves the delivered plan).
 *  - BARE (item-scoped): PATCH/DELETE /api/itinerary-items/:id (server/routes.ts, live —
 *    registered before trips.routes.ts's identically-shaped §9 mount-order-dead twin) — gated
 *    ONLY by `verifyTripOwnership`: owner-only, no advisor branch at all, so an accepted expert
 *    could not write through it, and the authorization model diverged from the canonical rail.
 *
 * Caller trace (client/src, server, playwright, scripts/journeys — see the S2 report for the
 * full table): ZERO live callers of the bare path anywhere. client/src/pages/expert/workspace.tsx
 * carries its own comment explaining it deliberately avoids the bare DELETE precisely because of
 * this owner-only gate. Per CLAUDE.md §18c ("no consumer + duplicate rail ⇒ delete, don't gate"),
 * both the live bare handlers in routes.ts and their already-dead §9 twins in trips.routes.ts were
 * RETIRED rather than re-gated — a second, unaudited authorization implementation of the same
 * operation is exactly the class this closes. Bonus: retiring the DELETE side also closes the L13/
 * L22-filed orphan-leg cascade gap (the bare DELETE called `itineraryIntelligenceService.deleteItem`,
 * not the cascade-safe `storage.deleteItineraryItem` the canonical rail uses).
 *
 * This file proves the SURVIVING canonical rail's authorization matrix by reproducing its exact
 * logic against the same exported building blocks the route calls (`getTripWriteRole`,
 * `canMutateTrip`, `isTripAuthor`, `isPlanApprovedForExpert`, `storage.getItineraryItemByIdAndTrip`,
 * `storage.updateItineraryItem`, `storage.deleteItineraryItem`) — the same "reproduce the route,
 * don't reimplement it" approach as expert-attribution-and-accept-diary.db.test.ts and
 * booking-birth-provenance.db.test.ts. It also asserts the route's server-side strip of
 * `origin`/`suggestedBy`/`id`/`tripId`/`createdAt`/`updatedAt` on PATCH (mass-assignment guard).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: DATABASE_URL=postgresql://postgres@127.0.0.1:5433/traveloure npx tsx --test server/__tests__/itinerary-item-rail-unification.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { getTripWriteRole, canMutateTrip } from "../utils/trip-role";
import { isTripAuthor } from "../utils/trip-authorship";
import { isPlanApprovedForExpert, PLAN_APPROVED_SUGGEST_INSTEAD_ERROR } from "../utils/plan-approval";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `iru-${RUN}-owner`,
  expert: `iru-${RUN}-expert`,
  stranger: `iru-${RUN}-stranger`,
  trip: `iru-${RUN}-trip`,
};
const createdItemIds: string[] = [];
let assignmentId = "";

// ── Disposable-DB guard (mirrors expert-attribution-and-accept-diary.db.test.ts; never defaults open) ──
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
      `[itinerary-item-rail-unification] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** Reproduces EXACTLY what the canonical PATCH handler
 *  (server/routes/trips.routes.ts, `PATCH /api/trips/:tripId/itinerary-items/:itemId`) does:
 *  (1) resolve the WRITE-gated trip role + parallel author branch;
 *  (2) 403 if neither passes;
 *  (3) 409 plan_approved_suggest_instead if the caller is the advisor branch AND the plan is approved;
 *  (4) 404 if the item does not belong to the trip;
 *  (5) strip id/tripId/createdAt/updatedAt/suggestedBy/origin from the body before the update. */
async function patchItineraryItem(
  actingUserId: string,
  tripId: string,
  itemId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body?: any }> {
  const tripRole = await getTripWriteRole(tripId, actingUserId);
  const authorMayMutate = canMutateTrip(tripRole) ? false : await isTripAuthor(tripId, actingUserId);
  if (!canMutateTrip(tripRole) && !authorMayMutate) {
    return {
      status: 403,
      body: { message: tripRole === "friend" ? "Friends can only suggest changes, not edit activities directly" : "Access denied" },
    };
  }
  if (tripRole === "expert" && (await isPlanApprovedForExpert(tripId, actingUserId))) {
    return { status: 409, body: PLAN_APPROVED_SUGGEST_INSTEAD_ERROR };
  }
  const existing = await storage.getItineraryItemByIdAndTrip(itemId, tripId);
  if (!existing) return { status: 404, body: { message: "Item not found in this trip" } };
  const { id: _id, tripId: _tripId, createdAt: _createdAt, updatedAt: _updatedAt, suggestedBy: _sb, origin: _origin, ...safeBody } = body as any;
  const updated = await storage.updateItineraryItem(itemId, safeBody);
  if (!updated) return { status: 404, body: { message: "Item not found" } };
  return { status: 200, body: updated };
}

/** Reproduces EXACTLY what the canonical DELETE handler does — same gate/mode-flip, then
 *  `storage.deleteItineraryItem` (the cascade-safe path, unlike the retired bare rail). */
async function deleteItineraryItem(
  actingUserId: string,
  tripId: string,
  itemId: string,
): Promise<{ status: number; body?: any }> {
  const tripRole = await getTripWriteRole(tripId, actingUserId);
  const authorMayMutate = canMutateTrip(tripRole) ? false : await isTripAuthor(tripId, actingUserId);
  if (!canMutateTrip(tripRole) && !authorMayMutate) {
    return {
      status: 403,
      body: { message: tripRole === "friend" ? "Friends cannot remove activities" : "Access denied" },
    };
  }
  if (tripRole === "expert" && (await isPlanApprovedForExpert(tripId, actingUserId))) {
    return { status: 409, body: PLAN_APPROVED_SUGGEST_INSTEAD_ERROR };
  }
  const existing = await storage.getItineraryItemByIdAndTrip(itemId, tripId);
  if (!existing) return { status: 404, body: { message: "Item not found in this trip" } };
  await storage.deleteItineraryItem(itemId);
  return { status: 200, body: { success: true } };
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.owner}, ${`iru-${RUN}-owner@t.test`}, 'IRU', 'Owner', 'traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`iru-${RUN}-expert@t.test`}, 'IRU', 'Expert', 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.stranger}, ${`iru-${RUN}-stranger@t.test`}, 'IRU', 'Stranger', 'traveler')
  `);
  // storage.createTrip (not a raw insert) so the owner's trip_collaborators row is written —
  // getTripRole/getTripWriteRole resolve access by assignment only, never trips.userId.
  const trip = await storage.createTrip({
    userId: ids.owner,
    title: "IRU fixture trip",
    destination: "Lisbon",
    startDate: "2026-09-10" as any,
    endDate: "2026-09-15" as any,
  } as any);
  ids.trip = trip.id;

  const created = await storage.createTripExpertAdvisor({
    tripId: ids.trip,
    localExpertId: ids.expert,
    message: "fixture assignment",
  });
  assignmentId = created.id;
  assert.equal(created.status, "pending", "fixture assignment must start pending");
});

after(async () => {
  for (const id of createdItemIds) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert}, ${ids.stranger})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (b) pending advisor -> 403 (write access requires accepted/assigned, same D1 posture as create)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T1: a PENDING advisor's PATCH is denied (403) — write access requires accepted/assigned", async () => {
  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Fixture item A", dayNumber: 1 } as any);
  createdItemIds.push(item.id);

  const isWriteAdvisor = await storage.isExpertAssignedToTripForWrite(ids.trip, ids.expert);
  assert.equal(isWriteAdvisor, false, "a PENDING row does not grant WRITE access");

  const res = await patchItineraryItem(ids.expert, ids.trip, item.id, { title: "Premature edit" });
  assert.equal(res.status, 403);
});

test("T1b: the same PENDING advisor's DELETE is also denied (403)", async () => {
  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Fixture item B", dayNumber: 1 } as any);
  createdItemIds.push(item.id);

  const res = await deleteItineraryItem(ids.expert, ids.trip, item.id);
  assert.equal(res.status, 403);

  const stillThere = await storage.getItineraryItemByIdAndTrip(item.id, ids.trip);
  assert.ok(stillThere, "item must survive a denied delete");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (c) stranger -> 403 (no trip_collaborators / trip_expert_advisors standing at all)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T2: a stranger with no trip standing is denied (403) on PATCH and DELETE", async () => {
  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Fixture item C", dayNumber: 1 } as any);
  createdItemIds.push(item.id);

  const patchRes = await patchItineraryItem(ids.stranger, ids.trip, item.id, { title: "Forged edit" });
  assert.equal(patchRes.status, 403);

  const deleteRes = await deleteItineraryItem(ids.stranger, ids.trip, item.id);
  assert.equal(deleteRes.status, 403);

  const stillThere = await storage.getItineraryItemByIdAndTrip(item.id, ids.trip);
  assert.ok(stillThere, "item must survive a denied delete");
  assert.equal(stillThere.title, "Fixture item C", "item must survive a denied edit unchanged");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (d) owner -> always allowed, never affected by the advisor mode-flip
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T3: the owner can always PATCH, even while the advisor's plan is later marked approved", async () => {
  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Owner-editable item", dayNumber: 1 } as any);
  createdItemIds.push(item.id);

  // Accept the advisor + approve the plan FIRST, so this test proves the owner path is immune
  // to the mode-flip that gates the advisor branch below.
  const accepted = await storage.acceptTripAssignment(assignmentId, ids.expert);
  assert.ok(accepted, "accept must succeed on the pending fixture row");
  await db.execute(sql`
    UPDATE trip_expert_advisors SET plan_approval_status = 'approved' WHERE id = ${assignmentId}
  `);
  const approved = await isPlanApprovedForExpert(ids.trip, ids.expert);
  assert.equal(approved, true, "sanity: the plan is now approved for this advisor");

  const res = await patchItineraryItem(ids.owner, ids.trip, item.id, { title: "Owner renamed this" });
  assert.equal(res.status, 200, "owner writes are never blocked by the advisor mode-flip");
  assert.equal(res.body.title, "Owner renamed this");
});

test("T3b: the owner can always DELETE under the same approved-plan conditions", async () => {
  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Owner-deletable item", dayNumber: 1 } as any);
  createdItemIds.push(item.id);

  const res = await deleteItineraryItem(ids.owner, ids.trip, item.id);
  assert.equal(res.status, 200);
  const gone = await storage.getItineraryItemByIdAndTrip(item.id, ids.trip);
  assert.equal(gone, null, "item is actually gone (cascade-safe storage.deleteItineraryItem path)");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (a) accepted advisor: 200 pre-approval, 409 plan_approved_suggest_instead post-approval
// (plan_approval_status was flipped to 'approved' by T3 above, on the SAME assignment row —
// re-verified here so this block is a self-contained proof of the mode-flip itself)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T4: an ACCEPTED advisor can PATCH pre-approval (200)", async () => {
  // Reset the approval flag so this test proves the pre-approval branch in isolation.
  await db.execute(sql`
    UPDATE trip_expert_advisors SET plan_approval_status = NULL WHERE id = ${assignmentId}
  `);
  const isWriteAdvisor = await storage.isExpertAssignedToTripForWrite(ids.trip, ids.expert);
  assert.equal(isWriteAdvisor, true, "accepted (T3's acceptTripAssignment call) grants write access");
  const approved = await isPlanApprovedForExpert(ids.trip, ids.expert);
  assert.equal(approved, false, "plan approval reset to null for this test");

  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Advisor pre-approval item", dayNumber: 2 } as any);
  createdItemIds.push(item.id);

  const res = await patchItineraryItem(ids.expert, ids.trip, item.id, { title: "Advisor direct-edit" });
  assert.equal(res.status, 200, "pre-approval, the accepted advisor may write directly");
  assert.equal(res.body.title, "Advisor direct-edit");
});

test("T5: the SAME accepted advisor's PATCH 409s once the plan is approved (mode-flip)", async () => {
  await db.execute(sql`
    UPDATE trip_expert_advisors SET plan_approval_status = 'approved' WHERE id = ${assignmentId}
  `);
  const approved = await isPlanApprovedForExpert(ids.trip, ids.expert);
  assert.equal(approved, true);

  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Advisor post-approval item", dayNumber: 2 } as any);
  createdItemIds.push(item.id);

  const res = await patchItineraryItem(ids.expert, ids.trip, item.id, { title: "Should be refused" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "plan_approved_suggest_instead");

  const unchanged = await storage.getItineraryItemByIdAndTrip(item.id, ids.trip);
  assert.equal(unchanged.title, "Advisor post-approval item", "the item was NOT mutated by the refused PATCH");
});

test("T5b: the SAME accepted advisor's DELETE 409s once the plan is approved (mode-flip)", async () => {
  const approved = await isPlanApprovedForExpert(ids.trip, ids.expert);
  assert.equal(approved, true, "plan is still approved from T5");

  const item = await storage.createItineraryItem({ tripId: ids.trip, title: "Advisor post-approval delete target", dayNumber: 2 } as any);
  createdItemIds.push(item.id);

  const res = await deleteItineraryItem(ids.expert, ids.trip, item.id);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "plan_approved_suggest_instead");

  const stillThere = await storage.getItineraryItemByIdAndTrip(item.id, ids.trip);
  assert.ok(stillThere, "the item was NOT deleted by the refused DELETE");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Mass-assignment strip: origin/suggestedBy (and id/tripId/createdAt/updatedAt) are never
// client-settable via PATCH — mirrors the canonical route's own strip (§19 posture).
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T6: PATCH strips a client-forged origin/suggestedBy — the item's provenance is unchanged", async () => {
  const item = await storage.createItineraryItem({
    tripId: ids.trip,
    title: "Provenance-stamped item",
    dayNumber: 1,
    origin: "traveler",
  } as any);
  createdItemIds.push(item.id);

  const res = await patchItineraryItem(ids.owner, ids.trip, item.id, {
    title: "Renamed by owner",
    origin: "expert", // forgery: client tries to retroactively rewrite provenance
    suggestedBy: "expert", // forgery
    id: "hostile-id-override", // forgery
    tripId: "hostile-trip-override", // forgery
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "Renamed by owner", "the legitimate field DID apply");
  assert.equal(res.body.origin, "traveler", "origin is immutable post-create — the forged value was stripped");
  assert.equal(res.body.id, item.id, "id cannot be overridden");
  assert.equal(res.body.tripId, ids.trip, "tripId cannot be overridden");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Retirement proof: the bare item-scoped rail is gone from both route tables.
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("T7: the retired bare rail's route registrations are gone from routes.ts and trips.routes.ts", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.resolve(import.meta.dirname, "..", "..");
  const routesSrc = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
  const tripsRoutesSrc = fs.readFileSync(path.join(root, "server", "routes", "trips.routes.ts"), "utf8");

  assert.doesNotMatch(routesSrc, /app\.patch\(\s*["']\/api\/itinerary-items\/:id["']/);
  assert.doesNotMatch(routesSrc, /app\.delete\(\s*["']\/api\/itinerary-items\/:id["']/);
  assert.doesNotMatch(tripsRoutesSrc, /router\.patch\(\s*["']\/api\/itinerary-items\/:id["']/);
  assert.doesNotMatch(tripsRoutesSrc, /router\.delete\(\s*["']\/api\/itinerary-items\/:id["']/);

  // The canonical trip-scoped rail is still there and is now the ONLY PATCH/DELETE path for an
  // itinerary item.
  assert.match(tripsRoutesSrc, /router\.patch\(\s*["']\/api\/trips\/:tripId\/itinerary-items\/:itemId["']/);
  assert.match(tripsRoutesSrc, /router\.delete\(\s*["']\/api\/trips\/:tripId\/itinerary-items\/:itemId["']/);
});
