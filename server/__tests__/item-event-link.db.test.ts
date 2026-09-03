/**
 * AN ITEM BELONGS TO AN EVENT — `itinerary_items.user_experience_id`.
 * Migration 277, ledger `2026-09-03-item-event-link`, CLAUDE.md entry 29.
 *
 * WHAT THIS LANE CHANGED, AND THEREFORE WHAT HAS TO BE PROVEN.
 * A plan is one `trips` row; an event inside that plan is one `user_experiences` row already bound
 * to it by the pre-existing nullable `trip_id`. The link the other direction — from the ITEM to
 * the event — is what this migration adds. Three properties carry the whole design and each one
 * has a test below:
 *
 *   1. the link is ADMITTED only through the pick-based allowlist, and the trip↔event PAIRING is
 *      re-read server-side rather than believed (§14/§19);
 *   2. NULL is the plan's ONE implicit unnamed event, so an item without a link is complete, not
 *      missing data (§13);
 *   3. deleting an event NEVER deletes the items under it (ON DELETE SET NULL) — the ratified
 *      behaviour, not an incidental FK choice.
 *
 * NEGATIVES FIRST, per house convention:
 *   N1  an event id from ANOTHER trip is REFUSED with a 400 and NOTHING is written. Proven on the
 *       LIVE PATCH rail (the real `trips.routes.ts` router, mounted here) — the item's existing
 *       link is byte-unchanged after the refusal — AND on the shared resolver the live POST rail
 *       calls, so both write rails are covered by the one proof. Note the cross-trip event here
 *       belongs to the SAME OWNER: this is not an ownership check wearing a different hat, it is
 *       the pairing check. Owning both plans still does not let you file an item under the other
 *       plan's event.
 *   N2  deleting the event sets the item's link to NULL and THE ITEM SURVIVES. A CASCADE would
 *       have let removing a "Rehearsal dinner" card silently destroy every item beneath it; the
 *       item instead falls back to the plan's implicit event, which is what NULL means.
 *
 * POSITIVES:
 *   P1  an item created with a valid SAME-TRIP event id carries it. Driven through the two steps
 *       the live POST performs — the real `itineraryItemEventLinkSchema` parse and the real
 *       `resolveItemEventLink` — then the real `storage.createItineraryItem`.
 *       STATED LIMIT (§18d negative space): `POST /api/trips/:tripId/itinerary-items` lives in the
 *       `server/routes.ts` MONOLITH, which no test in this repo mounts (it is not a router), so
 *       this proves the ADMISSION and the WRITE, not that handler's express wiring. The PATCH rail
 *       in N1/P1b IS mounted for real, and both rails call the SAME resolver by construction —
 *       that shared call is the thing §18 rule 1 asks for and is what makes one proof cover two.
 *   P1b an explicit `null` on the live PATCH rail moves the item BACK to the implicit event, while
 *       a body that never mentions the key leaves the existing link ALONE. Absent ≠ null.
 *   P2  the plancard payload lists the trip's events, and the linked activity carries
 *       `userExperienceId` pointing into that list.
 *
 * BENCH SUITE, NOT CI-WIRED (house `*.db.test.ts` posture): this file writes real rows and is run
 * on demand against a disposable database, not by `.github/workflows/build.yml`.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/item-event-link.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  experienceTypes,
  itineraryItems,
  itineraryItemEventLinkSchema,
  trips,
  userExperiences,
  users,
} from "@shared/schema";
// The REAL admission the live POST rail runs. Imported, never re-implemented — if the predicate
// moves, this test fails rather than drifting away from it silently.
import { resolveItemEventLink } from "../services/item-event-link.service";
import tripsRoutes from "../routes/trips.routes";
import plancardRoutes from "../routes/plancard.routes";

const RUN = crypto.randomUUID().slice(0, 8);

// ── Disposable-DB guard (mirrors slip-stay-projection.db.test.ts; never defaults open) ─────────
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
      `[item-event-link] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let userId = "";
let experienceTypeId = "";
/** THE plan under test, and a SECOND plan owned by the SAME user (see N1). */
let tripId = "";
let otherTripId = "";
/** One event on each plan. */
let eventId = "";
let otherTripEventId = "";

