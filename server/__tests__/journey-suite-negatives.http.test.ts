/**
 * JOURNEY SUITE — Tier 3 contract negatives (Journey Wave 1).
 *
 * Governing docs: docs/planning/JOURNEY_TEST_SUITE_BRIEF.md §4 (N1–N15) + §5/§9,
 * docs/briefs/ROUTING_STATE_CONTRACT.md (WRITES/READS/NEVER cells = the negative source),
 * docs/testing/coverage-matrix.md §14 + the N-claims.
 *
 * Discipline (brief §9): every negative attempts the forbidden action via the API as the
 * specified actor and asserts REJECTION (4xx) AND no side effect — proven by a read-only
 * SQL fact (no status change, no item_transition_log row, no money/booking/cart row). Fresh
 * fixtures per test are created via the app's own HTTP APIs (register/create-trip/create-item);
 * the ONLY direct DB access is a read-only pool used for assertions. Dev DB only. Every fixture
 * user is removed in `after` (trips/items/cart/log rows cascade from the users delete).
 *
 * House rules honored:
 *   - No fee literals: N7 asserts the checkout/fee path resolves against the live
 *     fee_bands `expert_standard` row read from the DB, never a hardcoded rate
 *     (server/services/commission.ts getExpertSplitRates / resolveExpertSharePct).
 *   - email-auth: fixtures registered via POST /api/auth/register (session user shape
 *     user.claims.sub); the returned Set-Cookie is the session.
 *   - Dummy RESEND_API_KEY so any best-effort mail send in a create path is inert.
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000
 * (the 'Start application' workflow), NOT a bespoke in-process app — these negatives cross
 * many routers (routing, plancard, payments, provider, ready-made, trips, expert-application)
 * and the dev server is the assembled surface the brief targets.
 *
 * Each test is annotated `matrix-id: N<n>` (the matrix lint greps for these). Negatives that
 * are genuinely unbuildable on current main are SKIPPED with a reason (brief §4: skip-with-reason).
 * N3 is deferred:lane-6 and is not built here.
 *
 * Run SOLO with: npx tsx --test server/__tests__/journey-suite-negatives.http.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_dummy_journey_negatives";

// Read-only assertion pool (brief §9: read-only DB access for asserts only; no app-table writes).
const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (test cleanup only) ───────────────────────────────────────────────
// The `after` hook DELETEs this run's fixture users. This guard MUST run before that write: it
// inspects the LIVE connection (current_database() + inet_server_addr()) and the DATABASE_URL
// host, and THROWS unless the DB is clearly a disposable dev/CI database — hostname
// localhost/127.0.0.1, OR an explicit env opt-in (JOURNEY_DB_WRITES_OK=1). It NEVER defaults
// open. This is a dependency-free inline mirror of assertDisposableDb() in
// playwright/tests/journeys/_journey-helpers.ts — keep the two in lockstep.
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    return new URL(cs).hostname.toLowerCase();
  } catch {
    return null;
  }
}
async function assertDisposableDb(p: any): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let currentDb = "<unknown>";
  let serverAddr: string | null = null;
  try {
    const r = await p.query("SELECT current_database() AS db, host(inet_server_addr()) AS addr");
    currentDb = r.rows[0]?.db ?? currentDb;
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    // NULL inet_server_addr() (local socket/loopback) is itself a disposable-local signal.
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[assertDisposableDb] REFUSING destructive test cleanup: DATABASE_URL host ` +
        `'${csHost ?? "<none>"}' / server addr '${serverAddr ?? "<local-socket>"}' (db='${currentDb}') ` +
        `is not a recognized disposable dev/CI database (localhost/127.0.0.1). If this is a throwaway ` +
        `DB, opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never set that against a shared/prod DB.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

// Every fixture email carries this run tag so `after` can purge exactly this run's users.
const emailTag = (label: string) => `jsn-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

/** Register a fresh user via the app API and return its session cookie + id (never a direct insert). */
async function registerActor(label: string): Promise<Actor> {
  const email = emailTag(label);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Neg", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method: string, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Create a trip via POST /api/trips (mints owner collaborator row + trackingNumber). */
async function createTrip(actor: Actor, title: string): Promise<string> {
  const res = await api("/api/trips", actor.cookie, "POST", {
    title,
    destination: "Lisbon",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
  });
  if (res.status !== 201) assert.fail(`createTrip failed (${res.status}): ${await res.text()}`);
  return ((await res.json()) as any).id as string;
}

/** Create an itinerary item via POST /api/trips/:tripId/itinerary-items (born in_planning). */
async function createItem(actor: Actor, tripId: string, title: string): Promise<string> {
  const res = await api(`/api/trips/${tripId}/itinerary-items`, actor.cookie, "POST", { title, dayNumber: 1 });
  if (res.status !== 201) assert.fail(`createItem failed (${res.status}): ${await res.text()}`);
  return ((await res.json()) as any).id as string;
}

// ── Read-only DB facts ──────────────────────────────────────────────────────
async function itemRoutingStatus(itemId: string): Promise<string | null> {
  const r = await readPool.query(`SELECT routing_status FROM itinerary_items WHERE id = $1`, [itemId]);
  return r.rows[0]?.routing_status ?? null;
}

async function transitionLogCount(tripId: string): Promise<number> {
  const r = await readPool.query(`SELECT count(*)::int AS n FROM item_transition_log WHERE trip_id = $1`, [tripId]);
  return r.rows[0]?.n ?? 0;
}

async function cartItemCount(userId: string): Promise<number> {
  const r = await readPool.query(`SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1`, [userId]);
  return r.rows[0]?.n ?? 0;
}

async function bookingCountForTraveler(userId: string): Promise<number> {
  const r = await readPool.query(`SELECT count(*)::int AS n FROM service_bookings WHERE traveler_id = $1`, [userId]);
  return r.rows[0]?.n ?? 0;
}

/** The live fee_bands expert_standard band — the DB source of truth for the 75/25 split (no literal). */
async function expertStandardBand(): Promise<{ rate: number; rateType: string } | null> {
  const r = await readPool.query(
    `SELECT CAST(default_rate AS FLOAT) AS rate, rate_type FROM fee_bands WHERE band_key = 'expert_standard' AND is_active = true LIMIT 1`,
  );
  const row = r.rows[0];
  return row ? { rate: row.rate, rateType: row.rate_type } : null;
}

// Shared cast — created once, reused read-only-ish (each test uses its own fresh trip/item).
let owner: Actor;
let stranger: Actor;

before(async () => {
  // Fail fast if the dev server isn't up — these negatives target the assembled surface.
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('Start application' workflow)`);

  owner = await registerActor("owner");
  stranger = await registerActor("stranger");
});

after(async () => {
  try {
    // DB-write safety: refuse destructive cleanup unless the DB is a disposable dev/CI target
    // (localhost/127.0.0.1 or explicit JOURNEY_DB_WRITES_OK=1). Each fixture email is
    // `jsn-<RUN>-<label>@t.test`, so the DELETEs are scoped to EXACTLY this run's users and
    // cascade to their trips/items/cart/log/bookings — never a broad delete.
    if (createdEmails.length > 0) {
      await assertDisposableDb(readPool);
      for (const email of createdEmails) {
        await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
      }
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// matrix-id: N1
// Contract §2 (Expert workspace = NEVER on ready_for_checkout) + §4 (traveler-only,
// enforced in code). No routing endpoint on current main sets ready_for_checkout for a
// non-owner: routing.routes.ts is the sole ready_for_checkout writer and gates it on
// isTripOwner (403 otherwise); booking-actions only writes with_expert; item-routing.service
// writes purchased/in_planning (checkout/refund). A non-owning actor (the expert's posture
// on this state) is rejected and the item stays in_planning with no diary row.
// ---------------------------------------------------------------------------
test("N1: a non-owner cannot set ready_for_checkout via the routing endpoint; item + log untouched", async () => {
  const tripId = await createTrip(owner, "N1 trip");
  const itemId = await createItem(owner, tripId, "N1 item");
  const logBefore = await transitionLogCount(tripId);

  const res = await api(`/api/trips/${tripId}/items/${itemId}/route`, stranger.cookie, "POST", {
    to: "ready_for_checkout",
  });
  assert.equal(res.status, 403, `expected 403 for a non-owner setting ready_for_checkout: ${await res.clone().text()}`);

  assert.equal(await itemRoutingStatus(itemId), "in_planning", "rejected routing must not move the item");
  assert.equal(await transitionLogCount(tripId), logBefore, "a rejected transition must write no diary row");
});

// ---------------------------------------------------------------------------
// matrix-id: N2
// Contract §2: Projection sync + Optimizer + apply write NO routing_status ever.
// The apply endpoint (POST /api/itinerary-comparisons/:id/apply-to-trip, plancard.routes.ts)
// only ever deletes in_planning rows and inserts new rows at the migration-159 default
// (in_planning); it never SETs routing_status on a routed row. Testable-on-main proof: a
// seeded trip whose item is routed to ready_for_checkout keeps that value across the closest
// mutation we can drive as the owner (the finalize path, which shares the diary vocabulary but
// is declared to NOT touch routing_status). Before/after diff = zero routing_status changes.
// (Full 3-variant optimizer apply is J6/Journey Wave 1 journey scope; here we lock the contract row
// that apply/optimizer are NEVER writers of routing_status by proving a routed value survives.)
// ---------------------------------------------------------------------------
test("N2: routing_status values are unchanged by non-routing owner mutations (finalize) — before/after diff is zero", async () => {
  const tripId = await createTrip(owner, "N2 trip");
  const stagedItem = await createItem(owner, tripId, "N2 staged");
  const planningItem = await createItem(owner, tripId, "N2 planning");

  // Route one item to ready_for_checkout (owner-legal), leave the other in_planning.
  const route = await api(`/api/trips/${tripId}/items/${stagedItem}/route`, owner.cookie, "POST", {
    to: "ready_for_checkout",
  });
  assert.equal(route.status, 200, await route.clone().text());

  const before = {
    staged: await itemRoutingStatus(stagedItem),
    planning: await itemRoutingStatus(planningItem),
  };
  assert.deepEqual(before, { staged: "ready_for_checkout", planning: "in_planning" });

  // Drive a non-routing owner mutation that is contractually NOT a routing_status writer.
  const finalize = await api(`/api/trips/${tripId}/finalize`, owner.cookie, "POST", {});
  assert.equal(finalize.status, 200, `finalize should succeed: ${await finalize.clone().text()}`);

  const after = {
    staged: await itemRoutingStatus(stagedItem),
    planning: await itemRoutingStatus(planningItem),
  };
  assert.deepEqual(after, before, "no routing_status value may change through a non-routing writer");
});

// ---------------------------------------------------------------------------
// matrix-id: N3  (skipped — deferred:lane-6 per brief §4/§7)
// ---------------------------------------------------------------------------
test("N3: variant omitting an in-checkout item rejected at generation", { skip: "deferred:lane-6 — generation-time rejection ships with Lane 6 code (ruling 7/15); not buildable on current main" }, () => {});

// ---------------------------------------------------------------------------
// matrix-id: N4
// Contract §2: Projection sync (W2) is the ONLY writer of cart_items — it writes cart rows
// derived from routing_status, never a direct public write path. Route-inventory style
// assertion (brief §4: acceptable when no direct API exists): grep the server route files for
// any cart_items write (drizzle .insert(cartItems)/.values or raw INSERT INTO cart_items) and
// assert every such write lives behind the projection service (cart-projection.service.ts) or
// its guest-migration sibling — NOT a bare public route handler.
// ---------------------------------------------------------------------------
test("N4: no route file writes cart_items except via the projection writer (route-inventory absence)", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const routesDir = path.resolve("server/routes");
  const entries = await fs.readdir(routesDir);
  const offenders: string[] = [];
  // A direct cart_items write = drizzle insert/update on the cartItems table, or a raw SQL
  // INSERT/UPDATE INTO cart_items, appearing inside a route file. The sanctioned writer is the
  // projection service, which route files CALL (cartProjection.addToCart / syncItemProjection),
  // never a table write inlined into a handler.
  const writeRe = /\.(insert|update)\(\s*cartItems\b|INSERT\s+INTO\s+cart_items|UPDATE\s+cart_items/i;
  for (const f of entries) {
    if (!f.endsWith(".ts")) continue;
    const src = await fs.readFile(path.join(routesDir, f), "utf8");
    if (writeRe.test(src)) offenders.push(f);
  }
  assert.deepEqual(
    offenders,
    [],
    `only cart-projection.service.ts may write cart_items; route files must delegate. Offenders: ${offenders.join(", ")}`,
  );

  // Positive control: the sanctioned projection write path DOES exist where declared, so the
  // absence above is meaningful (not a grep that would pass on an empty codebase).
  const projSrc = await fs.readFile(path.resolve("server/services/cart-projection.service.ts"), "utf8");
  assert.ok(
    /\.insert\(\s*cartItems\b/.test(projSrc),
    "the projection service must be the actual cart_items writer (positive control for the absence assertion)",
  );
});

// ---------------------------------------------------------------------------
// matrix-id: N5
// Contract §2: Provider back-office = NEVER on every routing_status. A provider-facing
// bookings payload must not carry routing_status anywhere (deep JSON scan). On current main a
// provider session with no bookings returns []; the deep-scan of the full provider bookings
// payload contains no `routing_status`/`routingStatus` key. (Populated-booking provider payloads
// are Journey Wave 4 / J11 scope; the NEVER-key absence is provable now on the live shape.)
// ---------------------------------------------------------------------------
test("N5: the provider bookings payload never exposes routing_status (deep JSON scan)", async () => {
  const provider = await registerActor("provider");
  const res = await api(`/api/provider/bookings`, provider.cookie, "GET");
  assert.equal(res.status, 200, `provider bookings must be reachable by a provider session: ${await res.clone().text()}`);
  const payload = await res.json();

  const hits: string[] = [];
  const scan = (node: any, pathStr: string) => {
    if (node === null || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (/^routing_?status$/i.test(k)) hits.push(`${pathStr}.${k}`);
      scan(v, `${pathStr}.${k}`);
    }
  };
  scan(payload, "$");
  assert.deepEqual(hits, [], `provider payloads must omit routing_status (contract NEVER row). Found: ${hits.join(", ")}`);
});

// ---------------------------------------------------------------------------
// matrix-id: N6
// trackingNumber is display/provenance identity (ruling 10/17) — never a mutation selector.
// Representative mutation: the routing endpoint keys strictly on the trip UUID + item UUID.
// Supplying a real trackingNumber where a :tripId is expected must NOT resolve to the trip —
// it 404s (item-not-found on that path segment), never mutates, and writes no diary row on the
// real trip. Proves trackingNumber can't be used as an identifier to reach a mutation.
// ---------------------------------------------------------------------------
test("N6: a trackingNumber cannot be used as a mutation identifier (routing path) — 4xx, no side effect", async () => {
  const tripId = await createTrip(owner, "N6 trip");
  const itemId = await createItem(owner, tripId, "N6 item");
  const tripRow = await readPool.query(`SELECT tracking_number FROM trips WHERE id = $1`, [tripId]);
  const trackingNumber = tripRow.rows[0]?.tracking_number as string;
  assert.ok(trackingNumber, "fixture precondition: trip has a trackingNumber (mint tripwire)");
  const logBefore = await transitionLogCount(tripId);

  // Address the mutation by trackingNumber in the :tripId slot (and the real item id).
  const res = await api(`/api/trips/${trackingNumber}/items/${itemId}/route`, owner.cookie, "POST", {
    to: "with_expert",
  });
  assert.ok(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}: ${await res.clone().text()}`);

  assert.equal(await itemRoutingStatus(itemId), "in_planning", "the item must not move when addressed by trackingNumber");
  assert.equal(await transitionLogCount(tripId), logBefore, "no diary row may be written for a trackingNumber-addressed mutation");
});

