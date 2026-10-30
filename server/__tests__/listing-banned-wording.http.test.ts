/**
 * Fix-queue row 102 — listing banned wording is a FLAG (Architect, Oct 23, 2026).
 *
 * The shared list is `blogBannedHits`. These routes return the hits and still accept the
 * listing. Nothing here is a 4xx, a rejection, or a status change.
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/listing-banned-wording.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { registerAndSignIn, SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    /* NULL inet_server_addr() (local socket) is itself a disposable-local signal. */
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[listing-banned-wording] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const CLEAN_NAME = `Quiet evening walk ${RUN}`;
const FLAGGED_NAME = `Secret insider walk ${RUN}`;
const FLAGGED_DESCRIPTION = "A hidden gem after dark";

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = `lbw-${RUN}-${label}@t.test`;
  const actor = await registerAndSignIn({
    baseUrl: BASE_URL,
    email,
    password: PASSWORD,
    firstName: "Wording",
    lastName: label,
    // Waitlist mode refuses a traveler sign-up. Supply intent is allowed and grants no role.
    extra: SUPPLY_PROVIDER_SIGNUP_EXTRA,
  });
  createdEmails.push(email);
  return { id: actor.id, email, cookie: actor.cookie };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function providerBody(extra: Record<string, unknown> = {}) {
  return {
    serviceName: CLEAN_NAME,
    description: "A quiet walk with no special claims",
    price: "120.00",
    priceType: "fixed",
    deliveryMethod: "in_person",
    meetingPoint: "Kyoto Station, Karasuma exit",
    status: "draft",
    location: "Kyoto",
    ...extra,
  };
}

async function approvalRow(id: string) {
  const r = await readPool.query(
    `SELECT service_name, description, approval_status, status FROM provider_services WHERE id = $1`,
    [id],
  );
  assert.equal(r.rowCount, 1, `provider_services row ${id} must exist`);
  return r.rows[0] as {
    service_name: string;
    description: string | null;
    approval_status: string;
    status: string;
  };
}

let provider: Actor;
let expert: Actor;
let admin: Actor;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);
  await assertDisposableDb();
  provider = await registerActor("provider");
  expert = await registerActor("expert");
  admin = await registerActor("admin");
  await readPool.query(`UPDATE users SET role = 'service_provider' WHERE id = $1`, [provider.id]);
  await readPool.query(`UPDATE users SET role = 'travel_expert' WHERE id = $1`, [expert.id]);
  await readPool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.id]);
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM service_attestations WHERE service_id = $1`, [id]).catch(() => {});
      await readPool.query(`DELETE FROM content_versions WHERE tracking_number IN (SELECT tracking_number FROM content_registry WHERE content_id = $1)`, [id]).catch(() => {});
      await readPool.query(`DELETE FROM content_registry WHERE content_id = $1`, [id]).catch(() => {});
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM service_provider_forms WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [email]).catch(() => {});
      await readPool.query(`DELETE FROM local_expert_forms WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [email]).catch(() => {});
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

