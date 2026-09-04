/**
 * PRE-TRIP EVENT PEN — behavioural proof (ledger `2026-09-04-plan-mint`, CLAUDE.md entry 30 (b)).
 *
 * `2026-09-03-switch-readers` shipped the "What's happening" chips and stated its own gap: with no
 * trip row yet the ticked chips are HELD in `trip_contexts.context.pendingEventTitles`, and nothing
 * ever promoted them — so a traveler who chose their events before the plan existed lost them.
 * `drainPendingEventsIntoTrip` closes that, and the four properties that make it safe to run on the
 * mint path are each proven here against real rows in a real database:
 *
 *   P1. PROMOTES        — one held title becomes exactly ONE `user_experiences` row bound to the
 *                         new trip (entry 29: an event IS that row), carrying the plan's date and
 *                         destination — and the pen is CLEARED, while every other held planning
 *                         field on the same context row survives untouched.
 *   P2. IDEMPOTENT      — a second pass creates nothing. Proven in both directions: after a
 *                         successful drain the pen is empty, and a pen deliberately re-seeded with
 *                         a title that already has a row on that trip is SKIPPED, not duplicated.
 *   P3. NEVER INVENTS AN OCCASION — `user_experiences.experience_type_id` is NOT NULL, so when the
 *                         held context names no resolvable `experience_types` row the drain creates
 *                         NOTHING and LEAVES THE PEN INTACT for a later mint (§13). The failure mode
 *                         that matters is the silent one: filing a traveler's events under a
 *                         nearest-looking occasion would look like success.
 *   P4. NEVER FAILS THE MINT — an owner-less (authoring-mode) trip and a caller with no context row
 *                         both return a stated reason rather than throwing, because this runs
 *                         INSIDE `storage.createTrip` and a throw here would kill the plan itself.
 *
 * NOT EXECUTED IN THE LANE THAT WROTE IT — there is no DATABASE_URL in that environment, so this
 * file is COMMITTED-BUT-UNRUN (the `checkout-claim-sweep.db.test.ts` posture): it needs a
 * disposable Postgres and is not CI-wired. The zone half of the same ledger row is proven by the
 * DB-free `server/__tests__/ics-calendar.test.ts`, which DID run (9/9).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/pending-events-drain.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { drainPendingEventsIntoTrip } from "../services/pending-events.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `pen-${RUN}-user`,
  occasion: `pen-${RUN}-occ`,
  trip: `pen-${RUN}-trip`,
  authoringTrip: `pen-${RUN}-authoring`,
  strangerUser: `pen-${RUN}-nopen`,
};
const OCCASION_SLUG = `pen-${RUN}-wedding`;

// ── Disposable-DB guard (mirrors the sweep suite's; never defaults open) ─────────────────────
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
      `[pending-events-drain] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

/** Fixture chain: two users → one occasion row → a traveler trip → an authoring (owner-less) trip. */
before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`pen-${RUN}@t.test`}, 'Pen', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.strangerUser}, ${`pen-${RUN}-b@t.test`}, 'Nopen', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO experience_types (id, name, slug)
    VALUES (${ids.occasion}, ${`Pen fixture wedding ${RUN}`}, ${OCCASION_SLUG})
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'Pen fixture trip', 'Kyoto, Japan', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
  // userId NULL is the authoring-mode shape (ready-made builds): no traveler principal exists.
  await db.execute(sql`
    INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date)
    VALUES (${ids.authoringTrip}, NULL, ${ids.user}, 'Pen authoring build', 'Kyoto, Japan', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM user_experiences WHERE trip_id IN (${ids.trip}, ${ids.authoringTrip})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_contexts WHERE user_id IN (${ids.user}, ${ids.strangerUser})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.authoringTrip})`).catch(() => {});
  await db.execute(sql`DELETE FROM experience_types WHERE id = ${ids.occasion}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.user}, ${ids.strangerUser})`).catch(() => {});
});

/** Seed the LEGACY (trip_id IS NULL) context row — the only row the pre-trip pen can live on. */
async function seedPen(userId: string, context: Record<string, unknown>): Promise<void> {
  await db.execute(sql`DELETE FROM trip_contexts WHERE user_id = ${userId} AND trip_id IS NULL`);
  await db.execute(sql`
    INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
    VALUES (${userId}, NULL, ${JSON.stringify(context)}::jsonb, NOW())
  `);
}

async function readContext(userId: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT context FROM trip_contexts WHERE user_id = ${userId} AND trip_id IS NULL LIMIT 1
  `);
  return (r.rows[0] as any)?.context ?? null;
}

async function eventTitles(tripId: string): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT title FROM user_experiences WHERE trip_id = ${tripId} ORDER BY title
  `);
  return (r.rows as any[]).map((row) => row.title as string);
}

async function clearEvents(tripId: string): Promise<void> {
  await db.execute(sql`DELETE FROM user_experiences WHERE trip_id = ${tripId}`);
}