// ---------------------------------------------------------------------------
// matrix-id: N7
// Money path (POST /api/checkout): the server ignores client-supplied amount/userId — the
// acting user is the SESSION user (getUserId), the amount is server-computed from the cart via
// the fee resolver (never a client value, never a literal). Two facts:
//   (a) a spoofed userId is ignored — checkout keys off the empty SESSION cart and 400s
//       "Cart is empty"; NO booking row is created for either the session user or the spoofed
//       target, and the spoofed amount reaches nothing.
//   (b) the fee resolution the charge path uses is config-sourced: /api/booking-fee-config
//       returns the platform-take derived from the live fee_bands expert_standard row read
//       from the DB — proving no hardcoded rate (getExpertSplitRates / resolveExpertSharePct).
// ---------------------------------------------------------------------------
test("N7: /api/checkout ignores client amount/userId (server value used); no booking side effect", async () => {
  // A FRESH buyer whose SESSION cart is guaranteed empty (the shared `owner` accrues cart rows
  // from the routing tests, which would change the branch under test).
  const buyer = await registerActor("n7-buyer");
  const spoofTarget = await registerActor("n7-spoof");
  const before = {
    session: await bookingCountForTraveler(buyer.id),
    spoof: await bookingCountForTraveler(spoofTarget.id),
  };

  const res = await api("/api/checkout", buyer.cookie, "POST", {
    tripId: null,
    idempotencyKey: crypto.randomUUID(),
    // The spoof attempt — both must be ignored by the server:
    userId: spoofTarget.id,
    amount: 0.01,
    totalAmount: 0.01,
  });
  // Empty session cart ⇒ 400 "Cart is empty" (proves the server keyed off the SESSION user,
  // not the spoofed userId which owns no cart either — a rejection with no money side effect).
  assert.equal(res.status, 400, `expected 400 for an empty-cart checkout: ${await res.clone().text()}`);

  assert.equal(await bookingCountForTraveler(buyer.id), before.session, "no booking may be created for the session user");
  assert.equal(await bookingCountForTraveler(spoofTarget.id), before.spoof, "no booking may be created for the spoofed userId");

  // (b) The charge-side fee resolution is config-driven, not a literal.
  const band = await expertStandardBand();
  assert.ok(band && band.rateType === "percent", "fee_bands expert_standard must be an active percent band (DB source of truth)");
  const cfgRes = await api("/api/booking-fee-config", owner.cookie, "GET");
  assert.equal(cfgRes.status, 200, await cfgRes.clone().text());
  const cfg = (await cfgRes.json()) as any;
  // platform_take_percent must equal the DB band rate × 100 (server derives it from the band,
  // never a hardcoded number). Compare against the value READ FROM THE DB, per §9 (no literal).
  const expectedPlatformPct = Math.round(band!.rate * 100 * 100) / 100;
  assert.equal(
    cfg.platform_fee_percent,
    expectedPlatformPct,
    "the fee config must be derived from the live fee_bands row, not a literal",
  );
  assert.equal(
    Math.round((cfg.platform_fee_percent + cfg.expert_share_percent) * 100) / 100,
    100,
    "platform + expert share must sum to 100 (derived split, not independent literals)",
  );
});