test("source: listing routes call the shared scan and do not restate the phrase list", () => {
  const helper = readFileSync("server/services/listing-banned-wording.ts", "utf8");
  assert.match(helper, /blogBannedHits\(/);
  assert.doesNotMatch(helper, /hidden gem/);
  assert.match(readFileSync("server/routes.ts", "utf8"), /listingBannedWording\(/);
  assert.match(readFileSync("server/routes/admin.routes.ts", "utf8"), /listingBannedWording\(/);
});

test("LBW-1: a clean provider create returns bannedWording [] and still saves", async () => {
  const res = await api("/api/provider/services", provider.cookie, "POST", providerBody());
  assert.equal(res.status, 201, await res.clone().text());
  const body = (await res.json()) as { id: string; bannedWording: string[]; approvalStatus?: string };
  createdServiceIds.push(body.id);
  assert.deepEqual(body.bannedWording, []);
  const row = await approvalRow(body.id);
  assert.equal(row.approval_status, "submitted");
  assert.notEqual(row.approval_status, "rejected");
});

test("LBW-2: banned wording is flagged and the provider listing is still accepted", async () => {
  const res = await api(
    "/api/provider/services",
    provider.cookie,
    "POST",
    providerBody({ serviceName: FLAGGED_NAME, description: FLAGGED_DESCRIPTION }),
  );
  assert.equal(res.status, 201, await res.clone().text());
  const body = (await res.json()) as { id: string; bannedWording: string[]; serviceName: string };
  createdServiceIds.push(body.id);
  assert.deepEqual(body.bannedWording, ["hidden gem(s)", "secret", "insider"]);
  assert.equal(body.serviceName, FLAGGED_NAME);
  const row = await approvalRow(body.id);
  assert.equal(row.service_name, FLAGGED_NAME);
  assert.equal(row.approval_status, "submitted");
  assert.notEqual(row.approval_status, "rejected");
});

test("LBW-3: a provider edit returns the hits and does not refuse the save", async () => {
  const created = await api("/api/provider/services", provider.cookie, "POST", providerBody({ saveIntent: "draft" }));
  assert.equal(created.status, 201, await created.clone().text());
  const id = ((await created.json()) as { id: string }).id;
  createdServiceIds.push(id);

  const res = await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    description: "Meet at the back alley for the illuminations",
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { bannedWording: string[]; approvalStatus: string };
  assert.deepEqual(body.bannedWording, ["back alley", "illuminations"]);
  const row = await approvalRow(id);
  assert.equal(row.approval_status, "draft");
  assert.match(row.description ?? "", /back alley/);
});

test("LBW-4: submitting a flagged draft is still accepted", async () => {
  const created = await api(
    "/api/provider/services",
    provider.cookie,
    "POST",
    providerBody({ saveIntent: "draft", description: "A trending stop" }),
  );
  assert.equal(created.status, 201, await created.clone().text());
  const id = ((await created.json()) as { id: string }).id;
  createdServiceIds.push(id);

  const res = await api(`/api/provider/services/${id}/submit`, provider.cookie, "POST");
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { bannedWording: string[]; status: string };
  assert.deepEqual(body.bannedWording, ["trending"]);
  assert.equal(body.status, "submitted");
  const row = await approvalRow(id);
  assert.equal(row.approval_status, "submitted");
});

test("LBW-5: expert create, edit and submit flag the wording and stay accepted", async () => {
  const created = await api("/api/expert/service-listings", expert.cookie, "POST", {
    title: FLAGGED_NAME,
    description: FLAGGED_DESCRIPTION,
    price: "80.00",
  });
  assert.equal(created.status, 201, await created.clone().text());
  const createdBody = (await created.json()) as { id: string; bannedWording: string[]; status: string };
  createdServiceIds.push(createdBody.id);
  assert.deepEqual(createdBody.bannedWording, ["hidden gem(s)", "secret", "insider"]);
  assert.equal(createdBody.status, "draft");

  const edited = await api(`/api/expert/service-listings/${createdBody.id}`, expert.cookie, "PATCH", {
    description: "A vetted evening with no markup",
  });
  assert.equal(edited.status, 200, await edited.clone().text());
  const editedBody = (await edited.json()) as { bannedWording: string[]; status: string };
  assert.deepEqual(editedBody.bannedWording, ["vetted", "secret", "insider", "no markup"]);
  assert.equal(editedBody.status, "draft");

  const submitted = await api(`/api/expert/service-listings/${createdBody.id}/submit`, expert.cookie, "POST");
  assert.equal(submitted.status, 200, await submitted.clone().text());
  const submittedBody = (await submitted.json()) as { bannedWording: string[]; status: string };
  assert.deepEqual(submittedBody.bannedWording, ["vetted", "secret", "insider", "no markup"]);
  assert.equal(submittedBody.status, "submitted");
  const row = await approvalRow(createdBody.id);
  assert.equal(row.approval_status, "submitted");
});

test("LBW-6: the admin pending list computes hits on read and writes nothing", async () => {
  const created = await api(
    "/api/provider/services",
    provider.cookie,
    "POST",
    providerBody({ serviceName: `Geisha hour ${RUN}`, description: "Coming soon" }),
  );
  assert.equal(created.status, 201, await created.clone().text());
  const id = ((await created.json()) as { id: string }).id;
  createdServiceIds.push(id);
  const before = await approvalRow(id);

  const res = await api("/api/admin/provider-services/pending", admin.cookie, "GET");
  assert.equal(res.status, 200, await res.clone().text());
  const list = (await res.json()) as Array<{ id: string; bannedWording: string[] }>;
  const item = list.find((row) => row.id === id);
  assert.ok(item, "the submitted listing is on the pending list");
  assert.deepEqual(item.bannedWording, ["geisha", "coming soon"]);

  const after = await approvalRow(id);
  assert.equal(after.service_name, before.service_name);
  assert.equal(after.description, before.description);
  assert.equal(after.approval_status, before.approval_status);
  assert.equal(after.status, before.status);
});

test("LBW-7: an approved listing's staged name is flagged on the pending list and stays live", async () => {
  const created = await api("/api/provider/services", provider.cookie, "POST", providerBody());
  assert.equal(created.status, 201, await created.clone().text());
  const id = ((await created.json()) as { id: string }).id;
  createdServiceIds.push(id);

  const approved = await api(`/api/admin/provider-services/${id}/approve`, admin.cookie, "POST", {});
  assert.equal(approved.status, 200, await approved.clone().text());

  const edited = await api(`/api/provider/services/${id}`, provider.cookie, "PATCH", {
    serviceName: `Licensed secret tour ${RUN}`,
  });
  assert.equal(edited.status, 200, await edited.clone().text());
  const editedBody = (await edited.json()) as { bannedWording: string[]; serviceName: string; editReview?: { status: string } };
  assert.deepEqual(editedBody.bannedWording, ["licensed", "secret"]);
  assert.equal(editedBody.editReview?.status, "pending");
  assert.equal(editedBody.serviceName, CLEAN_NAME);

  const res = await api("/api/admin/provider-services/pending", admin.cookie, "GET");
  assert.equal(res.status, 200, await res.clone().text());
  const list = (await res.json()) as Array<{ id: string; bannedWording: string[]; editReview?: boolean }>;
  const item = list.find((row) => row.id === id && row.editReview);
  assert.ok(item, "the staged edit is on the pending list");
  assert.deepEqual(item.bannedWording, ["licensed", "secret"]);

  const row = await approvalRow(id);
  assert.equal(row.service_name, CLEAN_NAME);
  assert.equal(row.approval_status, "approved");
});
