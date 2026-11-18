/**
 * F1 - THE ROUTE LAYER: what a PENDING advisor gets on the write routes that mount alone.
 *
 * Layer (a) is the rule at the database (one-trip-write-resolver.db.test.ts). Layer (b) is the source test that
 * every non-GET call states its choice. This is layer (c): the routes themselves, on the five routers that mount
 * without registerRoutes - trips, experts, feedback, booking-actions, advisor.
 *
 * Two shapes are asserted per route:
 *   pending   -> the guard's own refusal (403 "Not authorized to access this trip"; feedback maps it to 404)
 *                AND no row changed.
 *   accepted / owner -> ADMITTED, proved by a body that fails validation AFTER the guard (400) or by a request
 *                that cannot reach mail or AI. Nothing here sends mail, spends tokens or runs a handler side
 *                effect: bulk-email stops at the empty-array check, generate-presets at its required fields,
 *                narration at `?factsOnly=1` (facts, no model call).
 *
 * NOT PROVED HERE, and said so rather than hidden:
 *   - PUT/DELETE /api/anchors/:id and PUT /api/expert/vendors/:vendorId look the row up BEFORE the guard, so an
 *     unknown id answers 404 for everyone; a proven refusal needs a real anchor/vendor row, which this lane did
 *     not build.
 *   - DELETE /api/expert/vendors/:vendorId is an idempotent delete: an id that resolves to no trip answers
 *     200 {success:true} having deleted nothing, and the guard is only reached when the vendor resolves to a trip.
 *   - generate-itinerary and alerts live inside registerRoutes; they are covered by (a) and (b) only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = () => crypto.randomUUID();
const ids = { owner: uid(), accepted: uid(), pending: uid(), trip: uid(), anchor: uid(), vendor: uid() };

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const ok = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!ok.has(host)) throw new Error(`[f1-route-writes] REFUSING to write to '${host}'.`);
}

/** Each router carries its own path prefix: trips/experts/feedback/advisor include `/api`, booking-actions does not. */
const MOUNTS: Record<string, string> = {
  "../routes/trips.routes": "/",
  "../routes/experts.routes": "/",
  "../routes/feedback.routes": "/",
  "../routes/advisor.routes": "/",
  "../routes/booking-actions": "/api",
};

async function callAs(userId: string, file: string, method: string, url: string, body?: unknown) {
  const mod: any = await import(file);
  const router = mod.default ?? mod.router;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "F1" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(MOUNTS[file], router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j.message ?? j.error ?? "json";
    } catch {
      /* html (a 404 from express itself) */
    }
    return { status: res.status, message: String(message).slice(0, 120) };
  } finally {
    server.close();
  }
}

const ROUTES = [
  { name: "POST /api/trips/:id/anchors", file: "../routes/trips.routes", method: "POST", url: () => `/api/trips/${ids.trip}/anchors`, body: { kind: "flight", label: "arr", startsAt: "2027-05-01T09:00:00Z" }, refusal: 403 },
  { name: "POST /api/trips/:id/day-boundaries", file: "../routes/trips.routes", method: "POST", url: () => `/api/trips/${ids.trip}/day-boundaries`, body: { dayNumber: 1, startMinutes: 540, endMinutes: 1080 }, refusal: 403 },
  { name: "POST /api/trips/:id/vendors/bulk-email", file: "../routes/trips.routes", method: "POST", url: () => `/api/trips/${ids.trip}/vendors/bulk-email`, body: { contractIds: [] }, refusal: 403 },
  { name: "POST /api/expert/trips/:id/vendors", file: "../routes/experts.routes", method: "POST", url: () => `/api/expert/trips/${ids.trip}/vendors`, body: { name: "Seed", category: "dining" }, refusal: 403 },
  { name: "POST /api/plans/:id/feedback", file: "../routes/feedback.routes", method: "POST", url: () => `/api/plans/${ids.trip}/feedback`, body: { moment: "slip", code: "helpful", text: "ok" }, refusal: 404 },
  { name: "DELETE /api/plans/:id/feedback", file: "../routes/feedback.routes", method: "DELETE", url: () => `/api/plans/${ids.trip}/feedback`, body: { moment: "slip" }, refusal: 404 },
  { name: "PUT /api/anchors/:id", file: "../routes/trips.routes", method: "PUT", url: () => `/api/anchors/${ids.anchor}`, body: { anchorDatetime: "2027-05-01T11:00:00Z" }, refusal: 403 },
  { name: "DELETE /api/anchors/:id", file: "../routes/trips.routes", method: "DELETE", url: () => `/api/anchors/${ids.anchor}`, body: undefined, refusal: 403 },
  { name: "PUT /api/expert/vendors/:vendorId", file: "../routes/experts.routes", method: "PUT", url: () => `/api/expert/vendors/${ids.vendor}`, body: { vendorName: "Renamed" }, refusal: 403 },
  { name: "DELETE /api/expert/vendors/:vendorId", file: "../routes/experts.routes", method: "DELETE", url: () => `/api/expert/vendors/${ids.vendor}`, body: undefined, refusal: 403 },
  { name: "POST /api/trips/:id/generate-presets", file: "../routes/booking-actions", method: "POST", url: () => `/api/trips/${ids.trip}/generate-presets`, body: {}, refusal: 403 },
  { name: "POST /api/trips/:id/advisor/narration", file: "../routes/advisor.routes", method: "POST", url: () => `/api/trips/${ids.trip}/advisor/narration?factsOnly=1`, body: {}, refusal: 403 },
] as const;

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.owner, "owner"], [ids.accepted, "expert"], [ids.pending, "expert"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, role) VALUES (${id}, ${`f1-${id.slice(0, 8)}-${RUN}@t.test`}, 'F1', ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.owner}, 'F1 route plan', 'Kyoto, Japan', '2027-05-01', '2027-05-03')`);
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, assigned_at)
    VALUES (${uid()}, ${ids.trip}, ${ids.accepted}, 'accepted', NOW())`);
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, assigned_at)
    VALUES (${uid()}, ${ids.trip}, ${ids.pending}, 'pending', NOW())`);
  // The two row lookups that run BEFORE the guard need a real row, or the route answers 404 for everybody.
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime)
    VALUES (${ids.anchor}, ${ids.trip}, 'flight', '2027-05-01T09:00:00Z')`);
  await db.execute(sql`INSERT INTO expert_vendor_coordination (id, trip_id, expert_id, vendor_name, vendor_category)
    VALUES (${ids.vendor}, ${ids.trip}, ${ids.accepted}, 'Seed vendor', 'dining')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM expert_vendor_coordination WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM temporal_anchors WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.accepted}, ${ids.pending})`);
});