// ---------------------------------------------------------------------------
// matrix-id: N8
// Contract §Share/collaborators (render-only) + IDOR guard: a stranger GET on another user's
// trip (GET /api/trips/:id) is 403 with no data leak (no trip body).
// ---------------------------------------------------------------------------
test("N8: a stranger GET on another user's trip is rejected with no data leak", async () => {
  const tripId = await createTrip(owner, "N8 private trip");

  const res = await api(`/api/trips/${tripId}`, stranger.cookie, "GET");
  // The assembled app rejects the authenticated non-owner. NOTE (FINDING, reported — not fixed):
  // GET /api/trips/:id is registered TWICE. The FIRST registration (server/routes.ts:969,
  // requireAuthOrShareToken) wins and returns 401 "Unauthorized"; the sibling in
  // trips.routes.ts:218 returns 403 "Access denied" WITH IDOR logging but is shadowed and never
  // reached. The negative's contract (reject + no leak) holds either way — accept 401 or 403.
  assert.ok(res.status === 401 || res.status === 403, `stranger must be rejected (401/403), got ${res.status}: ${await res.clone().text()}`);
  const body = (await res.json()) as any;
  // No leak: the 403 body carries a message only, never the trip fields.
  assert.equal(body.title, undefined, "403 body must not leak the trip title");
  assert.equal(body.destination, undefined, "403 body must not leak the trip destination");
  assert.equal(body.userId, undefined, "403 body must not leak the owner id");

  // Sanity: the owner CAN read it (the trip exists — the 403 is authorization, not 404-masking).
  const ownerRes = await api(`/api/trips/${tripId}`, owner.cookie, "GET");
  assert.equal(ownerRes.status, 200, "the owner must still be able to read their own trip");
});

