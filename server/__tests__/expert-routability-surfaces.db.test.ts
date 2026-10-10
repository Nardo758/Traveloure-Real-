/**
 * B3 — NO SEED OR UNROUTED EXPERT REACHES A TRAVELER (ledger `2026-10-09-b3-expert-routability`;
 * decision-maker rulings 1–4, Oct 9, 2026). One fixture set, every surface:
 *
 *   seed      approved + verified + payable, but `@example.com` (seed-sourced)
 *   pending   verified + payable, application PENDING
 *   lapsed    approved, Identity NOT verified (a real expert whose verification lapsed)
 *   routable  approved + verified + payable, not seed
 *
 *   R1  the ONE advisor author refuses a NEW seed / pending / lapsed advisor; takes a routable one;
 *       a status move on an EXISTING row passes; the admin override passes and is the only way
 *   R2  the plan's advisor list never returns seed or pending; a lapsed (real) hire stays
 *   R3  the plan's "delivered by" name is never a seed account
 *   R4  isExpertHireable / isExpertApproved mean routable
 *   R5  GET /api/experts/:id — seed and pending are not public profiles; lapsed and routable are
 *   R6  POST /api/expert-booking-requests — only a routable expert owner (a provider is unchanged)
 *   R7  GET /api/trip-experts — routable only (HTTP, the real router)
 *   R8  POST /api/grok/match-experts candidates — routable only
 *   R9  the itinerary follow-up email names a routable expert only
 *   R10 the neighbourhood `localExpert` — routable only
 *   R11 storefronts — seed and pending 404; lapsed keeps the page with the book door closed
 *   R12 admin handoff assign — refused without `overrideRoutability`; the override is audited
 *
 * SHOW_DEMO_EXPERTS is UNSET for this file: CI sets it for its fixtures, and it relaxes the seed
 * clause, which is exactly what R2–R11 must prove is enforced.
 *
 * Run: npx tsx --test server/__tests__/expert-routability-surfaces.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

delete process.env.SHOW_DEMO_EXPERTS;
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
{
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[expert-routability-surfaces] REFUSING to write fixtures to '${host}'.`);
  }
}

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const bookingActions = await import("../services/booking-actions.service");
const { AdvisorNotRoutableError, isPublicExpertProfileId, requestRailOwnerAllowed } = await import("../services/expert-routability");
const { resolveDeliveredBy } = await import("../services/trip-plan.service");
const { getRoutableLocalExpertUsers } = await import("../services/content-query.service");
const { followupPersonalization } = await import("../services/itinerary-followup.service");
const { routableNeighborhoodExpertRows } = await import("../services/location-view.service");
const { loadStorefront } = await import("../routes/storefront.routes");
const { adminAssignHandoff } = await import("../services/handoff.service");
const bookingActionsRoutes = (await import("../routes/booking-actions")).default;

const RUN = crypto.randomBytes(3).toString("hex");
const id = (k: string) => `b3-${RUN}-${k}`;
const ids = {
  owner: id("owner"),
  admin: id("admin"),
  provider: id("provider"),
  seed: id("seed"),
  pending: id("pending"),
  lapsed: id("lapsed"),
  routable: id("routable"),
  trip: id("trip"),
  trip2: id("trip2"),
};
const DEST = `B3Town${RUN}`;
const CITY_OTHERS = `B3Others${RUN}`;
const CITY_ROUTABLE = `B3Routable${RUN}`;
const EXPERTS = ["seed", "pending", "lapsed", "routable"] as const;
const handleOf = (k: string) => `b3${k}${RUN}`;
let server: Server;
let baseUrl = "";

async function trip(tripId: string) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${tripId}, ${ids.owner}, 'B3 plan', 'Kyoto, Japan', '2027-05-01', '2027-05-03')`);
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES
    (${ids.owner}, ${`${ids.owner}@t.test`}, 'B3', 'Owner', 'traveler'),
    (${ids.admin}, ${`${ids.admin}@t.test`}, 'B3', 'Admin', 'admin'),
    (${ids.provider}, ${`${ids.provider}@t.test`}, 'B3', 'Provider', 'service_provider')`);
  const facts: Record<(typeof EXPERTS)[number], { email: string; status: string; ivs: string; scs: string; city: string }> = {
    seed: { email: `${ids.seed}@example.com`, status: "approved", ivs: "verified", scs: "complete", city: CITY_OTHERS },
    pending: { email: `${ids.pending}@t.test`, status: "pending", ivs: "verified", scs: "complete", city: CITY_OTHERS },
    lapsed: { email: `${ids.lapsed}@t.test`, status: "approved", ivs: "pending", scs: "complete", city: CITY_OTHERS },
    routable: { email: `${ids.routable}@t.test`, status: "approved", ivs: "verified", scs: "complete", city: CITY_ROUTABLE },
  };
  for (const k of EXPERTS) {
    const f = facts[k];
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, handle)
      VALUES (${ids[k]}, ${f.email}, ${`B3${k}`}, 'Expert', 'local_expert', ${handleOf(k)})`);
    await db.execute(sql`INSERT INTO local_expert_forms
      (id, user_id, first_name, status, identity_verification_status, stripe_connect_status, city, destinations,
       accepts_new_handoffs, max_concurrent_handoffs)
      VALUES (${crypto.randomUUID()}, ${ids[k]}, ${`B3${k}`}, ${f.status}, ${f.ivs}, ${f.scs}, ${f.city},
              ${JSON.stringify([DEST])}::jsonb, true, 5)`);
    await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method)
      VALUES (${crypto.randomUUID()}, ${ids[k]}, ${`B3 ${k} walk`}, '40.00', 'active', 'approved', 'in_person')`);
  }
  await trip(ids.trip);
  await trip(ids.trip2);

  const app = express();
  app.use(express.json());
  app.use("/api", bookingActionsRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  const all = Object.values(ids);
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id IN (${ids.trip}, ${ids.trip2})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.trip}, ${ids.trip2})`);
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id = ${ids.admin}`).catch(() => {});
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${sql.join(all.map((v) => sql`${v}`), sql`, `)})`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE user_id IN (${sql.join(all.map((v) => sql`${v}`), sql`, `)})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${sql.join(all.map((v) => sql`${v}`), sql`, `)})`);
  await pool.end();
});

async function rawAdvisor(tripId: string, expertId: string, status: string) {
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, workspace_status, assigned_at)
    VALUES (${crypto.randomUUID()}, ${tripId}, ${expertId}, ${status}, 'draft', NOW())`);
}

describe("B3 — routability on every expert surface", () => {
  it("R1: the one advisor author refuses a NEW non-routable advisor; existing rows and the admin override pass", async () => {
    for (const k of ["seed", "pending", "lapsed"] as const) {
      await assert.rejects(
        bookingActions.upsertTripAdvisorRow({ tripId: ids.trip, localExpertId: ids[k], status: "pending" }),
        (e: any) => e instanceof AdvisorNotRoutableError && e.code === "expert_not_routable",
        `${k} must be refused`,
      );
    }
    const ok = await bookingActions.upsertTripAdvisorRow({ tripId: ids.trip, localExpertId: ids.routable, status: "pending" });
    assert.equal(ok.created, true, "a routable expert is taken");
    // A real hire whose verification lapsed: the existing row may still move (pending → accepted).
    await rawAdvisor(ids.trip2, ids.lapsed, "pending");
    const moved = await bookingActions.upsertTripAdvisorRow({ tripId: ids.trip2, localExpertId: ids.lapsed, status: "accepted" });
    assert.equal(moved.row.status, "accepted");
    // The admin override is the only way past the check.
    const over = await bookingActions.upsertTripAdvisorRow({
      tripId: ids.trip2, localExpertId: ids.pending, status: "pending", routabilityOverride: { adminId: ids.admin },
    });
    assert.equal(over.created, true);
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${ids.trip}, ${ids.trip2})`);
  });

  it("R2: the plan's advisor list never returns a seed or pending expert; a lapsed hire stays", async () => {
    for (const k of EXPERTS) await rawAdvisor(ids.trip, ids[k], "accepted");
    const names = (await bookingActions.listTripExpertAdvisors(ids.trip)).map((r: any) => r.first_name).sort();
    assert.deepEqual(names, ["B3lapsed", "B3routable"]);
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
  });

  it("R3: the plan's delivered-by name is never a seed account", async () => {
    await rawAdvisor(ids.trip, ids.seed, "accepted");
    assert.equal(await resolveDeliveredBy(ids.trip), null);
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
    await rawAdvisor(ids.trip, ids.lapsed, "accepted");
    assert.equal((await resolveDeliveredBy(ids.trip))?.name, "B3lapsed Expert");
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
  });

  it("R4: isExpertHireable and isExpertApproved mean routable", async () => {
    for (const k of EXPERTS) {
      assert.equal(await bookingActions.isExpertHireable(ids[k]), k === "routable", `hireable ${k}`);
      assert.equal(await bookingActions.isExpertApproved(ids[k]), k === "routable", `approved ${k}`);
    }
  });

  it("R5: GET /api/experts/:id — seed and pending are not public profiles", async () => {
    const got = Object.fromEntries(await Promise.all(EXPERTS.map(async (k) => [k, await isPublicExpertProfileId(ids[k])])));
    assert.deepEqual(got, { seed: false, pending: false, lapsed: true, routable: true });
  });

  it("R6: the storefront request rail books a routable expert only; a provider is unchanged", async () => {
    const got = Object.fromEntries(await Promise.all(EXPERTS.map(async (k) => [k, await requestRailOwnerAllowed(ids[k])])));
    assert.deepEqual(got, { seed: false, pending: false, lapsed: false, routable: true });
    assert.equal(await requestRailOwnerAllowed(ids.provider), true);
  });

  it("R7: GET /api/trip-experts returns routable experts only", async () => {
    const res = await fetch(`${baseUrl}/api/trip-experts?destination=${encodeURIComponent(DEST)}`);
    assert.equal(res.status, 200);
    const rows = (await res.json()) as any[];
    const ours = rows.filter((r) => Object.values(ids).includes(r.user_id)).map((r) => r.user_id);
    assert.deepEqual(ours, [ids.routable]);
  });

  it("R8: match-experts candidates are routable only", async () => {
    const ours = (await getRoutableLocalExpertUsers()).map((u: any) => u.id).filter((v: string) => Object.values(ids).includes(v));
    assert.deepEqual(ours, [ids.routable]);
  });

  it("R9: the follow-up email never names a seed, pending or lapsed expert", async () => {
    assert.equal((await followupPersonalization(db as any, crypto.randomUUID(), CITY_OTHERS)).expertName, null);
    assert.equal((await followupPersonalization(db as any, crypto.randomUUID(), CITY_ROUTABLE)).expertName, "B3routable");
  });

  it("R10: the neighbourhood localExpert is routable only (order kept)", async () => {
    const rows = EXPERTS.map((k) => ({ expertId: ids[k], neighborhoodId: "n1" }));
    assert.deepEqual((await routableNeighborhoodExpertRows(rows)).map((r) => r.expertId), [ids.routable]);
  });

  it("R11: storefronts — seed and pending 404; lapsed keeps the page with the book door closed", async () => {
    assert.equal(await loadStorefront(handleOf("seed")), null);
    assert.equal(await loadStorefront(handleOf("pending")), null);
    const lapsed = await loadStorefront(handleOf("lapsed"));
    assert.ok(lapsed, "an approved expert keeps their page");
    assert.equal(lapsed!.earner.bookingOpen, false);
    assert.equal(lapsed!.earner.acceptsPlanShares, false);
    assert.equal((await loadStorefront(handleOf("routable")))?.earner.bookingOpen, true);
  });

  it("R12: admin handoff assign refuses a non-routable expert unless overridden; the override is audited", async () => {
    const r = await db.execute(sql`INSERT INTO expert_requests (user_id, trip_id, status, handoff_kind)
      VALUES (${ids.owner}, ${ids.trip}, 'unmatched', 'polish') RETURNING id`);
    const requestId = String((r.rows?.[0] as any).id);
    const refused = await adminAssignHandoff(requestId, ids.seed);
    assert.equal(refused.ok, false);
    assert.equal((refused as any).code, "expert_not_routable");
    const ok = await adminAssignHandoff(requestId, ids.seed, { overrideRoutability: true, admin: { id: ids.admin, role: "admin" } });
    assert.equal(ok.ok, true);
    const audit = await db.execute(sql`SELECT target_user_id FROM access_audit_logs
      WHERE actor_id = ${ids.admin} AND action = 'handoff_assign_routability_override' AND resource_id = ${requestId}`);
    assert.equal((audit.rows?.[0] as any)?.target_user_id, ids.seed);
    const row = await db.execute(sql`SELECT status FROM trip_expert_advisors WHERE trip_id = ${ids.trip} AND local_expert_id = ${ids.seed}`);
    assert.equal((row.rows?.[0] as any)?.status, "pending", "the overridden assignment wrote the advisor row");
  });
});
