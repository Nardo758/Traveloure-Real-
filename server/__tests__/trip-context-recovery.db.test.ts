/**
 * RC-4 — A NEW SESSION RECOVERS THE ACTIVE PLAN (ledger `2026-09-25-rc345-active-plan`; audit
 * `docs/audits/GAP_REGISTER.md` §A row 25, `docs/audits/H8_ACTIVE_TRIP_RESOLUTION.md` D1(ii),
 * proven in the browser as J2 R2b).
 *
 * The client pen hydrates from `GET /api/trip-context` with NO `?tripId=` whenever its local pen
 * names no trip — which is every new tab or device. That read answered the legacy
 * `trip_id IS NULL` row by predicate, while a mint pushes the pen into the TRIP-SCOPED row and
 * never into the legacy one. So the legacy row held no plan identity, the pen stayed `{}`, and
 * the next add went to the cart. The bare read now answers the account's MOST RECENTLY WRITTEN
 * row, whichever scope — the server's own record of the last write, never a guess (§13).
 *
 * What these hold (the REAL router, a chosen session identity — the `dates-confirmed` harness):
 *   T1  a trip-scoped row newer than the legacy row is the answer, and it carries its `tripId`
 *       even when the pushed blob did not.
 *   T2  a legacy row newer than every trip-scoped row is the answer, with NO `tripId` added — a
 *       fresh pre-mint draft is not re-attributed to an older plan.
 *   T3  an account with no row at all gets `{}` (nothing is invented).
 *   T4  `?tripId=` is UNCHANGED: it answers that trip's own row, whatever is newer.
 *   T5  §14 — another account's newer row is never the answer; the owner is the session.
 *   T6  a bare PUT still lands on the legacy row (the write side is untouched).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit \
 *        server/__tests__/trip-context-recovery.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import tripContextRoutes from "../routes/trip-context.routes";

const RUN = crypto.randomBytes(4).toString("hex");
const ids = { owner: `tcr-${RUN}-owner`, other: `tcr-${RUN}-other` };

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[trip-context-recovery] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function asUser<T>(userId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "Test Actor" } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(tripContextRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function getPen(userId: string, tripId?: string): Promise<Record<string, unknown>> {
  return asUser(userId, async (base) => {
    const res = await fetch(`${base}/api/trip-context${tripId ? `?tripId=${tripId}` : ""}`);
    assert.equal(res.status, 200);
    return ((await res.json()) as any).context;
  });
}

/** Writes a pen row directly with a chosen `updated_at`, so ordering is under the test's control. */
async function writeRow(userId: string, tripId: string | null, context: Record<string, unknown>, updatedAt: string) {
  await db.execute(sql`
    INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
    VALUES (${userId}, ${tripId}, ${JSON.stringify(context)}::jsonb, ${updatedAt}::timestamp)
  `);
}
async function clearRows(userId: string) {
  await db.execute(sql`DELETE FROM trip_contexts WHERE user_id = ${userId}`);
}

const tripIds: string[] = [];
async function mint(userId: string, destination: string): Promise<string> {
  const trip = await storage.createTrip({
    userId,
    title: `Recovery fixture ${RUN}`,
    destination,
    startDate: "2027-04-10",
    endDate: "2027-04-14",
  } as any);
  tripIds.push(trip.id);
  return trip.id;
}

let kyoto = "";
let osaka = "";
let othersTrip = "";

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.owner}, ${`tcr-${RUN}-o@t.test`}, 'Recovery', 'Owner'),
           (${ids.other}, ${`tcr-${RUN}-x@t.test`}, 'Recovery', 'Other')
  `);
  kyoto = await mint(ids.owner, "Kyoto");
  osaka = await mint(ids.owner, "Osaka");
  othersTrip = await mint(ids.other, "Lisbon");
});

after(async () => {
  await clearRows(ids.owner);
  await clearRows(ids.other);
  for (const t of tripIds) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${t}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`);
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.other})`);
});

test("T1: the newest row is trip-scoped ⇒ it is the answer, carrying its tripId", async () => {
  await clearRows(ids.owner);
  await writeRow(ids.owner, null, { destination: "Somewhere old" }, "2026-09-01 10:00:00");
  // The blob deliberately omits `tripId`: the row's own `trip_id` is the identity.
  await writeRow(ids.owner, kyoto, { destination: "Kyoto", travelers: 2 }, "2026-09-02 10:00:00");
  const pen = await getPen(ids.owner);
  assert.equal(pen.tripId, kyoto);
  assert.equal(pen.destination, "Kyoto");
  assert.equal(pen.travelers, 2);
});

test("T2: the newest row is the legacy draft ⇒ it is the answer, and NO tripId is added", async () => {
  await clearRows(ids.owner);
  await writeRow(ids.owner, kyoto, { destination: "Kyoto", tripId: kyoto }, "2026-09-01 10:00:00");
  await writeRow(ids.owner, null, { destination: "A new draft" }, "2026-09-03 10:00:00");
  const pen = await getPen(ids.owner);
  assert.equal(pen.destination, "A new draft");
  assert.equal(pen.tripId, undefined, "a pre-mint draft is not re-attributed to an older plan (§13)");
});

test("T3: no row at all ⇒ {} — nothing is invented", async () => {
  await clearRows(ids.owner);
  assert.deepEqual(await getPen(ids.owner), {});
});

test("T4: ?tripId= is unchanged — that trip's own row, whatever is newer", async () => {
  await clearRows(ids.owner);
  await writeRow(ids.owner, kyoto, { destination: "Kyoto" }, "2026-09-01 10:00:00");
  await writeRow(ids.owner, osaka, { destination: "Osaka" }, "2026-09-05 10:00:00");
  await writeRow(ids.owner, null, { destination: "Draft" }, "2026-09-06 10:00:00");
  const pen = await getPen(ids.owner, kyoto);
  assert.equal(pen.destination, "Kyoto");
  assert.equal(pen.tripId, kyoto);
  const bare = await getPen(ids.owner);
  assert.equal(bare.destination, "Draft");
});

test("T5: §14 — another account's newer row is never the answer", async () => {
  await clearRows(ids.owner);
  await clearRows(ids.other);
  await writeRow(ids.owner, kyoto, { destination: "Kyoto" }, "2026-09-01 10:00:00");
  await writeRow(ids.other, othersTrip, { destination: "Lisbon" }, "2026-09-09 10:00:00");
  const pen = await getPen(ids.owner);
  assert.equal(pen.tripId, kyoto);
  assert.equal(pen.destination, "Kyoto");
});

test("T6: a bare PUT still lands on the legacy row; the write side is untouched", async () => {
  await clearRows(ids.owner);
  await asUser(ids.owner, async (base) => {
    const res = await fetch(`${base}/api/trip-context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { destination: "Written bare" } }),
    });
    assert.equal(res.status, 200);
  });
  const r = await db.execute(sql`SELECT trip_id, context FROM trip_contexts WHERE user_id = ${ids.owner}`);
  assert.equal(r.rows.length, 1);
  assert.equal((r.rows[0] as any).trip_id, null);
  assert.equal((await getPen(ids.owner)).destination, "Written bare");
});