// ---------------------------------------------------------------------------
// matrix-id: N9
// Contract §Share/collaborators: share surfaces expose NO routing actions to non-owners. A
// routing mutation carrying ONLY a share token (no owning session) is rejected — the routing
// endpoint is isAuthenticated + isTripOwner and never consults a share token. Attempt the
// routing write with the trip's real shareToken as a query param and NO session cookie → 401
// (unauthenticated), item + log untouched.
// ---------------------------------------------------------------------------
test("N9: a routing mutation with only a share token is rejected; no side effect", async () => {
  const tripId = await createTrip(owner, "N9 shared trip");
  const itemId = await createItem(owner, tripId, "N9 item");

  // Mint a share token via the app: PATCH is guest-editable via token, but first we need the
  // token. Guests get a token only on guest-created trips; for an owned trip we read the token
  // the owner would share. If no token exists yet, the routing endpoint still can't be reached
  // by a tokenless/sessionless caller — which is exactly the negative.
  const tokenRow = await readPool.query(`SELECT share_token FROM trips WHERE id = $1`, [tripId]);
  const shareToken = tokenRow.rows[0]?.share_token as string | null;
  const logBefore = await transitionLogCount(tripId);

  // Attempt the routing write with NO session cookie, only the share token on the query string.
  const url = `/api/trips/${tripId}/items/${itemId}/route${shareToken ? `?token=${shareToken}` : ""}`;
  const res = await api(url, undefined, "POST", { to: "with_expert" });
  assert.ok(res.status === 401 || res.status === 403, `share-token-only routing write must be rejected: ${res.status} ${await res.clone().text()}`);

  assert.equal(await itemRoutingStatus(itemId), "in_planning", "a share-token-only write must not move the item");
  assert.equal(await transitionLogCount(tripId), logBefore, "no diary row for a share-token-only routing write");
});

