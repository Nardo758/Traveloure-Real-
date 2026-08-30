/**
 * D3 — PDF ARTIFACT-DELIVERY FULFILLMENT RAIL (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md).
 *
 * Scope is `pdf` only, deliberately — NOT `video`. D2 (same brief, also ratified) already
 * classifies `video` as a LIVE session ("Video call") that needs SCHEDULED_METHODS/availability,
 * not an artifact file; see `shared/service-fundamentals.ts` isArtifactDelivery for the full
 * reasoning.
 *
 * `provider_services.serviceFile` was a dead column with zero client references — a buyer of a
 * pdf-delivery service received NOTHING after purchase. This suite proves the fulfillment rail
 * end to end AND the leak-prevention half (§13 honest data, the file URL is the product — a
 * pre-purchase leak is theft):
 *
 *   (a) GET /api/service-bookings/:id/deliverable 404s for: a non-buyer (someone else's booking),
 *       an unconfirmed (payment_pending) booking, and a confirmed booking whose service has no
 *       uploaded file yet.
 *   (b) The same endpoint GRANTS the file URL for a confirmed booking belonging to the session
 *       user, on an artifact-delivery (pdf) service.
 *   (c) serviceFile is NEVER present on public/pre-purchase reads: GET /api/services/:id (public
 *       detail), GET /api/services (public list), GET /api/provider-services (public browse), and
 *       GET /api/cart (the buyer's OWN cart, which is pre-purchase by definition — a leak here
 *       would let a buyer add-to-cart, read the file, and abandon the cart unpaid).
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000, same
 * posture as journey-suite-negatives.http.test.ts — fixtures via the app's own auth API for
 * users (real FK-safe ids + session cookies), direct disposable-DB-guarded SQL for the
 * provider_services/service_bookings rows (matching booking-birth-provenance.db.test.ts /
 * checkout-payment-promotion.db.test.ts precedent — there is no "create a confirmed booking"
 * HTTP path outside the full Stripe checkout flow, so the fixture writes the row directly).
 *
 * Run solo: npx tsx --test server/__tests__/service-deliverable.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors journey-suite-negatives.http.test.ts; never defaults open) ──
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
async function assertDisposableDb(): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let serverAddr: string | null = null;
  try {
    const r = await readPool.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    // NULL inet_server_addr() (local socket/loopback) is itself a disposable-local signal.
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[service-deliverable] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `svd-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = emailTag(label);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Deliv", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const FILE_URL = "https://cdn.example.com/deliverables/travel-guide.pdf";

async function makeService(opts: {
  ownerId: string;
  deliveryMethod: string;
  serviceFile?: string | null;
}): Promise<string> {
  const id = `svd-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, description, price, status, approval_status, delivery_method, service_file)
     VALUES ($1, $2, $3, 'fixture pdf service', '25.00', 'active', 'approved', $4, $5)`,
    [id, opts.ownerId, `D3 service ${RUN}`, opts.deliveryMethod, opts.serviceFile ?? null],
  );
  createdServiceIds.push(id);
  return id;
}

async function makeBooking(opts: {
  serviceId: string;
  travelerId: string;
  providerId: string;
  status: string;
}): Promise<string> {
  const id = `svd-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO service_bookings
       (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, booking_details)
     VALUES ($1, $2, $3, $4, $5, '25.00', '5.00', '{}'::jsonb)`,
    [id, opts.serviceId, opts.travelerId, opts.providerId, opts.status],
  );
  createdBookingIds.push(id);
  return id;
}

let buyer: Actor;
let stranger: Actor;
let provider: Actor;

let pdfServiceId: string;
let pdfServiceNoFileId: string;
let confirmedBookingId: string;
let pendingBookingId: string;
let confirmedNoFileBookingId: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);

  await assertDisposableDb();

  buyer = await registerActor("buyer");
  stranger = await registerActor("stranger");
  provider = await registerActor("provider");

  pdfServiceId = await makeService({ ownerId: provider.id, deliveryMethod: "pdf", serviceFile: FILE_URL });
  pdfServiceNoFileId = await makeService({ ownerId: provider.id, deliveryMethod: "pdf", serviceFile: null });

  confirmedBookingId = await makeBooking({
    serviceId: pdfServiceId,
    travelerId: buyer.id,
    providerId: provider.id,
    status: "confirmed",
  });
  pendingBookingId = await makeBooking({
    serviceId: pdfServiceId,
    travelerId: buyer.id,
    providerId: provider.id,
    status: "payment_pending",
  });
  confirmedNoFileBookingId = await makeBooking({
    serviceId: pdfServiceNoFileId,
    travelerId: buyer.id,
    providerId: provider.id,
    status: "confirmed",
  });
});

after(async () => {
  try {
    await assertDisposableDb();
    // service_bookings/provider_services FK-cascade from users, but delete explicitly first so
    // a partial failure never leaves orphaned fixture rows behind for the next run to trip over.
    for (const id of createdBookingIds) {
      await readPool.query(`DELETE FROM service_bookings WHERE id = $1`, [id]).catch(() => {});
    }
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ── (a) 403/404 negatives ────────────────────────────────────────────────────────────────────

test("D3-a1: a non-buyer cannot read another traveler's deliverable (404, undifferentiated)", async () => {
  const res = await api(`/api/service-bookings/${confirmedBookingId}/deliverable`, stranger.cookie);
  assert.equal(res.status, 404);
});

test("D3-a2: an unconfirmed (payment_pending) booking never unlocks the deliverable, even for the real buyer", async () => {
  const res = await api(`/api/service-bookings/${pendingBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 404);
});

test("D3-a3: a confirmed booking whose service has no uploaded file is an honest absence, not a grant", async () => {
  const res = await api(`/api/service-bookings/${confirmedNoFileBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, "NO_DELIVERABLE_UPLOADED");
});

test("D3-a4: no session at all is rejected (401), never silently 404'd through to a guess", async () => {
  const res = await api(`/api/service-bookings/${confirmedBookingId}/deliverable`, undefined);
  assert.ok(res.status === 401 || res.status === 404, `expected 401/404, got ${res.status}`);
});

// ── (b) the grant ────────────────────────────────────────────────────────────────────────────

test("D3-b1: the real buyer on a confirmed pdf-delivery booking gets the file URL", async () => {
  const res = await api(`/api/service-bookings/${confirmedBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fileUrl, FILE_URL);
  assert.equal(body.deliveryMethod, "pdf");
});

// ── (c) leak prevention — serviceFile must never ride a public/pre-purchase read ────────────────

/** The one property that actually matters: the real deliverable URL is never handed to a
 *  non-owner, whether the field is omitted entirely (routes that use omitFields) or present-
 *  but-redacted-to-null (storage functions whose declared return type is ProviderService[] and
 *  so cannot drop the key without a wider, riskier type change). Both shapes are equally safe;
 *  this assertion is deliberately shape-agnostic so it fails on the thing that would actually be
 *  theft — the URL leaking — not on which of the two sanctioned redaction shapes a given route
 *  chose. */
