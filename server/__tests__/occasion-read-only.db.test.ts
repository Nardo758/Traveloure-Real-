/**
 * A PLAN'S STORED OCCASION IS WRITTEN ONLY BY AN OCCASION EDIT (ledger
 * `2026-09-26-occasion-read-only`; audit `docs/planning/trip-slip-ui-audit.md` G4/G5, both
 * VERIFIED in the running app: a wedding plan's `trip_contexts` row stored "vacation" after its
 * slip was opened, and `/experiences/wedding` relabelled an unrelated active plan).
 *
 * What these hold (the REAL router, a chosen session identity — the `trip-context-recovery` harness):
 *   O1  the wedding plan's slip push (carrying a previous plan's "vacation") leaves its stored
 *       occasion — and its `trips.event_type` — exactly as they were.
 *   O2  a template-page push ("wedding" into the ACTIVE vacation plan) leaves that plan's stored
 *       occasion — and its `trips.event_type` — exactly as they were. Together O1+O2 are the
 *       requested journey: neither plan's occasion changes.
 *   O3  a plan whose pen has never recorded an occasion does not acquire one from a non-edit push.
 *   O4  `occasionEdit: true` (the plan modal's commit; Clear plan) still changes it.
 *   O5  the legacy pre-trip row keeps full-replace semantics — a draft's occasion rides.
 *   O6  first-touch `origin` is still preserved alongside the kept occasion.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit \
 *        server/__tests__/occasion-read-only.db.test.ts
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
const owner = `oro-${RUN}-owner`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[occasion-read-only] REFUSING to write fixtures to '${host ?? "<none>"}'. Set JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function put(body: Record<string, unknown>, tripId?: string): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: owner, name: "Test Actor" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(tripContextRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/trip-context${tripId ? `?tripId=${tripId}` : ""}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200, await res.text());
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function storedPen(tripId: string | null): Promise<Record<string, unknown>> {
  const rows: any = tripId
    ? await db.execute(sql`SELECT context FROM trip_contexts WHERE user_id = ${owner} AND trip_id = ${tripId}`)
    : await db.execute(sql`SELECT context FROM trip_contexts WHERE user_id = ${owner} AND trip_id IS NULL`);
  return rows.rows?.[0]?.context ?? {};
}
async function seedPen(tripId: string | null, context: Record<string, unknown>): Promise<void> {
  await db.execute(sql`DELETE FROM trip_contexts WHERE user_id = ${owner} AND trip_id IS NOT DISTINCT FROM ${tripId}`);
  await db.execute(sql`INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
                       VALUES (${owner}, ${tripId}, ${JSON.stringify(context)}::jsonb, NOW())`);
}
async function eventTypeOf(tripId: string): Promise<string | null> {
  const rows: any = await db.execute(sql`SELECT event_type FROM trips WHERE id = ${tripId}`);
  return rows.rows?.[0]?.event_type ?? null;
}

const occasionOf = (pen: Record<string, unknown>) => ({
  experienceSlug: pen.experienceSlug,
  experienceType: pen.experienceType,
  eventType: pen.eventType,
});

let weddingTrip = "";
let vacationTrip = "";
let blankTrip = "";

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name)
                       VALUES (${owner}, ${`oro-${RUN}@t.test`}, 'Occasion', 'Owner')`);
  const mk = async (title: string, eventType: string) =>
    (await storage.createTrip({ userId: owner, title, destination: "Kyoto", startDate: "2027-06-01", endDate: "2027-06-03", eventType } as any)).id;
  weddingTrip = await mk(`Wedding ${RUN}`, "wedding");
  vacationTrip = await mk(`Vacation ${RUN}`, "vacation");
  blankTrip = await mk(`Blank ${RUN}`, "vacation");
});

after(async () => {
  await db.execute(sql`DELETE FROM trip_contexts WHERE user_id = ${owner}`);
  for (const t of [weddingTrip, vacationTrip, blankTrip]) {
    if (t) await db.execute(sql`DELETE FROM trips WHERE id = ${t}`);
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

const WEDDING_OCCASION = { experienceSlug: "wedding", experienceType: "Wedding", eventType: "wedding" };
const VACATION_OCCASION = { experienceSlug: "travel", experienceType: "Travel", eventType: "vacation" };

test("O1+O2: open the wedding plan's slip, then read /experiences/wedding with the vacation plan active — neither occasion changes", async () => {
  await seedPen(weddingTrip, { tripId: weddingTrip, destination: "Kyoto", ...WEDDING_OCCASION });
  await seedPen(vacationTrip, { tripId: vacationTrip, destination: "Kyoto", ...VACATION_OCCASION });

  // The slip load's push, exactly as observed: the previous plan's event type rode along.
  await put({ context: { tripId: weddingTrip, destination: "Kyoto", title: "Our wedding", experienceType: "vacation", eventType: "vacation" } }, weddingTrip);
  // The template page's push onto the ACTIVE (vacation) plan.
  await put(
    { context: { tripId: vacationTrip, destination: "Kyoto", title: "Wedding Experience", experienceType: "Wedding", experienceSlug: "wedding" } },
    vacationTrip,
  );

  assert.deepEqual(occasionOf(await storedPen(weddingTrip)), WEDDING_OCCASION, "wedding plan's pen occasion unchanged");
  assert.deepEqual(occasionOf(await storedPen(vacationTrip)), VACATION_OCCASION, "vacation plan's pen occasion unchanged");
  assert.equal(await eventTypeOf(weddingTrip), "wedding");
  assert.equal(await eventTypeOf(vacationTrip), "vacation");
  // Non-occasion fields still follow the push (the pen is not frozen).
  assert.equal((await storedPen(weddingTrip)).title, "Our wedding");
});

test("O3: a plan with no recorded occasion does not acquire one from a non-edit push", async () => {
  await put({ context: { tripId: blankTrip, destination: "Kyoto", eventType: "vacation", experienceSlug: "wedding" } }, blankTrip);
  assert.deepEqual(occasionOf(await storedPen(blankTrip)), { experienceSlug: undefined, experienceType: undefined, eventType: undefined });
});

test("O4: the explicit occasion edit still changes it", async () => {
  await seedPen(vacationTrip, { tripId: vacationTrip, destination: "Kyoto", ...VACATION_OCCASION });
  await put({ context: { tripId: vacationTrip, destination: "Kyoto", ...WEDDING_OCCASION }, occasionEdit: true }, vacationTrip);
  assert.deepEqual(occasionOf(await storedPen(vacationTrip)), WEDDING_OCCASION);
  // Clear plan: an empty blob flagged as an edit empties the occasion too.
  await put({ context: {}, occasionEdit: true }, vacationTrip);
  assert.deepEqual(occasionOf(await storedPen(vacationTrip)), { experienceSlug: undefined, experienceType: undefined, eventType: undefined });
});

test("O5: the legacy pre-trip draft keeps full-replace semantics", async () => {
  await seedPen(null, { destination: "Lisbon", experienceSlug: "travel" });
  await put({ context: { destination: "Lisbon", experienceSlug: "wedding", experienceType: "Wedding" } });
  assert.equal((await storedPen(null)).experienceSlug, "wedding");
});

test("O6: first-touch origin survives beside the kept occasion", async () => {
  await seedPen(weddingTrip, { tripId: weddingTrip, origin: "guest_invite", ...WEDDING_OCCASION });
  await put({ context: { tripId: weddingTrip, origin: "organic", eventType: "vacation" } }, weddingTrip);
  const pen = await storedPen(weddingTrip);
  assert.equal(pen.origin, "guest_invite");
  assert.deepEqual(occasionOf(pen), WEDDING_OCCASION);
});