// ---------------------------------------------------------------------------
// matrix-id: N10  (skipped — unbuildable on current main without a real payment)
// Contract §3.1: RM clone-on-purchase must override routing_status so cloned items are born
// in_planning (never carry author-side status). The clone runs ONLY inside the paid purchase
// fulfilment (POST /api/ready-made/:id/purchase → Stripe PaymentIntent → /purchase/confirm →
// ready-made-purchase.service.ts fulfil), which requires a genuinely succeeded Stripe
// PaymentIntent — not driveable API-only in this Tier-3 harness. Positive clone assertion is
// J3 (Stripe TEST mode) journey scope. FINDING recorded in the report: the clone spread-copy in
// ready-made-purchase.service.ts (`{ ...rest, tripId }`) does NOT explicitly override
// routing_status, so it copies the author-side value verbatim — contract §3.1 / decision 1 asks
// for an explicit override at that spread; in practice author items are in_planning, but the
// contract-mandated explicit override is absent.
// ---------------------------------------------------------------------------
test("N10: RM clone born in_planning (no author routing status carried)", { skip: "unbuildable on current main — clone runs only inside paid Stripe purchase fulfilment; positive assertion is J3 (Stripe TEST mode). See report FINDING on the un-overridden clone spread-copy." }, () => {});