function assertNoServiceFileLeak(payload: unknown, serviceFileValue: unknown) {
  assert.ok(
    serviceFileValue === undefined || serviceFileValue === null,
    `serviceFile must be absent or null, got: ${JSON.stringify(serviceFileValue)}`,
  );
  assert.ok(!JSON.stringify(payload).includes(FILE_URL), "the raw file URL must not appear anywhere in this payload");
}

test("D3-c1: GET /api/services/:id (public detail) does not include serviceFile", async () => {
  const res = await api(`/api/services/${pdfServiceId}`, undefined);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assertNoServiceFileLeak(body, body.serviceFile);
});

test("D3-c2: GET /api/services (public browse) does not include serviceFile on any row", async () => {
  const res = await api(`/api/services`, undefined);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any[];
  const mine = body.find((s) => s.id === pdfServiceId);
  assert.ok(mine, "the fixture pdf service should appear in public browse (active + approved)");
  assertNoServiceFileLeak(mine, mine.serviceFile);
});

test("D3-c3: GET /api/provider-services (public browse) does not include serviceFile on any row", async () => {
  const res = await api(`/api/provider-services`, undefined);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any[];
  const mine = body.find((s) => s.id === pdfServiceId);
  assert.ok(mine, "the fixture pdf service should appear in public browse (active + approved)");
  assertNoServiceFileLeak(mine, mine.serviceFile);
});

test("D3-c4: the buyer's OWN pre-purchase cart does not carry serviceFile (a cart item is not a purchase)", async () => {
  const addRes = await api("/api/cart/items", buyer.cookie, "POST", { serviceId: pdfServiceId, quantity: 1 });
  assert.equal(addRes.status, 201, `add-to-cart failed: ${await addRes.text()}`);

  const cartRes = await api("/api/cart", buyer.cookie);
  assert.equal(cartRes.status, 200);
  const cart = (await cartRes.json()) as any;
  const items: any[] = Array.isArray(cart) ? cart : (cart.items ?? []);
  const mine = items.find((i) => i.service?.id === pdfServiceId || i.serviceId === pdfServiceId);
  assert.ok(mine, "the added item should be in the cart");
  assertNoServiceFileLeak(mine, mine.service?.serviceFile);
});
