/**
 * Row 307: changing serviceType on an approved provider_services row returns it to review.
 *
 * The review-queue value is approval_status 'submitted' (GET /api/admin/provider-services/pending).
 * The new type is stored on the row. GET /api/services and the city payload
 * (GET /api/discover/location/:city, the data behind /city/:slug) keep the approved-and-active
 * gate, so the listing leaves both, including a city payload that was already cached.
 *
 * A listing already in review stays submitted. A draft stays a draft. An approved edit that
 * does not change the type keeps the current split: a price edit stays live, resending the
 * stored type stays live, and a name edit stages without taking the listing down.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row307-service-type-review.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Pool } from "pg";
import { registerAndSignIn, SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";

const RUN = crypto.randomUUID().slice(0, 8);
const CITY = `R307${RUN}`;
const BASE = process.env.JOURNEY_BASE_URL ?? "http://127.0.0.1:5000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const id = (key: string) => `r307-${RUN}-${key}`;

let ownerCookie = "";
let adminCookie = "";
let ownerId = "";
let adminId = "";

async function api(cookie: string | undefined, method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function insertListing(key: string, serviceType: string, status: string, approval: string) {
  await pool.query(
    `INSERT INTO provider_services (
       id, user_id, service_name, description, price, status, approval_status,
       delivery_method, city, location, service_type, bookings_count
     ) VALUES ($1, $2, $3, 'A listing fixture', '40.00', $4, $5, 'pdf', $6, $6, $7, 1)`,
    [id(key), ownerId, `Listing ${key} ${RUN}`, status, approval, CITY, serviceType],
  );
}

async function row(key: string) {
  const found = await pool.query(
    `SELECT service_type, approval_status, status, edit_review_status, pending_changes, service_name
       FROM provider_services WHERE id = $1`,
    [id(key)],
  );
  return found.rows[0] as {
    service_type: string;
    approval_status: string;
    status: string;
    edit_review_status: string | null;
    pending_changes: Record<string, unknown> | null;
    service_name: string;
  };
}

function idsOf(rows: Array<{ id?: string }> | null | undefined): string[] {
  return (rows ?? []).map((row) => String(row.id));
}

async function publicServiceIds(): Promise<string[]> {
  const res = await api(undefined, "GET", `/api/services?location=${encodeURIComponent(CITY)}`);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return idsOf(res.json);
}

async function cityServiceIds(): Promise<string[]> {
  const res = await api(undefined, "GET", `/api/discover/location/${encodeURIComponent(CITY)}`);
  assert.equal(res.status, 200, JSON.stringify(res.json)?.slice(0, 500));
  assert.equal(res.json?.services?.error, null, JSON.stringify(res.json?.services?.error));
  return idsOf(res.json?.services?.data);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const health = await fetch(`${BASE}/api/health`);
  assert.equal(health.status, 200, "dev server must be running on :5000");

  const owner = await registerAndSignIn({
    baseUrl: BASE,
    email: `${id("owner")}@row307.invalid`,
    password: "TestPass123!",
    firstName: "Row",
    lastName: "Owner",
    extra: { ...SUPPLY_PROVIDER_SIGNUP_EXTRA },
  });
  const admin = await registerAndSignIn({
    baseUrl: BASE,
    email: `${id("admin")}@row307.invalid`,
    password: "TestPass123!",
    firstName: "Row",
    lastName: "Admin",
    extra: { ...SUPPLY_PROVIDER_SIGNUP_EXTRA },
  });
  ownerId = owner.id;
  adminId = admin.id;
  ownerCookie = owner.cookie;
  adminCookie = admin.cookie;
  await pool.query(`UPDATE users SET role = 'service_provider', is_test = FALSE WHERE id = $1`, [ownerId]);
  await pool.query(`UPDATE users SET role = 'admin', is_test = FALSE WHERE id = $1`, [adminId]);

  await insertListing("approved", "planning", "active", "approved");
  await insertListing("control", "planning", "active", "approved");
  await insertListing("pending", "planning", "active", "submitted");
  await insertListing("draft", "planning", "draft", "draft");
  await insertListing("safe", "planning", "active", "approved");
});

after(async () => {
  await pool.query(`DELETE FROM provider_services WHERE id LIKE $1`, [`r307-${RUN}-%`]).catch(() => undefined);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [[ownerId, adminId].filter(Boolean)]).catch(() => undefined);
  await pool.end();
});

test("approved listing + serviceType change returns to review and leaves the public reads", { timeout: 120_000 }, async () => {
  assert.ok((await publicServiceIds()).includes(id("approved")));
  assert.ok((await cityServiceIds()).includes(id("approved")), "city payload includes the approved listing before the type change");
  assert.ok((await cityServiceIds()).includes(id("control")));

  const edited = await api(ownerCookie, "PATCH", `/api/provider/services/${id("approved")}`, {
    serviceType: "experience",
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.json));
  assert.equal(edited.json.serviceType, "experience");
  assert.equal(edited.json.approvalStatus, "submitted");
  assert.equal(edited.json.editReview, undefined);

  const stored = await row("approved");
  assert.equal(stored.service_type, "experience");
  assert.equal(stored.approval_status, "submitted");
  assert.equal(stored.status, "active");
  assert.equal(stored.edit_review_status, null);
  assert.equal(stored.pending_changes, null);

  const browse = await publicServiceIds();
  assert.equal(browse.includes(id("approved")), false);
  assert.ok(browse.includes(id("control")));

  const city = await cityServiceIds();
  assert.equal(city.includes(id("approved")), false, "cached city payload drops the listing after it returns to review");
  assert.ok(city.includes(id("control")));

  const pending = await api(adminCookie, "GET", "/api/admin/provider-services/pending");
  assert.equal(pending.status, 200, JSON.stringify(pending.json)?.slice(0, 300));
  const queued = (pending.json as Array<{ id: string; editReview?: boolean }>).find((item) => item.id === id("approved"));
  assert.ok(queued, "the listing is on the review queue");
  assert.equal(queued.editReview, undefined);
});

test("pending listing + serviceType change stays pending", async () => {
  const before = await row("pending");
  assert.equal(before.approval_status, "submitted");

  const edited = await api(ownerCookie, "PATCH", `/api/provider/services/${id("pending")}`, {
    serviceType: "action",
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.json));
  assert.equal(edited.json.serviceType, "action");
  assert.equal(edited.json.approvalStatus, "submitted");
  assert.equal(edited.json.editReview, undefined);

  const stored = await row("pending");
  assert.equal(stored.service_type, "action");
  assert.equal(stored.approval_status, "submitted");
  assert.equal(stored.edit_review_status, null);
  assert.equal((await publicServiceIds()).includes(id("pending")), false);
});

test("draft listing + serviceType change stays draft and does not enter review", async () => {
  const edited = await api(ownerCookie, "PATCH", `/api/provider/services/${id("draft")}`, {
    serviceType: "specialty",
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.json));
  assert.equal(edited.json.serviceType, "specialty");
  assert.equal(edited.json.approvalStatus, "draft");
  assert.equal(edited.json.editReview, undefined);

  const stored = await row("draft");
  assert.equal(stored.service_type, "specialty");
  assert.equal(stored.approval_status, "draft");
  assert.equal(stored.edit_review_status, null);
  assert.equal(stored.pending_changes, null);

  const pending = await api(adminCookie, "GET", "/api/admin/provider-services/pending");
  assert.equal(pending.status, 200, JSON.stringify(pending.json)?.slice(0, 300));
  const queued = (pending.json as Array<{ id: string }>).find((item) => item.id === id("draft"));
  assert.equal(queued, undefined);
});

test("an approved edit that does not change serviceType keeps the current behaviour", async () => {
  const priced = await api(ownerCookie, "PATCH", `/api/provider/services/${id("safe")}`, {
    price: "55.00",
  });
  assert.equal(priced.status, 200, JSON.stringify(priced.json));
  assert.equal(priced.json.approvalStatus, "approved");
  assert.equal(priced.json.editReview, undefined);
  assert.equal(priced.json.serviceType, "planning");
  let stored = await row("safe");
  assert.equal(stored.approval_status, "approved");
  assert.equal(stored.service_type, "planning");
  assert.equal(stored.edit_review_status, null);
  assert.ok((await publicServiceIds()).includes(id("safe")));

  const sameType = await api(ownerCookie, "PATCH", `/api/provider/services/${id("safe")}`, {
    serviceType: "planning",
  });
  assert.equal(sameType.status, 200, JSON.stringify(sameType.json));
  assert.equal(sameType.json.approvalStatus, "approved");
  assert.equal(sameType.json.editReview, undefined);
  stored = await row("safe");
  assert.equal(stored.approval_status, "approved");
  assert.equal(stored.service_type, "planning");
  assert.ok((await publicServiceIds()).includes(id("safe")));

  const renamed = await api(ownerCookie, "PATCH", `/api/provider/services/${id("safe")}`, {
    serviceName: `Renamed listing ${RUN}`,
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
  assert.equal(renamed.json.approvalStatus, "approved");
  assert.equal(renamed.json.serviceName, `Listing safe ${RUN}`);
  assert.equal(renamed.json.editReview?.status, "pending");
  assert.deepEqual(renamed.json.editReview?.stagedKeys, ["serviceName"]);
  stored = await row("safe");
  assert.equal(stored.approval_status, "approved");
  assert.equal(stored.service_name, `Listing safe ${RUN}`);
  assert.equal(stored.service_type, "planning");
  assert.equal(stored.edit_review_status, "pending");
  assert.equal(stored.pending_changes?.serviceName, `Renamed listing ${RUN}`);
  assert.ok((await publicServiceIds()).includes(id("safe")));
});