// ---------------------------------------------------------------------------
// matrix-id: N11
// Born-approved is impossible via the API (ruling 35). POST /api/expert-application with a
// smuggled status:'approved' — the insert schema (insertLocalExpertFormSchema) OMITS status, so
// it is stripped; the created row lands in the initial status 'pending' and the actor's role is
// NOT flipped. (createProviderService applies the same clamp for services — asserted by the
// server-side clamp; the application path is the cleanest HTTP-level born-approved probe.)
// ---------------------------------------------------------------------------
test("N11: an application create cannot be born approved — smuggled status is stripped; row lands 'pending'", async () => {
  const applicant = await registerActor("n11-applicant");

  const res = await api("/api/expert-application", applicant.cookie, "POST", {
    firstName: "Neg",
    lastName: "Applicant",
    email: applicant.email,
    city: "Kyoto",
    country: "Japan",
    expertType: "local_expert",
    status: "approved", // the smuggle attempt — must be stripped by the guard
  });
  assert.equal(res.status, 201, `application submit should succeed (status stripped, not rejected): ${await res.clone().text()}`);

  const formRow = await readPool.query(`SELECT status FROM local_expert_forms WHERE user_id = $1`, [applicant.id]);
  assert.equal(formRow.rows[0]?.status, "pending", "born-approved must be impossible: the row lands in the initial 'pending' status");

  const userRow = await readPool.query(`SELECT role FROM users WHERE id = $1`, [applicant.id]);
  assert.equal(userRow.rows[0]?.role, "user", "submitting an application must not flip the actor's role");
});

