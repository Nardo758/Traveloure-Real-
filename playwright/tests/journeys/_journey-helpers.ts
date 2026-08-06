/**
 * _journey-helpers.ts — shared plumbing for the Tier-1 journey suite (Journey Wave 1).
 *
 * HOUSE RULES this file encodes:
 *   • Every step asserts a DB FACT via a READ-ONLY pg pool (DATABASE_URL). UI checks supplement,
 *     never substitute. The pool below runs SELECTs only — it never writes an app table.
 *   • Fresh trip + fresh registered users per test via the app's OWN APIs (/api/auth/register +
 *     the request-context cookie jar). No shared fixtures, no direct app-table writes.
 *   • No fee literals: any amount assertion reads fee_bands / booking_fee_configs, never a constant.
 *
 * The pool is a module singleton (one per worker process) and is disposed by each spec's
 * test.afterAll via `closePool()`.
 */
import { expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

export const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
export const PASSWORD = "TestPassword123!";

/**
 * Is the server under test wired to a REAL Stripe secret key?
 *
 * `JOURNEY_STRIPE_UNAVAILABLE=1` is set by the harness (see
 * `.github/workflows/journey-suite.yml` → the `stripe-gate` step) when the app was booted
 * with a NON-FUNCTIONAL stub `STRIPE_SECRET_KEY`.
 *
 * WHAT IT MEANS NOW (ruling 38 — this changed, and the change is the point):
 * `POST /api/checkout` calls `stripe.paymentIntents.create`, and since ruling 38 a checkout
 * that cannot obtain a PaymentIntent **commits nothing** — no booking is authorized, the cart
 * is untouched, no item is flipped `purchased`, no diary row is written. So with a stub key
 * there are NO money-path DB facts to assert, because there correctly are none.
 *
 * This flag therefore no longer relaxes an assertion; it selects WHICH TRUTHFUL CONTRACT the
 * spec asserts:
 *   • real key  ⇒ `assertCheckoutAccepted` — 2xx, success, a PaymentIntent clientSecret, and
 *     every promote fact downstream.
 *   • stub key  ⇒ `assertCheckoutCommittedNothing` — the declared 503 AND the absence of every
 *     one of those facts. Never a skip, never a silent pass: the negative half is asserted
 *     just as hard as the positive half, and a regression that re-commits state ahead of the
 *     authorization fails the journey immediately.
 *
 * BEFORE ruling 38 this flag was doing something quite different and much weaker: it tolerated
 * a bare 500 as an accepted checkout outcome and then asserted the money-path rows anyway —
 * which passed only BECAUSE the handler had already committed them ahead of the Stripe call.
 * Those assertions encoded the defect. They are gone.
 */
export const STRIPE_UNAVAILABLE = process.env.JOURNEY_STRIPE_UNAVAILABLE === "1";

// ── Stripe TEST key (dev connector) ─────────────────────────────────────────────────────────
// The Start workflow injects a connector-fetched sk_test_ key into the SERVER process env, but
// this spec process inherits the workspace-level (prod) STRIPE_SECRET_KEY. To confirm a
// PaymentIntent in TEST mode from the spec we resolve the SAME sk_test_ the server uses via the
// dev helper. This never touches live Stripe (the helper hard-fails unless the key is sk_test_).
let _stripeTestKey: string | null | undefined;
function stripeTestKey(): string | null {
  if (_stripeTestKey !== undefined) return _stripeTestKey;
  try {
    const out = execFileSync("node", ["scripts/dev-stripe-key.cjs"], {
      encoding: "utf8",
      timeout: 20_000,
    }).trim();
    _stripeTestKey = out.startsWith("sk_test_") ? out : null;
  } catch {
    _stripeTestKey = null;
  }
  return _stripeTestKey;
}

/**
 * Confirm a PaymentIntent in TEST mode with a Stripe test PaymentMethod (pm_card_visa).
 * Returns the PI status ("succeeded" on success) or null if the test key is unavailable.
 * Uses the Stripe REST API directly with the sk_test_ key — no live Stripe ever.
 */
export async function confirmPaymentIntentTestMode(paymentIntentId: string): Promise<string | null> {
  const key = stripeTestKey();
  if (!key) return null;
  // The optimization-fee PI enables redirect-capable methods (automatic_payment_methods), so Stripe
  // requires a return_url when confirming; we also forbid redirects so a card PM settles inline.
  const body = new URLSearchParams({
    payment_method: "pm_card_visa",
    return_url: `${BASE_URL}/optimize/return`,
  });
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Stripe test confirm failed (${res.status}): ${JSON.stringify(json?.error ?? json)}`);
  }
  return json.status as string;
}

export function hasStripeTestKey(): boolean {
  return stripeTestKey() != null;
}

// ── Read-only DB pool (assertions only) ────────────────────────────────────────────────────
let _pool: Pool | null = null;
export function pool(): Pool {
  if (!_pool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL is not set — the journey suite asserts DB facts");
    _pool = new Pool({ connectionString: cs, max: 4 });
  }
  return _pool;
}
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end().catch(() => {});
    _pool = null;
  }
}

// ── DB-write safety guard (test cleanup only) ───────────────────────────────────────────────
// The journey suites open a pg pool on DATABASE_URL and their cleanup phases run DELETEs. This
// guard MUST run before ANY write: it inspects the live connection (current_database() +
// inet_server_addr()) and the DATABASE_URL host, and THROWS loudly unless the DB is clearly a
// disposable dev/CI database — hostname localhost/127.0.0.1, OR an explicit env opt-in
// (JOURNEY_DB_WRITES_OK=1). It NEVER defaults open: an unrecognized/remote host with no opt-in
// aborts the cleanup rather than risk a destructive DELETE against a shared/prod DB.
//
// Shared with server/__tests__/journey-suite-negatives.http.test.ts (which inlines an identical
// dependency-free copy — keep the two in lockstep).
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    // pg accepts postgres:// and postgresql://; URL parses both.
    return new URL(cs).hostname.toLowerCase();
  } catch {
    return null;
  }
}

let _dbWriteGuardOk = false;
export async function assertDisposableDb(p: Pool): Promise<void> {
  if (_dbWriteGuardOk) return; // one successful check per worker is sufficient

  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();

  // Inspect the LIVE connection — never trust the connection string alone.
  let currentDb = "<unknown>";
  let serverAddr: string | null = null;
  try {
    const r = await p.query<{ db: string; addr: string | null }>(
      "SELECT current_database() AS db, host(inet_server_addr()) AS addr",
    );
    currentDb = r.rows[0]?.db ?? currentDb;
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    // inet_server_addr() returns NULL for a unix-socket / loopback connection; that is itself a
    // disposable-local signal, not an error. Fall back to the connection-string host below.
  }

  // A NULL inet_server_addr() means the server is on the same host over a local socket/loopback.
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);

  if (!disposable && !optIn) {
    throw new Error(
      `[assertDisposableDb] REFUSING to run destructive test cleanup writes: DATABASE_URL host ` +
        `'${csHost ?? "<none>"}' / server addr '${serverAddr ?? "<local-socket>"}' (db='${currentDb}') ` +
        `is not a recognized disposable dev/CI database (localhost/127.0.0.1). If this is a throwaway ` +
        `DB, opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never set that against a shared/prod DB.`,
    );
  }
  _dbWriteGuardOk = true;
}

/** A single-value read. Returns the first column of the first row, or null. */
export async function scalar<T = string>(sqlText: string, params: any[] = []): Promise<T | null> {
  const r = await pool().query(sqlText, params);
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  const firstKey = Object.keys(row)[0];
  return (row[firstKey] as T) ?? null;
}

/** All rows of a read query. */
export async function rows<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  const r = await pool().query(sqlText, params);
  return r.rows as T[];
}

export function uid(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

// ── App-API fixture builders (writes go through the app, never raw SQL) ─────────────────────

/** Register a fresh traveler through the app's own register endpoint; returns the new user id. */
export async function registerUser(
  ctx: APIRequestContext,
  emailPrefix: string,
  firstName = "Journey",
  lastName = "User",
): Promise<{ id: string; email: string }> {
  const email = `${emailPrefix}-${uid()}@traveloure.test`;
  const res = await ctx.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, firstName, lastName, userType: "user" },
  });
  expect(res.status(), `register failed: ${await res.text()}`).toBe(201);
  const body = await res.json();
  return { id: body.user.id as string, email };
}

/** Create a fresh trip through the app API; returns tripId. */
export async function createTrip(ctx: APIRequestContext, title: string, destination = "Kyoto, Japan"): Promise<string> {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await ctx.post(`${BASE_URL}/api/trips`, {
    data: { title, destination, startDate: fmt(start), endDate: fmt(end) },
  });
  expect(res.status(), `create trip failed: ${await res.text()}`).toBe(201);
  return (await res.json()).id as string;
}

/** Create a fresh itinerary item on a trip through the app API; returns itemId. Born in_planning. */
export async function createItem(
  ctx: APIRequestContext,
  tripId: string,
  title: string,
  dayNumber = 1,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await ctx.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title, dayNumber, ...extra },
  });
  expect(res.status(), `create item failed: ${await res.text()}`).toBe(201);
  return (await res.json()).id as string;
}

/** A real approved+active priced catalog service (so cart projection + fee band resolve). */
export async function pickCatalogService(): Promise<{ id: string; price: string; name: string }> {
  const r = await rows<{ id: string; price: string; service_name: string }>(
    `SELECT id, price, service_name FROM provider_services
       WHERE approval_status='approved' AND status='active'
         AND price IS NOT NULL AND CAST(price AS FLOAT) > 0
       ORDER BY random() LIMIT 1`,
  );
  expect(r[0], "expected at least one approved+active priced provider_service in the DB").toBeTruthy();
  return { id: r[0].id, price: r[0].price, name: r[0].service_name };
}

/** Create a catalog-linked itinerary item (providerServiceId set) so it is checkout-projectable. */
export async function createCatalogItem(
  ctx: APIRequestContext,
  tripId: string,
  svc: { id: string; price: string; name: string },
  dayNumber = 1,
): Promise<string> {
  const res = await ctx.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title: svc.name, dayNumber, providerServiceId: svc.id, estimatedCost: svc.price },
  });
  expect(res.status(), `create catalog item failed: ${await res.text()}`).toBe(201);
  return (await res.json()).id as string;
}

/** Route an item to a new routing_status through the owner-facing routing endpoint. */
export async function routeItem(
  ctx: APIRequestContext,
  tripId: string,
  itemId: string,
  to: string,
): Promise<Response | any> {
  const res = await ctx.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, { data: { to } });
  return res;
}

/**
 * THE TRUTHFUL SUCCESS CONTRACT for `POST /api/checkout` (ruling 38).
 *
 * Strict, unconditional, in every posture: 2xx, `success: true`, and a PaymentIntent
 * `clientSecret`. There is no longer a branch that accepts a 500 — a checkout that did not
 * obtain a PaymentIntent is a checkout that committed nothing, so a spec asserting money-path
 * rows after one would be asserting the defect.
 *
 * When Stripe is declared unavailable the caller must take the negative branch instead
 * (`assertCheckoutCommittedNothing`), which asserts the ABSENCE of the same facts just as hard.
 */
export async function assertCheckoutAccepted(
  res: { status(): number; text(): Promise<string>; json(): Promise<any> },
  label: string,
): Promise<any> {
  const status = res.status();
  expect(status, `${label}: checkout failed (${status}): ${await res.text()}`).toBeGreaterThanOrEqual(200);
  expect(status).toBeLessThan(300);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.paymentIntent?.clientSecret, `${label}: checkout must return a PaymentIntent clientSecret`).toBeTruthy();
  return body;
}

/**
 * THE TRUTHFUL FAILURE CONTRACT (ruling 38) — asserted whenever the app under test cannot reach
 * Stripe. This is the negative half of the atomicity invariant and is every bit as substantive
 * as the positive half:
 *
 *   • the HTTP answer is the DECLARED 503 `payment_unavailable` (never a bare 500, never a 2xx
 *     "success" envelope with nothing behind it), and
 *   • ZERO AUTHORIZED bookings exist, the cart is untouched, no slot is promoted, no item is at
 *     `purchased`, and no `to_status='purchased'` diary row was written.
 *
 * `cartCountBefore` is the caller's pre-checkout cart size — asserting the cart is *unchanged*
 * is what proves the clear moved behind the authorization.
 *
 * Provisional claim rows are deliberately NOT asserted away: they are the §15 atomic claim that
 * MUST precede the external call (removing it measured 3 real Stripe charges for 3 concurrent
 * same-key checkouts). They hold no PaymentIntent, are invisible as purchases, and the TTL sweep
 * reclaims them — proven in server/__tests__/checkout-claim-sweep.db.test.ts.
 */
export async function assertCheckoutCommittedNothing(
  res: { status(): number; text(): Promise<string> },
  label: string,
  ctx: { userId: string; tripId: string; itemIds: string[]; cartCountBefore: number },
): Promise<void> {
  const status = res.status();
  const text = await res.text();
  expect(
    status,
    `${label}: with Stripe unavailable the ONLY acceptable answer is the declared 503 ` +
      `payment_unavailable. Got ${status}: ${text}`,
  ).toBe(503);
  const body = JSON.parse(text);
  expect(body.error, `${label}: the 503 must carry the declared machine-readable code`).toBe("payment_unavailable");
  expect(body.success, `${label}: a failed checkout must never claim success`).toBe(false);

  const authorized = await scalar<string>(
    `SELECT count(*)::int FROM service_bookings WHERE traveler_id = $1 AND stripe_payment_intent_id IS NOT NULL`,
    [ctx.userId],
  );
  expect(Number(authorized), `${label}: ZERO authorized bookings — nothing is committed without a PaymentIntent`).toBe(0);

  const cartNow = await scalar<string>(`SELECT count(*)::int FROM cart_items WHERE user_id = $1`, [ctx.userId]);
  expect(Number(cartNow), `${label}: the cart must be EXACTLY as the traveler left it`).toBe(ctx.cartCountBefore);

  const promotedSlots = await scalar<string>(
    `SELECT count(*)::int FROM service_bookings
      WHERE traveler_id = $1 AND slot_id IS NOT NULL AND stripe_payment_intent_id IS NOT NULL`,
    [ctx.userId],
  );
  expect(Number(promotedSlots), `${label}: no slot may be promoted onto an authorized booking`).toBe(0);

  const purchased = await rows<{ id: string; routing_status: string; booking_id: string | null }>(
    `SELECT id, routing_status, booking_id FROM itinerary_items WHERE trip_id = $1 AND routing_status = 'purchased'`,
    [ctx.tripId],
  );
  expect(purchased.length, `${label}: no plan item may claim a purchase that was never authorized`).toBe(0);

  const purchaseDiary = await rows(
    `SELECT id FROM item_transition_log WHERE trip_id = $1 AND to_status = 'purchased'`,
    [ctx.tripId],
  );
  expect(purchaseDiary.length, `${label}: no to_status='purchased' diary row may be written`).toBe(0);

  console.log(
    `[${label}] Stripe declared unavailable → POST /api/checkout answered the declared 503 and ` +
      `committed NOTHING (zero authorized bookings, cart intact, no purchased item, no purchase ` +
      `diary row). This is the ruling-38 contract, hard-asserted — not a skip.`,
  );
}

// ── DB-fact readers (SELECT-only) ───────────────────────────────────────────────────────────

export async function itemRoutingStatus(itemId: string): Promise<string | null> {
  return scalar<string>(`SELECT routing_status FROM itinerary_items WHERE id = $1`, [itemId]);
}

/** All routing_status values for a trip, keyed by item id — for before/after diffs. */
export async function routingSnapshot(tripId: string): Promise<Record<string, string>> {
  const r = await rows<{ id: string; routing_status: string }>(
    `SELECT id, routing_status FROM itinerary_items WHERE trip_id = $1 ORDER BY id`,
    [tripId],
  );
  const out: Record<string, string> = {};
  for (const row of r) out[row.id] = row.routing_status;
  return out;
}

/** item_transition_log diary rows for a trip (Lane S), oldest first. */
export async function transitionLog(tripId: string): Promise<
  Array<{ id: string; item_id: string | null; from_status: string | null; to_status: string | null; event_type: string; actor_type: string | null; created_at: string }>
> {
  return rows(
    `SELECT id, item_id, from_status, to_status, event_type, actor_type, created_at
       FROM item_transition_log WHERE trip_id = $1 ORDER BY created_at ASC, id ASC`,
    [tripId],
  );
}
