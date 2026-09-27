/**
 * R130 + R131 (decision-maker ruled Sep 26, 2026 — ledger `2026-09-26-adopt-stop-write-access`,
 * `2026-09-26-apply-to-cart-flag-off`).
 *
 * R130 — `POST /api/itinerary-comparisons/:id/adopt-stop` APPENDS an item to a plan, so it takes
 * the ONE D17/V-29 write form `authorizeTripLogistics(…, { requireWriteAccess: true })`. Before,
 * it carried the READ-shaped call, so a PENDING (§12 read-only) advisor who owned a comparison
 * pointing at the plan could write an item onto it.
 *   S1  a PENDING advisor who owns the comparison is refused 403 and the plan's items are unchanged.
 *   S2  the same advisor, once ACCEPTED, passes the gate and the stop lands (one item).
 *   S3  the OWNER passes the gate on their own comparison.
 *
 * R131 — `POST /api/itinerary-comparisons/:id/apply-to-cart` is OFF by default.
 *   C1  flag unset ⇒ 410 `apply_to_cart_disabled` BEFORE any read (a comparison id that does not
 *       exist still answers 410, never 404), and the caller's cart is untouched.
 *   C2  flag = "true" ⇒ the gate lets the request through to the handler's own checks (404 for an
 *       unknown comparison) — the flag check passes and nothing else changed.
 *   C3  only the literal "true" opens it; unset / "false" / "1" / "yes" stay OFF.
 *   C4  static: BOTH handlers (the live monolith copy and the shadowed trips.routes.ts twin) call
 *       the ONE gate as their first statement — so the monolith copy, which this harness cannot
 *       mount, is pinned by source.
 *
 * NEGATIVE SPACE (§18d): these are authorization/gate proofs. They assert nothing about what
 * adopt-stop merges (adopt-stop.db.test.ts owns that) or about the cart projection itself.
 *
 * Harness: the REAL routers mounted with a chosen session identity (item-event-link.db.test.ts's
 * shape — `isAuthenticated` does a live `users` lookup and fails closed, so the accounts are real
 * rows). DISPOSABLE DB ONLY; every row is created here and deleted in after().
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/adopt-stop-write-and-apply-to-cart-flag.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
} from "@shared/schema";
import tripsRoutes from "../routes/trips.routes";
import plancardRoutes from "../routes/plancard.routes";
import {
  APPLY_TO_CART_DISABLED_CODE,
  COMPARISON_APPLY_TO_CART_ENV,
  isComparisonApplyToCartEnabled,
} from "../config/comparison-apply-to-cart.config";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `r130-${RUN}-owner`,
  advisor: `r130-${RUN}-advisor`,
};
let tripId = "";
let advisorRowId = "";
let advisorComparisonId = "";
let advisorStopId = "";
let ownerComparisonId = "";
let ownerStopId = "";
const ADVISOR_STOP = `R130 advisor stop ${RUN}`;
const OWNER_STOP = `R130 owner stop ${RUN}`;

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

// ── Disposable-DB guard (mirrors item-event-link.db.test.ts; never defaults open) ─────────────
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
      `[r130-r131] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function withRoutersAs<T>(asUserId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: asUserId, name: "Test" } };
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

async function post(base: string, p: string, body: unknown = {}) {
  const res = await fetch(`${base}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

async function itemTitles(): Promise<string[]> {
  const r = await db.execute(sql`SELECT title FROM itinerary_items WHERE trip_id = ${tripId} ORDER BY title`);
  return r.rows.map((x: any) => x.title as string);
}

async function cartCount(userId: string): Promise<number> {
  const r = await db.execute(sql`SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ${userId}`);
  return Number((r.rows[0] as any).n);
}

async function seedComparison(ownerId: string, stopName: string): Promise<{ cmp: string; stop: string }> {
  const [cmp] = await db.insert(itineraryComparisons).values({
    userId: ownerId,
    tripId,
    destination: "Kyoto, Japan",
  } as any).returning();
  const [variant] = await db.insert(itineraryVariants).values({
    comparisonId: cmp.id,
    name: "V1",
    source: "ai",
  } as any).returning();
  const [item] = await db.insert(itineraryVariantItems).values({
    variantId: variant.id,
    dayNumber: 1,
    name: stopName,
    serviceType: "activity",
    price: "10.00",
    sortOrder: 0,
  } as any).returning();
  return { cmp: cmp.id, stop: item.id };
}

before(async () => {
  await assertDisposableDb();
  for (const [id, role] of [
    [ids.owner, "traveler"],
    [ids.advisor, "local_expert"],
  ] as const) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'R130', ${role}, ${role})
    `);
  }
  const trip = await storage.createTrip({
    userId: ids.owner,
    title: `R130 plan ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2027-05-01",
    endDate: "2027-05-06",
  } as any);
  tripId = trip.id;

  const advisorRow = await storage.createTripExpertAdvisor({
    tripId,
    localExpertId: ids.advisor,
    message: "R130 fixture assignment",
  } as any);
  advisorRowId = (advisorRow as any).id;

  // The comparison is OWNED BY THE ADVISOR (comparison.userId must equal the caller) and points at
  // the owner's plan — exactly the shape the read-shaped gate let through.
  ({ cmp: advisorComparisonId, stop: advisorStopId } = await seedComparison(ids.advisor, ADVISOR_STOP));
  ({ cmp: ownerComparisonId, stop: ownerStopId } = await seedComparison(ids.owner, OWNER_STOP));
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id IN (${advisorComparisonId}, ${ownerComparisonId})`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM cart_items WHERE user_id IN (${ids.owner}, ${ids.advisor})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`r130-${RUN}-%`}`).catch(() => {});
});

// ── R130 ───────────────────────────────────────────────────────────────────────────────────────

test("S1: a PENDING advisor who owns the comparison is refused 403 and the plan's items are unchanged", async () => {
  const status = await db.execute(sql`SELECT status FROM trip_expert_advisors WHERE id = ${advisorRowId}`);
  assert.equal((status.rows[0] as any).status, "pending", "fixture invalid: advisor must start pending");

  const before = await itemTitles();
  const res = await withRoutersAs(ids.advisor, (base) =>
    post(base, `/api/itinerary-comparisons/${advisorComparisonId}/adopt-stop`, { variantItemId: advisorStopId }),
  );
  assert.equal(res.status, 403, `§12 breached: a pending advisor adopted a stop (${res.status}: ${res.text})`);
  assert.deepEqual(await itemTitles(), before, "the plan's items changed under a refused adopt");
});

test("S2: the same advisor, once ACCEPTED, passes the gate and the stop lands once", async () => {
  await db.execute(sql`UPDATE trip_expert_advisors SET status = 'accepted' WHERE id = ${advisorRowId}`);
  const res = await withRoutersAs(ids.advisor, (base) =>
    post(base, `/api/itinerary-comparisons/${advisorComparisonId}/adopt-stop`, { variantItemId: advisorStopId }),
  );
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json?.adopted, true);
  assert.equal((await itemTitles()).filter((t) => t === ADVISOR_STOP).length, 1);
});

test("S3: the OWNER passes the gate on their own comparison", async () => {
  const res = await withRoutersAs(ids.owner, (base) =>
    post(base, `/api/itinerary-comparisons/${ownerComparisonId}/adopt-stop`, { variantItemId: ownerStopId }),
  );
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json?.adopted, true);
  assert.equal((await itemTitles()).filter((t) => t === OWNER_STOP).length, 1);
});

// ── R131 ───────────────────────────────────────────────────────────────────────────────────────

async function withFlag<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[COMPARISON_APPLY_TO_CART_ENV];
  if (value === undefined) delete process.env[COMPARISON_APPLY_TO_CART_ENV];
  else process.env[COMPARISON_APPLY_TO_CART_ENV] = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[COMPARISON_APPLY_TO_CART_ENV];
    else process.env[COMPARISON_APPLY_TO_CART_ENV] = prev;
  }
}

test("C1: flag unset ⇒ 410 apply_to_cart_disabled BEFORE any read, cart untouched", async () => {
  const cartBefore = await cartCount(ids.owner);
  await withFlag(undefined, async () => {
    // A real, owned comparison…
    const real = await withRoutersAs(ids.owner, (base) =>
      post(base, `/api/itinerary-comparisons/${ownerComparisonId}/apply-to-cart`),
    );
    assert.equal(real.status, 410, real.text);
    assert.equal(real.json?.code, APPLY_TO_CART_DISABLED_CODE);
    // …and one that does not exist: still 410, never 404 — the refusal precedes the read.
    const ghost = await withRoutersAs(ids.owner, (base) =>
      post(base, `/api/itinerary-comparisons/r131-${RUN}-no-such-comparison/apply-to-cart`),
    );
    assert.equal(ghost.status, 410, ghost.text);
    assert.equal(ghost.json?.code, APPLY_TO_CART_DISABLED_CODE);
  });
  assert.equal(await cartCount(ids.owner), cartBefore, "a refused apply-to-cart wrote the cart");
});

test("C2: flag = \"true\" ⇒ the gate passes and the handler's own checks answer", async () => {
  await withFlag("true", async () => {
    const ghost = await withRoutersAs(ids.owner, (base) =>
      post(base, `/api/itinerary-comparisons/r131-${RUN}-no-such-comparison/apply-to-cart`),
    );
    assert.equal(ghost.status, 404, `expected the handler's own 404 past the gate, got ${ghost.status}: ${ghost.text}`);
    // The owner's comparison has no selected variant — the handler's own 400, past the gate.
    const real = await withRoutersAs(ids.owner, (base) =>
      post(base, `/api/itinerary-comparisons/${ownerComparisonId}/apply-to-cart`),
    );
    assert.equal(real.status, 400, real.text);
  });
});

test("C3: only the literal \"true\" opens the rail", async () => {
  for (const [value, expected] of [
    [undefined, false],
    ["", false],
    ["false", false],
    ["1", false],
    ["yes", false],
    ["on", false],
    ["true", true],
    [" TRUE ", true],
  ] as const) {
    await withFlag(value, async () => {
      assert.equal(isComparisonApplyToCartEnabled(), expected, `value ${JSON.stringify(value)}`);
    });
  }
});

test("C4: BOTH apply-to-cart handlers call the ONE gate as their first statement", () => {
  const sites: Array<[string, string]> = [
    ["server/routes.ts", 'app.post("/api/itinerary-comparisons/:id/apply-to-cart"'],
    ["server/routes/trips.routes.ts", 'router.post("/api/itinerary-comparisons/:id/apply-to-cart"'],
  ];
  for (const [file, marker] of sites) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    const start = text.indexOf(marker);
    assert.ok(start > -1, `handler not found in ${file}`);
    // First non-comment statement after `try {` must be the gate.
    const afterTry = text.slice(text.indexOf("try {", start) + "try {".length);
    const firstStatement = afterTry
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("//"));
    assert.equal(
      firstStatement,
      "if (refuseIfComparisonApplyToCartDisabled(res)) return;",
      `${file}: the apply-to-cart gate is not the first statement`,
    );
  }
});