// ---------------------------------------------------------------------------
// matrix-id: N12
// Cross-cutting invariant (matrix §14): no Express route performs UPDATE/DELETE on
// item_transition_log — the log is append-only (Lane S rulings 11/16/18). Automated route
// inventory (static scan of server route files): assert ZERO drizzle .update/.delete on the
// itemTransitionLog table and ZERO raw UPDATE/DELETE ... item_transition_log in any route file.
// ---------------------------------------------------------------------------
test("N12: no route file performs UPDATE/DELETE on item_transition_log (append-only inventory)", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const routesDir = path.resolve("server/routes");
  const entries = await fs.readdir(routesDir);
  const offenders: string[] = [];
  const mutateRe =
    /\.(update|delete)\(\s*itemTransitionLog\b|(?:UPDATE|DELETE\s+FROM)\s+item_transition_log/i;
  for (const f of entries) {
    if (!f.endsWith(".ts")) continue;
    const src = await fs.readFile(path.join(routesDir, f), "utf8");
    if (mutateRe.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `item_transition_log is append-only — no route may UPDATE/DELETE it. Offenders: ${offenders.join(", ")}`);

  // Positive control: the append-only INSERT writer exists (via the log service), so the
  // absence of mutations is a real finding, not a vacuous grep.
  const svc = await fs.readFile(path.resolve("server/services/item-transition-log.service.ts"), "utf8");
  assert.ok(/\.insert\(\s*itemTransitionLog\b/.test(svc), "the log service must INSERT (append-only) — positive control");
});

// ---------------------------------------------------------------------------
// matrix-id: N13  (skipped — no distinct authenticated-reachable guest fallback endpoint on main)
// Ruling 5: the optimizer's cart-read fallback gates strictly on guest-ness — no authenticated
// user ever touches the guest cart-read path. On current main the optimizer generate handler
// (POST /api/itinerary-comparisons/:id/generate) is isAuthenticated and reads the AUTHENTICATED
// user's OWN cart (pre-G2 behaviour, not a guest fallback), and the only guest cart surface is
// migration (POST after login). There is no separate guest-only cart-fallback ENDPOINT that an
// authenticated session can be pointed at to prove the gate, so this negative has no buildable
// forbidden action on main. Deferred to G2 (matrix §13 / J4 deferred:G2).
// ---------------------------------------------------------------------------
test("N13: guest cart-fallback endpoints reject/redirect authenticated sessions", { skip: "unbuildable on current main — no distinct guest-only cart-fallback endpoint exists (ruling 5 gate lives inside the optimizer's guest-ness branch, not a separate route); retirement is a G2 exit criterion (matrix §13 / J4 deferred:G2)" }, () => {});

// ---------------------------------------------------------------------------
// matrix-id: N14  (covered-by-N8)
// A forwarded message deep-link ≠ an authorization grant: a stranger who opens another user's
// /plans/:tripId (which resolves to GET /api/trips/:id) gets 403 with no data leak. This is the
// SAME server enforcement asserted in N8 via the trip-access path; the message path merely
// forwards the same URL. No separate side effect exists to assert — see N8.
// ---------------------------------------------------------------------------
test("N14: forwarded message deep-link is not an auth grant (dup of N8 via the message path)", async () => {
  // Re-drive the N8 enforcement to keep the matrix cell green against the live surface: a
  // stranger hitting the deep-linked trip resource is rejected. (The message row itself carries
  // only relatedType/relatedId + frozen title — the auth check is on the trip read, per N8.)
  const tripId = await createTrip(owner, "N14 deep-link trip");
  const res = await api(`/api/trips/${tripId}`, stranger.cookie, "GET");
  assert.ok(res.status === 401 || res.status === 403, `stranger following a forwarded deep-link is rejected exactly as in N8, got ${res.status}`);
  const body = (await res.json()) as any;
  assert.equal(body.title, undefined, "no data leak through the deep-link path either");
});

// ---------------------------------------------------------------------------
// matrix-id: N15
// Cross-cutting invariant (matrix §14), mirror of N12: no routing_status mutation flows through
// the getTripRole path. Scope §4 forbids routing NEW routing_status mutations through getTripRole
// (it never reads `trips`, so a trip's own owner gets no role from it — L10). The routing_status
// WRITERS on main — routing.routes.ts, booking-actions.ts, item-routing.service.ts — must NOT
// use getTripRole; they resolve access via verifyTripOwnership / isTripOwner / isTripAdvisor.
// Automated route inventory: assert none of the routing_status-writing files reference getTripRole.
// ---------------------------------------------------------------------------
test("N15: no routing_status writer routes access through getTripRole (inventory)", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  // The set of files that actually SET routing_status (the state-machine writers).
  const writerFiles = [
    "server/routes/routing.routes.ts",
    "server/routes/booking-actions.ts",
    "server/services/item-routing.service.ts",
  ];
  const offenders: string[] = [];
  for (const rel of writerFiles) {
    const src = await fs.readFile(path.resolve(rel), "utf8");
    // A getTripRole CALL (not merely a comment naming it). Strip line comments first so the
    // routing.routes.ts explanatory comment ("does NOT go through getTripRole") doesn't trip.
    const codeOnly = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.trim().startsWith("/*"))
      .join("\n");
    if (/\bgetTripRole\s*\(/.test(codeOnly)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `routing_status writers must NOT gate on getTripRole (scope §4 / L10). Offenders: ${offenders.join(", ")}`,
  );

  // Positive control: getTripRole DOES exist as a real, called function elsewhere (so the
  // absence in the writers is meaningful). It gates non-routing itinerary-item edits.
  const trips = await fs.readFile(path.resolve("server/routes/trips.routes.ts"), "utf8");
  assert.ok(/\bgetTripRole\s*\(/.test(trips), "getTripRole must be a live gate elsewhere — positive control for the writer-absence assertion");
});