/**
 * Mounts the REAL routers with a chosen session identity — the same harness shape
 * user-experience-ownership.db.test.ts uses. `isAuthenticated` does a live `users` lookup and
 * fails closed, which is why the account is a real seeded row: a test that stubbed the guard could
 * pass against an unfixed handler for the wrong reason.
 */
async function withRoutersAs<T>(asUserId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: asUserId, name: "Test Owner" } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(tripsRoutes);
  app.use(plancardRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function seedItem(fields: Record<string, unknown> = {}): Promise<string> {
  const [row] = await db.insert(itineraryItems).values({
    tripId,
    title: `Item ${RUN}`,
    itemType: "activity",
    dayNumber: 1,
    origin: "traveler",
    ...fields,
  } as any).returning();
  return row.id;
}

async function readLink(itemId: string): Promise<string | null | undefined> {
  const r = await db.execute(
    sql`SELECT user_experience_id FROM itinerary_items WHERE id = ${itemId}`,
  );
  const row = r.rows[0] as any;
  return row ? (row.user_experience_id as string | null) : undefined;
}

before(async () => {
  await assertDisposableDb();

  const [u] = await db.insert(users).values({ email: `item-event-${RUN}@t.test` } as any).returning();
  userId = u.id;

  const [et] = await db.insert(experienceTypes).values({
    name: `Item-event type ${RUN}`,
    slug: `item-event-${RUN}`,
  } as any).returning();
  experienceTypeId = et.id;

  const mkTrip = async (label: string) => {
    const [t] = await db.insert(trips).values({
      userId,
      title: `${label} ${RUN}`,
      destination: "Kyoto, Japan",
      startDate: "2027-04-10",
      endDate: "2027-04-13",
    } as any).returning();
    return t.id;
  };
  tripId = await mkTrip("Plan under test");
  otherTripId = await mkTrip("A second plan, same owner");

  const mkEvent = async (onTripId: string, title: string) => {
    const [e] = await db.insert(userExperiences).values({
      userId,
      experienceTypeId,
      tripId: onTripId,
      title,
      eventDate: "2027-04-11",
      location: "Kyoto",
      guestCount: 40,
    } as any).returning();
    return e.id;
  };
  eventId = await mkEvent(tripId, `Ceremony ${RUN}`);
  otherTripEventId = await mkEvent(otherTripId, `Someone else's ceremony ${RUN}`);
});

after(async () => {
  for (const t of [tripId, otherTripId].filter(Boolean)) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${t}`).catch(() => {});
  }
  await db.delete(userExperiences).where(eq(userExperiences.userId, userId)).catch(() => {});
  for (const t of [tripId, otherTripId].filter(Boolean)) {
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`).catch(() => {});
  }
  await db.delete(experienceTypes).where(eq(experienceTypes.id, experienceTypeId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

// ───────────────────────────── NEGATIVES ─────────────────────────────

test("N1 an event id from ANOTHER trip is refused with 400 and nothing is written", async () => {
  // The item starts correctly filed under THIS plan's event, so a refusal that silently wrote
  // anyway would be visible as a changed link — not merely as an absent one.
  const itemId = await seedItem({ userExperienceId: eventId });
  assert.equal(await readLink(itemId), eventId);

  // (a) THE LIVE PATCH RAIL — the real router, the real auth, the real handler.
  const status = await withRoutersAs(userId, async (base) => {
    const res = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Renamed ${RUN}`, userExperienceId: otherTripEventId }),
    });
    return res.status;
  });
  assert.equal(status, 400, "a cross-trip event id must be a visible 400, never a silent drop");
  assert.equal(await readLink(itemId), eventId, "the existing link must be byte-unchanged");

  // …and NOTHING ELSE on the row was written either: the refusal precedes the whole update, so the
  // title the same request tried to change is untouched.
  const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
  assert.equal(row.title, `Item ${RUN}`, "a refused request must not half-apply its other fields");

  // (b) THE SHARED RESOLVER the live POST rail calls — same refusal, so both rails are covered.
  const viaPost = await resolveItemEventLink(tripId, true, otherTripEventId);
  assert.equal(viaPost.ok, false);

  // A nonexistent id is refused identically — a caller must not be able to probe which event ids
  // exist by reading the difference between the two refusals.
  const unknown = await resolveItemEventLink(tripId, true, crypto.randomUUID());
  assert.equal(unknown.ok, false);
  assert.equal(
    (unknown as any).message,
    (viaPost as any).message,
    "unknown and cross-trip must be indistinguishable to the caller",
  );
});

test("N2 deleting the event sets the item's link NULL — the item survives", async () => {
  const [doomed] = await db.insert(userExperiences).values({
    userId,
    experienceTypeId,
    tripId,
    title: `Rehearsal dinner ${RUN}`,
  } as any).returning();
  const itemId = await seedItem({ userExperienceId: doomed.id, title: `Florist ${RUN}` });
  assert.equal(await readLink(itemId), doomed.id);

  await db.delete(userExperiences).where(eq(userExperiences.id, doomed.id));

  const [survivor] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
  assert.ok(survivor, "ON DELETE SET NULL — deleting an event must NEVER delete the items under it");
  assert.equal(survivor.title, `Florist ${RUN}`);
  assert.equal(
    (survivor as any).userExperienceId,
    null,
    "the item falls back to the plan's ONE implicit unnamed event, which is what NULL means",
  );
});

// ───────────────────────────── POSITIVES ─────────────────────────────

test("P1 an item created with a valid same-trip event id carries it", async () => {
  // The two steps the live POST performs, run against the REAL schema and the REAL resolver.
  const parsed = itineraryItemEventLinkSchema.safeParse({
    title: "ignored by the allowlist",
    routingStatus: "purchased", // a privileged column the allowlist must NOT carry through
    userExperienceId: eventId,
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(
    Object.keys((parsed as any).data),
    ["userExperienceId"],
    "the ALLOWLIST admits exactly one field — a pick, not a denylist",
  );

  const resolved = await resolveItemEventLink(tripId, true, (parsed as any).data.userExperienceId);
  assert.equal(resolved.ok, true);
  assert.equal((resolved as any).action, "set");
  assert.equal((resolved as any).value, eventId);

  const item = await storage.createItineraryItem({
    tripId,
    title: `Ceremony flowers ${RUN}`,
    itemType: "activity",
    dayNumber: 2,
    origin: "traveler",
    userExperienceId: (resolved as any).value,
  } as any);

  assert.equal(await readLink(item.id), eventId);
});

test("P1b on the live PATCH rail an explicit null unfiles the item; an absent key leaves it alone", async () => {
  const itemId = await seedItem({ userExperienceId: eventId });

  await withRoutersAs(userId, async (base) => {
    // ABSENT ⇒ the caller is not talking about the link. It must survive an unrelated edit.
    const untouched = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Still filed ${RUN}` }),
    });
    assert.equal(untouched.status, 200);
    assert.equal(await readLink(itemId), eventId, "an absent key must never clear the link");

    // EXPLICIT NULL ⇒ move it back to the plan's implicit event.
    const cleared = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userExperienceId: null }),
    });
    assert.equal(cleared.status, 200);
    assert.equal(await readLink(itemId), null);

    // …and a same-trip id files it again.
    const refiled = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userExperienceId: eventId }),
    });
    assert.equal(refiled.status, 200);
    assert.equal(await readLink(itemId), eventId);
  });
});

