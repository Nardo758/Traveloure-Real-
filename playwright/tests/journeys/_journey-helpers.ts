/**
 * _journey-helpers.ts — shared plumbing for the Tier-1 journey suite (Wave 1).
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
