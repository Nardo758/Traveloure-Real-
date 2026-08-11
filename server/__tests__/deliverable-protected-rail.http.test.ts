/**
 * R4 — THE PROTECTED-DELIVERABLE RAIL (docs/DECISIONS.md ruling 58; QA_PUNCH_LIST.md P1).
 *
 * D3's `GET /api/service-bookings/:id/deliverable` gated WHO is told the deliverable location
 * perfectly (proven by `service-deliverable.http.test.ts`'s 9 proofs), then handed back the
 * provider's pasted external URL verbatim — a one-time URL REVEAL, not protected file access.
 * R4 adds a platform-managed upload → proxy-download path that never discloses a location, while
 * leaving the legacy pasted-URL shape working exactly as before (§13 — no silent behavior change
 * for existing rows). R5 adds one `deliverable_downloads` row per successful fetch.
 *
 * This suite proves, against the ALREADY-RUNNING dev server (same posture as
 * `service-deliverable.http.test.ts`):
 *
 *   (a) Upload intake (`POST /api/provider/services/:id/deliverable-file`) is owner-gated (a
 *       stranger and an unauthenticated caller are both refused) and rejects a non-PDF body by its
 *       magic bytes, independent of the declared Content-Type.
 *   (b) A successful upload stores `objstore:<key>` on `provider_services.serviceFile` — never the
 *       raw bytes' location, never a public URL.
 *   (c) The buyer-facing GET streams the EXACT uploaded bytes back with `Content-Type:
 *       application/pdf`, and the JSON-shaped legacy fields (`fileUrl`/`deliveryMethod`) are
 *       ABSENT from that response — the storage location is never disclosed in any form.
 *   (d) A legacy plain-URL deliverable keeps returning `{ fileUrl, deliveryMethod }`, now also
 *       carrying an explicit `protected: false` honesty marker.
 *   (e) Every successful fetch (managed or legacy) writes exactly one `deliverable_downloads` row,
 *       attributing booking/service/user/protected-flag correctly.
 *   (f) The pre-existing entitlement negatives (non-buyer, unconfirmed booking) still 404
 *       undifferentiated on a MANAGED deliverable, exactly as `service-deliverable.http.test.ts`
 *       already proves for the legacy shape.
 *
 * TEST DRIVER: the dev server this suite targets MUST be started with `OBJECT_STORAGE_DRIVER=memory`
 * (see `server/infrastructure/object-storage.ts`) — an in-process `Map<string, Buffer>` stands in
 * for the real GCS-backed Replit client, so the managed upload → download → stream path is
 * exercised with NO live Replit object-storage credentials (none are available in this container;
 * `REPLIT_OBJECT_STORAGE_BUCKET` is unset here by design — see the R4 ledger entry). The route code
 * under test is unaware of the swap; it only ever calls `uploadBuffer`/`downloadBytes` from the
 * wrapper. `before()` asserts the driver is actually active so this suite fails loudly (not
 * silently skips) if the server was started without it.
 *
 * Run solo: OBJECT_STORAGE_DRIVER=memory npx tsx --test server/__tests__/deliverable-protected-rail.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors service-deliverable.http.test.ts) ────────────────────────────
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
      `[deliverable-protected-rail] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `dpr-${RUN}-${label}@t.test`;
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

function uploadDeliverable(serviceId: string, cookie: string | undefined, buf: Buffer, contentType = "application/pdf") {
  return fetch(`${BASE_URL}/api/provider/services/${serviceId}/deliverable-file`, {
    method: "POST",
    headers: { "content-type": contentType, ...(cookie ? { cookie } : {}) },
    body: buf,
  });
}

const LEGACY_FILE_URL = "https://cdn.example.com/deliverables/dpr-legacy.pdf";
const REAL_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const NOT_A_PDF = Buffer.from("this is definitely not a pdf, just text bytes");

async function makeService(opts: { ownerId: string; serviceFile?: string | null }): Promise<string> {
  const id = `dpr-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, description, price, status, approval_status, delivery_method, service_file)
     VALUES ($1, $2, $3, 'fixture pdf service', '25.00', 'active', 'approved', 'pdf', $4)`,
    [id, opts.ownerId, `R4 service ${RUN}`, opts.serviceFile ?? null],
  );
  createdServiceIds.push(id);
  return id;
}

async function makeBooking(opts: { serviceId: string; travelerId: string; providerId: string; status: string }): Promise<string> {
  const id = `dpr-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO service_bookings
       (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, booking_details)
     VALUES ($1, $2, $3, $4, $5, '25.00', '5.00', '{}'::jsonb)`,
    [id, opts.serviceId, opts.travelerId, opts.providerId, opts.status],
  );
  createdBookingIds.push(id);
  return id;
}

async function serviceFileValue(serviceId: string): Promise<string | null> {
  const r = await readPool.query(`SELECT service_file FROM provider_services WHERE id = $1`, [serviceId]);
  return r.rows[0]?.service_file ?? null;
}

async function downloadRows(bookingId: string): Promise<Array<{ protected: boolean; user_id: string; service_id: string }>> {
  const r = await readPool.query(
    `SELECT protected, user_id, service_id FROM deliverable_downloads WHERE booking_id = $1 ORDER BY downloaded_at ASC`,
    [bookingId],
  );
  return r.rows;
}

let provider: Actor;
let buyer: Actor;
let stranger: Actor;

let managedServiceId: string; // starts with no file — upload happens in-suite
let legacyServiceId: string;

let managedBookingId: string;
let managedPendingBookingId: string;
let legacyBookingId: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);

  await assertDisposableDb();

  provider = await registerActor("provider");
  buyer = await registerActor("buyer");
  stranger = await registerActor("stranger");

  // The upload endpoint lives under /api/provider/services, gated by the earner-role RBAC
  // backstop (server/routes.ts EARNER_SELF_SERVICE_PREFIXES -> isEarner) shared with every other
  // POST/PATCH under that prefix — a freshly-registered account defaults to a non-earner role, so
  // promote the fixture actors the same way a real onboarding flow would. `stranger` also needs
  // an earner role so R4-a2 exercises THIS ROUTE's own ownership check (404) rather than tripping
  // the earlier, unrelated RBAC gate (403) — both are correct refusals, but the ownership check is
  // the thing this suite is proving.
  await readPool.query(`UPDATE users SET role = 'service_provider' WHERE id = ANY($1::varchar[])`, [[provider.id, stranger.id]]);

  managedServiceId = await makeService({ ownerId: provider.id, serviceFile: null });
  legacyServiceId = await makeService({ ownerId: provider.id, serviceFile: LEGACY_FILE_URL });

  managedBookingId = await makeBooking({ serviceId: managedServiceId, travelerId: buyer.id, providerId: provider.id, status: "confirmed" });
  managedPendingBookingId = await makeBooking({ serviceId: managedServiceId, travelerId: buyer.id, providerId: provider.id, status: "payment_pending" });
  legacyBookingId = await makeBooking({ serviceId: legacyServiceId, travelerId: buyer.id, providerId: provider.id, status: "confirmed" });

  // Assert the test driver is actually active — this suite is worthless (and would silently pass
  // for the wrong reason) against the real bucket-absent error path instead of the fake driver.
  const probe = await uploadDeliverable(managedServiceId, provider.cookie, REAL_PDF);
  assert.equal(
    probe.status,
    200,
    `expected the dev server's OBJECT_STORAGE_DRIVER=memory test driver to accept the upload; got ${probe.status}: ${await probe.text()}. ` +
      `Start the dev server with OBJECT_STORAGE_DRIVER=memory for this suite.`,
  );
  const stored = await serviceFileValue(managedServiceId);
  assert.ok(stored?.startsWith("objstore:"), `expected serviceFile to carry the objstore: prefix after upload, got: ${stored}`);
});

after(async () => {
  try {
    await assertDisposableDb();
    await readPool.query(`DELETE FROM deliverable_downloads WHERE booking_id = ANY($1::varchar[])`, [createdBookingIds]).catch(() => {});
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

// ── (a) upload intake gating ─────────────────────────────────────────────────────────────────

test("R4-a1: an unauthenticated caller cannot upload a deliverable", async () => {
  const res = await uploadDeliverable(managedServiceId, undefined, REAL_PDF);
  assert.equal(res.status, 401);
});

test("R4-a2: a non-owner cannot upload a deliverable onto someone else's service (undifferentiated 404)", async () => {
  const res = await uploadDeliverable(managedServiceId, stranger.cookie, REAL_PDF);
  assert.equal(res.status, 404);
});

test("R4-a3: a non-PDF body is rejected by its magic bytes, independent of Content-Type", async () => {
  const res = await uploadDeliverable(managedServiceId, provider.cookie, NOT_A_PDF, "application/pdf");
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "DELIVERABLE_NOT_PDF");
});

test("R4-a4: an empty body is rejected", async () => {
  const res = await uploadDeliverable(managedServiceId, provider.cookie, Buffer.alloc(0));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "DELIVERABLE_FILE_REQUIRED");
});

test("R4-a5: the owner CAN upload a real PDF, and it is stored as objstore:<key>, never a public URL", async () => {
  const res = await uploadDeliverable(managedServiceId, provider.cookie, REAL_PDF);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.protected, true);
  assert.ok(!JSON.stringify(body).includes("storage.googleapis.com"), "the response must never disclose a storage location");
  const stored = await serviceFileValue(managedServiceId);
  assert.ok(stored?.startsWith("objstore:"), `expected objstore: prefix, got: ${stored}`);
  assert.ok(!stored!.includes("storage.googleapis.com"));
});

// ── (c)/(b) the managed download STREAMS bytes and discloses no location ────────────────────────

test("R4-c1: the buyer on a confirmed managed booking receives the EXACT uploaded bytes, as application/pdf", async () => {
  const res = await api(`/api/service-bookings/${managedBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const disposition = res.headers.get("content-disposition") ?? "";
  assert.ok(disposition.includes("attachment"), `expected an attachment Content-Disposition, got: ${disposition}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.equals(REAL_PDF), "streamed bytes must exactly match the uploaded file");
});

test("R4-c2: the managed response body carries no JSON, no fileUrl, no storage location of any kind", async () => {
  const res = await api(`/api/service-bookings/${managedBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 200);
  const text = Buffer.from(await res.arrayBuffer()).toString("latin1");
  assert.ok(!text.includes("fileUrl"), "the managed response must not carry the legacy JSON shape");
  assert.ok(!text.includes("storage.googleapis.com"), "the managed response must never disclose a GCS URL");
  assert.ok(!text.includes("objstore:"), "the managed response must never disclose the storage key");
  assert.equal(res.headers.get("location"), null, "must never redirect to a storage location");
});

// ── (d) legacy plain-URL deliverable keeps its shape, now honestly labeled ──────────────────────

test("R4-d1: a legacy pasted-URL deliverable still returns { fileUrl, deliveryMethod }, now with protected:false", async () => {
  const res = await api(`/api/service-bookings/${legacyBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type")?.includes("application/json"), true);
  const body = await res.json();
  assert.equal(body.fileUrl, LEGACY_FILE_URL);
  assert.equal(body.deliveryMethod, "pdf");
  assert.equal(body.protected, false);
});

// ── (f) entitlement negatives still hold on a MANAGED deliverable ──────────────────────────────

test("R4-f1: a non-buyer cannot read a managed deliverable (undifferentiated 404)", async () => {
  const res = await api(`/api/service-bookings/${managedBookingId}/deliverable`, stranger.cookie);
  assert.equal(res.status, 404);
});

test("R4-f2: an unconfirmed (payment_pending) booking never unlocks a managed deliverable", async () => {
  const res = await api(`/api/service-bookings/${managedPendingBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 404);
});

// ── (e) R5: one deliverable_downloads row per successful fetch ─────────────────────────────────

test("R5-e1: a successful managed fetch writes exactly one deliverable_downloads row, protected:true", async () => {
  const before = await downloadRows(managedBookingId);
  const res = await api(`/api/service-bookings/${managedBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 200);
  await res.arrayBuffer(); // drain
  const after = await downloadRows(managedBookingId);
  assert.equal(after.length, before.length + 1, "exactly one new row per successful fetch");
  const row = after[after.length - 1];
  assert.equal(row.protected, true);
  assert.equal(row.user_id, buyer.id);
  assert.equal(row.service_id, managedServiceId);
});

test("R5-e2: a successful legacy fetch writes exactly one deliverable_downloads row, protected:false", async () => {
  const before = await downloadRows(legacyBookingId);
  const res = await api(`/api/service-bookings/${legacyBookingId}/deliverable`, buyer.cookie);
  assert.equal(res.status, 200);
  await res.json(); // drain
  const after = await downloadRows(legacyBookingId);
  assert.equal(after.length, before.length + 1, "exactly one new row per successful fetch");
  const row = after[after.length - 1];
  assert.equal(row.protected, false);
  assert.equal(row.user_id, buyer.id);
  assert.equal(row.service_id, legacyServiceId);
});

test("R5-e3: a FAILED fetch (non-buyer, 404) writes no download row", async () => {
  const before = await downloadRows(managedBookingId);
  const res = await api(`/api/service-bookings/${managedBookingId}/deliverable`, stranger.cookie);
  assert.equal(res.status, 404);
  const after = await downloadRows(managedBookingId);
  assert.equal(after.length, before.length, "a 404 must never write a download row");
});
