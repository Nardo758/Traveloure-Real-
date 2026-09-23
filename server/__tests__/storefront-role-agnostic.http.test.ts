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
const ownerIds: Record<string, string> = {};

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

function api(path: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, init);
}

async function createOwner(label: string, role: "local_expert" | "service_provider", handle: string | null) {
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
  ownerIds[label] = body.user.id;
  return body.user.id;
}

async function createExpertForm(
  ownerId: string,
  label: string,
  status: "approved" | "pending" | "rejected",
  bio?: string,
) {
  await pool.query(
    `INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, bio)
     VALUES ($1, $2, 'Storefront', $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      ownerId,
      label,
      `storefront-role-${RUN}-${label}@traveloure.test`,
      status,
      bio ?? null,
    ],
  );
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
  const approvedLegacyId = await createOwner("approved-legacy", "local_expert", null);
  const pendingLegacyId = await createOwner("pending-legacy", "local_expert", null);
  const rejectedLegacyId = await createOwner("rejected-legacy", "local_expert", null);
  await createOwner("no-form-legacy", "local_expert", null);

  await createApprovedService(expertId, "expert");
  await createApprovedService(providerId, "provider");
  await createApprovedService(suspendedId, "suspended");
  await createExpertForm(
    approvedLegacyId,
    "approved-legacy",
    "approved",
    "Approved form biography used by the unified storefront.",
  );
  await createExpertForm(pendingLegacyId, "pending-legacy", "pending");
  await createExpertForm(rejectedLegacyId, "rejected-legacy", "rejected");
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
    readyMade: unknown[];
  };
  assert.equal(body.earner.role, "service_provider");
  assert.equal(body.services.length, 1);
  // T-8 (ledger `2026-09-15-orphans-t8-t9-server-tests-class`): this used to deep-equal
  // `body.templates` against `[]`. The `expert_templates` CONSUMER lane was RETIRED by ledger
  // `2026-09-03-expert-templates-consumer-sunset` — "response key included" — so the storefront
  // payload carries no `templates` key at all. §13 decides which of the two is correct: an EMPTY
  // ARRAY would claim "this earner has zero itinerary templates", a statement about a product that
  // no longer exists; an ABSENT key is the honest answer. Re-pinned to absence, and the proof is
  // STRONGER than the one it replaces — it now fails if the retired key is ever re-introduced.
  assert.equal(
    Object.prototype.hasOwnProperty.call(body, "templates"),
    false,
    "the retired expert_templates lane must leave NO response key (2026-09-03-expert-templates-consumer-sunset)",
  );
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

test("handle-bearing legacy expert routes redirect permanently to the canonical storefront", async () => {
  for (const path of [
    `/experts/${ownerIds.expert}`,
    `/local-experts/${ownerIds.expert}`,
  ]) {
    const response = await api(path, { redirect: "manual" });
    assert.equal(response.status, 308, `${path} must permanently redirect`);
    assert.equal(response.headers.get("location"), `/s/${handles.expert}`);
  }
});

test("approved no-handle experts keep the unified legacy profile and form bio", async () => {
  const response = await api(`/api/storefront/by-id/${ownerIds["approved-legacy"]}`);
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as {
    earner: Record<string, unknown> & { bio: string | null; handle: string | null };
    services: unknown[];
  };
  assert.equal(body.earner.handle, null);
  assert.equal(body.earner.bio, "Approved form biography used by the unified storefront.");
  assert.equal(body.services.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(body.earner, "id"), false);
});

test("pending, rejected, and missing-form no-handle experts remain private", async () => {
  for (const label of ["pending-legacy", "rejected-legacy", "no-form-legacy"]) {
    const response = await api(`/api/storefront/by-id/${ownerIds[label]}`);
    assert.equal(response.status, 404, `${label} must not have a public legacy profile`);
  }
});