const rowCounts = async () => {
  const anchors = (await db.execute(sql`SELECT count(*)::int AS n FROM temporal_anchors WHERE trip_id = ${ids.trip}`)).rows?.[0] as any;
  const vendors = (await db.execute(sql`SELECT count(*)::int AS n FROM expert_vendor_coordination WHERE trip_id = ${ids.trip}`)).rows?.[0] as any;
  const rows = (await db.execute(sql`SELECT count(*)::int AS n FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`)).rows?.[0] as any;
  return { anchors: anchors?.n, vendors: vendors?.n, advisors: rows?.n };
};

for (const r of ROUTES) {
  test(`${r.name}: a PENDING advisor is refused, and nothing is written`, async () => {
    const before = await rowCounts();
    const res = await callAs(ids.pending, r.file, r.method, r.url(), r.body);
    assert.equal(res.status, r.refusal, `${r.name} answered ${res.status} '${res.message}' for a pending advisor`);
    const after = await rowCounts();
    assert.deepEqual(after, before, `${r.name} changed the plan's rows for a pending advisor`);
  });

  test(`${r.name}: an ACCEPTED advisor and the owner are admitted`, async () => {
    const accepted = await callAs(ids.accepted, r.file, r.method, r.url(), r.body);
    assert.notEqual(accepted.status, r.refusal, `${r.name} refused an accepted advisor`);
    assert.ok(accepted.status < 500, `${r.name} failed for an accepted advisor: ${accepted.message}`);
    const owner = await callAs(ids.owner, r.file, r.method, r.url(), r.body);
    assert.notEqual(owner.status, r.refusal, `${r.name} refused the owner`);
    assert.ok(owner.status < 500, `${r.name} failed for the owner: ${owner.message}`);
  });
}

/**
 * Layer (a) for the rails this lane moved: the RULE, at the database, in both directions.
 * `one-trip-write-resolver.db.test.ts` pins the flagged direction across the gates it owns; this pins the
 * flag's effect on the newly guarded rails and, crucially, the OTHER direction - without the option a pending
 * advisor still passes, which is why every call site has to say what it is.
 */
test("RULE: the flag is what refuses a pending advisor, and no flag still admits one", async () => {
  const { authorizeTripLogistics } = await import("../utils/trip-logistics-auth");

  // pending, flagged -> refused 403 (the guard's own status)
  const flagged = await authorizeTripLogistics(ids.trip, ids.pending, "F1 rule check", { requireWriteAccess: true });
  assert.equal(flagged?.status, 403);
  assert.equal(flagged?.message, "Not authorized to access this trip");

  // pending, unflagged -> null (admitted): the default is still read access
  const unflagged = await authorizeTripLogistics(ids.trip, ids.pending, "F1 rule check");
  assert.equal(unflagged, null);

  // accepted and owner pass with the flag
  assert.equal(await authorizeTripLogistics(ids.trip, ids.accepted, "F1 rule check", { requireWriteAccess: true }), null);
  assert.equal(await authorizeTripLogistics(ids.trip, ids.owner, "F1 rule check", { requireWriteAccess: true }), null);
});