test("P2 the plancard payload lists the trip's events, and the item points into that list", async () => {
  const itemId = await seedItem({ userExperienceId: eventId, title: `Reception cake ${RUN}`, dayNumber: 3 });

  const body = await withRoutersAs(userId, async (base) => {
    const res = await fetch(`${base}/api/trips/${tripId}/plancard`);
    assert.equal(res.status, 200);
    return (await res.json()) as any;
  });

  assert.ok(Array.isArray(body.events), "the plancard payload must carry an events array");
  const listed = body.events.find((e: any) => e.id === eventId);
  assert.ok(listed, "the trip's own event must be listed");
  assert.equal(listed.title, `Ceremony ${RUN}`);
  assert.equal(listed.location, "Kyoto");
  assert.equal(listed.guestCount, 40);
  assert.equal(listed.experienceTypeId, experienceTypeId);
  // The OTHER plan's event must never appear on this plan's payload.
  assert.equal(
    body.events.some((e: any) => e.id === otherTripEventId),
    false,
    "events are scoped to THIS trip",
  );

  const activities = (body.days ?? []).flatMap((d: any) => d.activities ?? []);
  const activity = activities.find((a: any) => a.id === itemId);
  assert.ok(activity, "the linked item must be on the plancard");
  assert.equal(activity.userExperienceId, eventId, "the id points into the events array");
});
