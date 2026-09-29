/**
 * A CART LINE IS NEVER BORN ON SOMEONE ELSE'S PLAN (ledger `2026-09-28-cart-add-trip-ownership`;
 * decision-maker, Sep 28, 2026; follows R209 `2026-09-28-checkout-stamp-from-line-trip-built`; §14).
 *
 * `POST /api/cart` and `POST /api/cart/items` wrote a body `tripId` onto the new cart line with no
 * ownership check. R209 made checkout refuse a line on a foreign plan, so nothing could be granted,
 * but the line was still born pointing at a plan the user does not own. Both add rails now ask the
 * ONE ownership read (`resolveOwnedLineTripIds`, via `cartAddTripRefusal`) before any write.
 *
 *   C1  POST /api/cart with a FOREIGN tripId ⇒ 403 `trip_not_owned`, and no cart row is written.
 *   C2  POST /api/cart/items with a FOREIGN tripId ⇒ 403 `trip_not_owned`, and no cart row is written.
 *   C3  an OWNED tripId ⇒ 201, and the line carries that plan (both rails).
 *   C4  no tripId ⇒ 201, a standalone line (both rails).
 *   C5  (pure) a non-string tripId ⇒ 400; a lookup that throws ⇒ 503; absent/"" ⇒ no refusal.
 *
 * SERVER REQUIRED for C1–C4 (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this
 * file writes it deletes. Run solo against a local server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/cart-add-trip-ownership.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { cartAddTripRefusal } from "../services/trip-pass-line-coverage.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `cato-${RUN}-buyer@t.test`;
const ids = {
  provider: `cato-${RUN}-prov`,
  foreignUser: `cato-${RUN}-foreign`,
  svc: `cato-${RUN}-svc`,
  tripOwn: `cato-${RUN}-trip-own`,
  tripForeign: `cato-${RUN}-trip-foreign`,
};
let buyerId = "";
let buyerCookie = "";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(
      `[cart-add-trip-ownership] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function clearCart(): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
}

async function cartRows(): Promise<Array<{ trip_id: string | null }>> {
  const r = await db.execute(sql`SELECT trip_id FROM cart_items WHERE user_id = ${buyerId}`);
  return r.rows as any[];
}

const RAILS = ["/api/cart", "/api/cart/items"] as const;
let serverUp = false;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  serverUp = !!(health && health.ok);
  if (!serverUp) return;
  await assertDisposableDb();

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Cart",
    lastName: "Owner",
  });
  if (reg.status !== 201) assert.fail(`register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  buyerCookie = setCookie!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`cato-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.foreignUser}, ${`cato-${RUN}-foreign@t.test`}, 'Foreign', 'Owner', 'user')`);
  // Declared `instant` so the listing is cartable (ledger `2026-09-25-checkout-request-mode`).
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, description, price, price_type, booking_mode, status, approval_status, delivery_method)
    VALUES
      (${ids.svc}, ${ids.provider}, ${`Cart add ownership ${RUN}`}, 'fixture', '100.00',
       'fixed', 'instant', 'active', 'approved', 'call')
  `);
  for (const [tid, owner] of [
    [ids.tripOwn, buyerId],
    [ids.tripForeign, ids.foreignUser],
  ] as const) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
      VALUES (${tid}, ${owner}, 'Cart add ownership', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
  }
});

after(async () => {
  try {
    if (buyerId) await clearCart();
    for (const tid of [ids.tripOwn, ids.tripForeign]) await db.execute(sql`DELETE FROM trips WHERE id = ${tid}`);
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.svc}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.foreignUser})`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`);
  } finally {
    await pool.end();
  }
});

for (const [label, rail] of [["C1", RAILS[0]], ["C2", RAILS[1]]] as const) {
  test(`${label}: ${rail} with a FOREIGN tripId is refused 403 and writes no cart row`, async (t) => {
    if (!serverUp) return t.skip("server not running");
    await clearCart();
    const res = await api(rail, buyerCookie, "POST", { serviceId: ids.svc, quantity: 1, tripId: ids.tripForeign });
    const text = await res.text();
    assert.equal(res.status, 403, `${rail}: a foreign plan is refused (got ${res.status}: ${text})`);
    assert.equal(JSON.parse(text).reason, "trip_not_owned");
    assert.equal((await cartRows()).length, 0, `${rail}: no cart line is born on the foreign plan`);
    await clearCart();
  });
}

test("C3: an OWNED tripId is accepted on both rails and the line carries that plan", async (t) => {
  if (!serverUp) return t.skip("server not running");
  for (const rail of RAILS) {
    await clearCart();
    const res = await api(rail, buyerCookie, "POST", { serviceId: ids.svc, quantity: 1, tripId: ids.tripOwn });
    assert.equal(res.status, 201, `${rail}: an owned plan is accepted (got ${res.status}: ${await res.text()})`);
    const rows = await cartRows();
    assert.equal(rows.length, 1, `${rail}: one line`);
    assert.equal(rows[0].trip_id, ids.tripOwn, `${rail}: the line carries the owned plan`);
  }
  await clearCart();
});

test("C4: no tripId is a standalone line on both rails", async (t) => {
  if (!serverUp) return t.skip("server not running");
  for (const rail of RAILS) {
    await clearCart();
    const res = await api(rail, buyerCookie, "POST", { serviceId: ids.svc, quantity: 1 });
    assert.equal(res.status, 201, `${rail}: a standalone add is accepted (got ${res.status}: ${await res.text()})`);
    const rows = await cartRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].trip_id, null, `${rail}: no plan`);
  }
  await clearCart();
});

test("C5: the refusal decision — absent, malformed, owned, foreign, unverifiable", async () => {
  const owns = { ownsTrip: async (tripId: string) => tripId === "mine" };
  assert.equal(await cartAddTripRefusal("me", undefined, owns), null, "absent ⇒ no refusal");
  assert.equal(await cartAddTripRefusal("me", null, owns), null, "null ⇒ no refusal");
  assert.equal(await cartAddTripRefusal("me", "", owns), null, "empty ⇒ no refusal");
  assert.equal(await cartAddTripRefusal("me", "mine", owns), null, "owned ⇒ no refusal");
  assert.equal((await cartAddTripRefusal("me", 42, owns))?.status, 400, "non-string ⇒ 400");
  const foreign = await cartAddTripRefusal("me", "theirs", owns);
  assert.equal(foreign?.status, 403);
  assert.equal(foreign?.body.reason, "trip_not_owned");
  const boom = await cartAddTripRefusal("me", "x", {
    ownsTrip: async () => {
      throw new Error("lookup failed");
    },
  });
  assert.equal(boom?.status, 503, "a lookup that throws is never guessed owned");
  assert.equal(boom?.body.reason, "trip_unverified");
});