// ── P1 ──────────────────────────────────────────────────────────────────────────────────────
test("P1 — held titles become one event row each, and only the pen key is cleared", async () => {
  await clearEvents(ids.trip);
  await seedPen(ids.user, {
    experienceSlug: OCCASION_SLUG,
    destination: "Kyoto, Japan",
    // A sibling held field: it must survive, because the drain owns ONE key, not the blob.
    mainMomentTime: "16:00",
    pendingEventTitles: ["Rehearsal dinner", "Ceremony", "  Ceremony  ", ""],
  });

  const out = await drainPendingEventsIntoTrip({
    userId: ids.user,
    tripId: ids.trip,
    destination: "Kyoto, Japan",
    startDate: "2034-04-01",
  });

  // Two events, not four: the empty string is dropped and the duplicate collapses.
  assert.equal(out.created, 2);
  assert.deepEqual(await eventTitles(ids.trip), ["Ceremony", "Rehearsal dinner"]);

  const row = await db.execute(sql`
    SELECT user_id, experience_type_id, event_date, location
    FROM user_experiences WHERE trip_id = ${ids.trip} AND title = 'Ceremony' LIMIT 1
  `);
  const created = row.rows[0] as any;
  assert.equal(created.user_id, ids.user, "the event belongs to the trip's owner, never anyone else");
  assert.equal(created.experience_type_id, ids.occasion);
  assert.equal(String(created.event_date).slice(0, 10), "2034-04-01");
  assert.equal(created.location, "Kyoto, Japan");

  const ctx = await readContext(ids.user);
  assert.equal(ctx.pendingEventTitles, undefined, "the pen is emptied once its titles have rows");
  assert.equal(ctx.mainMomentTime, "16:00", "every other held planning field survives the drain");
  assert.equal(ctx.destination, "Kyoto, Japan");
});

// ── P2 ──────────────────────────────────────────────────────────────────────────────────────
test("P2 — a second drain creates nothing, and an existing same-title event is skipped", async () => {
  // Direction 1: the pen is already empty after P1's successful drain.
  const second = await drainPendingEventsIntoTrip({
    userId: ids.user,
    tripId: ids.trip,
    destination: "Kyoto, Japan",
    startDate: "2034-04-01",
  });
  assert.equal(second.created, 0);
  assert.equal(second.reason, "no_titles");
  assert.equal((await eventTitles(ids.trip)).length, 2, "no duplicate rows on a replay");

  // Direction 2: a pen re-seeded with a title that already has a row (the panel's own POST could
  // have created it once a trip existed) must SKIP, not duplicate.
  await seedPen(ids.user, {
    experienceSlug: OCCASION_SLUG,
    pendingEventTitles: ["ceremony", "Welcome drinks"],
  });
  const third = await drainPendingEventsIntoTrip({
    userId: ids.user,
    tripId: ids.trip,
    destination: "Kyoto, Japan",
    startDate: "2034-04-01",
  });
  assert.equal(third.skipped, 1, "the case-insensitive match on an existing title is skipped");
  assert.equal(third.created, 1);
  assert.deepEqual(await eventTitles(ids.trip), ["Ceremony", "Rehearsal dinner", "Welcome drinks"]);
});

// ── P3 ──────────────────────────────────────────────────────────────────────────────────────
test("P3 — an unresolvable occasion creates NOTHING and keeps the pen", async () => {
  await clearEvents(ids.trip);
  await seedPen(ids.user, {
    experienceSlug: `definitely-not-a-real-occasion-${RUN}`,
    pendingEventTitles: ["Ceremony"],
  });

  const out = await drainPendingEventsIntoTrip({
    userId: ids.user,
    tripId: ids.trip,
    destination: "Kyoto, Japan",
    startDate: "2034-04-01",
  });

  assert.equal(out.created, 0);
  assert.equal(out.reason, "occasion_unresolved");
  assert.deepEqual(await eventTitles(ids.trip), [], "no event is filed under a guessed occasion");
  const ctx = await readContext(ids.user);
  assert.deepEqual(ctx.pendingEventTitles, ["Ceremony"], "the pen is KEPT — the titles are not lost");
});

// ── P4 ──────────────────────────────────────────────────────────────────────────────────────
test("P4 — an owner-less trip and a caller with no pen both return a reason, never throw", async () => {
  const authoring = await drainPendingEventsIntoTrip({
    userId: null,
    tripId: ids.authoringTrip,
    destination: "Kyoto, Japan",
    startDate: "2034-04-01",
  });
  assert.equal(authoring.created, 0);
  assert.equal(authoring.reason, "no_pen");
  assert.deepEqual(await eventTitles(ids.authoringTrip), []);

  const noContext = await drainPendingEventsIntoTrip({
    userId: ids.strangerUser,
    tripId: ids.trip,
    destination: "Kyoto, Japan",
    startDate: "2034-04-01",
  });
  assert.equal(noContext.created, 0);
  assert.equal(noContext.reason, "no_pen");
});
