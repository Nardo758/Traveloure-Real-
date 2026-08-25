/**
 * Storefront role unification — HTTP proof for the guarded public read path.
 *
 * Run against a disposable dev database only:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/storefront-role-agnostic.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const handles = {
  expert: `sru${RUN}expert`,
  provider: `sru${RUN}provider`,
  empty: `sru${RUN}empty`,
  suspended: `sru${RUN}suspended`,
};

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

function api(path: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, init);
}

async function createOwner(label: string, role: "local_expert" | "service_provider", handle: string) {
  const email = `storefront-role-${RUN}-${label}@traveloure.test`;
  const response = await api("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      firstName: "Storefront",
      lastName: label,
    }),
  });
  const responseText = await response.text();
  assert.equal(response.status, 201, responseText);
  const body = JSON.parse(responseText) as { user: { id: string } };
  createdEmails.push(email);
  await pool.query(`UPDATE users SET role = $1, handle = $2 WHERE id = $3`, [role, handle, body.user.id]);
  return body.user.id;
}

async function createApprovedService(ownerId: string, label: string) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, '120.00', 'active', 'approved', 'pdf')`,
    [id, ownerId, `${label} service`],
  );
  createdServiceIds.push(id);
}

before(async () => {
  const health = await api("/api/health").catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(
    process.env.JOURNEY_DB_WRITES_OK,
    "1",
    "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1",
  );

  const expertId = await createOwner("expert", "local_expert", handles.expert);
  const providerId = await createOwner("provider", "service_provider", handles.provider);
  await createOwner("empty", "service_provider", handles.empty);
  const suspendedId = await createOwner("suspended", "service_provider", handles.suspended);

  await createApprovedService(expertId, "expert");
  await createApprovedService(providerId, "provider");
  await createApprovedService(suspendedId, "suspended");
  await pool.query(
    `UPDATE users SET is_suspended = true, suspended_at = NOW() WHERE id = $1`,
    [suspendedId],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM provider_services WHERE id = ANY($1)`, [createdServiceIds]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [createdEmails]);
  } finally {
    await pool.end();
  }
});

test("canonical API serves approved expert inventory", async () => {
  const response = await api(`/api/storefront/${handles.expert}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as { earner: { role: string }; services: unknown[] };
  assert.equal(body.earner.role, "local_expert");
  assert.equal(body.services.length, 1);
});

test("canonical API serves provider services with empty expert-only lanes", async () => {
  const response = await api(`/api/storefront/${handles.provider}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as {
    earner: { role: string };
    services: unknown[];
    templates: unknown[];
    readyMade: unknown[];
  };
  assert.equal(body.earner.role, "service_provider");
  assert.equal(body.services.length, 1);
  assert.deepEqual(body.templates, []);
  assert.deepEqual(body.readyMade, []);
});

test("canonical API preserves no-inventory and suspended 404 gates", async () => {
  for (const handle of [handles.empty, handles.suspended]) {
    const response = await api(`/api/storefront/${handle}`);
    assert.equal(response.status, 404, `${handle} must not have a public storefront`);
  }
});

test("deprecated provider API returns the compatible filtered shape", async () => {
  const response = await api(`/api/provider-storefront/${handles.provider}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["away", "earner", "services"]);
});

test("provider and both legacy /p branches permanently redirect to /s", async () => {
  for (const path of [
    `/providers/${handles.provider}`,
    `/p/${handles.provider}`,
    `/p/${handles.expert}`,
  ]) {
    const response = await api(path, { redirect: "manual" });
    assert.equal(response.status, 301, `${path} must be permanent`);
    const handle = path.endsWith(handles.expert) ? handles.expert : handles.provider;
    assert.equal(response.headers.get("location"), `/s/${handle}`);
  }
});