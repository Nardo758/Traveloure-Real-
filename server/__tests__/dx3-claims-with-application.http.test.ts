/**
 * DX-3: the expert application carries its picked neighborhoods, and the server creates
 * draft claims in the same request. No migration; no client follow-up calls.
 *
 * Run against a local/CI server and a disposable database:
 *   JOURNEY_DB_WRITES_OK=1 JOURNEY_BASE_URL=http://127.0.0.1:5001 \
 *     npx tsx --test --test-force-exit server/__tests__/dx3-claims-with-application.http.test.ts
 *
 * Every user, form, claim and transition this file writes it deletes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { registerAndSignIn, type SignedInActor } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

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
      `[dx3] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a local/CI database.`,
    );
  }
}

let serverUp = false;
const emails: string[] = [];

function email(label: string): string {
  const e = `dx3-${RUN}-${label}@t.test`;
  emails.push(e);
  return e;
}

async function applicant(label: string): Promise<SignedInActor> {
  const actor = await registerAndSignIn({
    baseUrl: BASE_URL,
    email: email(label),
    password: PASSWORD,
    firstName: "DX3",
    lastName: label,
  });  return actor;
}

function api(path: string, cookie: string, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function applicationBody(actor: SignedInActor, city: string, extra: Record<string, unknown> = {}) {
  return {
    expertType: "local_expert",
    firstName: "DX3",
    lastName: "Applicant",
    email: actor.email,
    country: "Japan",
    city,
    neighborhoods: [],
    localityProof: "born_raised",
    knowledgeProofAnswers: [],
    ...extra,
  };
}

async function postApplication(actor: SignedInActor, body: unknown) {
  const res = await api("/api/expert-application", actor.cookie, "POST", body);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function claimsFor(userId: string) {
  const r = await db.execute(sql`
    SELECT id, neighborhood_id, status, draft_capture, consent_at, submitted_at, created_at
    FROM expert_neighborhood_claims
    WHERE expert_id = ${userId}
    ORDER BY created_at
  `);
  return r.rows as Array<{
    id: string;
    neighborhood_id: string;
    status: string;
    draft_capture: unknown;
    consent_at: string | null;
    submitted_at: string | null;
  }>;
}

async function formFor(userId: string) {
  const r = await db.execute(sql`
    SELECT id, status, no_neighborhoods_available_at
    FROM local_expert_forms
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return (r.rows[0] ?? null) as { id: string; status: string; no_neighborhoods_available_at: string | null } | null;
}

let kyotoIds: string[] = [];
let otherCityId = "";

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  serverUp = !!(health && health.ok);
  if (!serverUp) return;
  await assertDisposableDb();

  const kyoto = await db.execute(sql`
    SELECT id FROM city_neighborhoods WHERE lower(city) = lower('Kyoto') ORDER BY name LIMIT 5
  `);
  kyotoIds = (kyoto.rows as Array<{ id: string }>).map((r) => r.id);
  assert.ok(kyotoIds.length >= 3, `[dx3] needs three Kyoto neighborhoods, found ${kyotoIds.length}`);

  const other = await db.execute(sql`
    SELECT id FROM city_neighborhoods WHERE lower(city) <> lower('Kyoto') ORDER BY name LIMIT 1
  `);
  otherCityId = (other.rows[0] as { id: string } | undefined)?.id ?? "";
});

after(async () => {
  if (serverUp) {
    for (const e of emails) {
      const ids = await db.execute(sql`
        SELECT id FROM expert_neighborhood_claims WHERE expert_id IN (SELECT id FROM users WHERE email = ${e})
      `);
      for (const row of ids.rows as Array<{ id: string }>) {
        await db.execute(sql`DELETE FROM neighborhood_claim_transitions WHERE claim_id = ${row.id}`);
      }
      await db.execute(sql`DELETE FROM expert_neighborhood_claims WHERE expert_id IN (SELECT id FROM users WHERE email = ${e})`);
      await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id IN (SELECT id FROM users WHERE email = ${e})`);
      await db.execute(sql`DELETE FROM users WHERE email = ${e}`);
    }
  }
  await pool.end().catch(() => {});
});

const ok = (t: { skip: (why: string) => void }) => {
  if (!serverUp) t.skip("server not running");
  return serverUp;
};

test("create: two neighborhoods ride the application as draft claims", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("create");
  const body = applicationBody(actor, "Kyoto", {
    neighborhoodClaims: kyotoIds.slice(0, 2).map((neighborhoodId) => ({ neighborhoodId })),
    neighborhoodCapture: { p1: [{ name: "First stop" }], p2: null, p3: null, p4: [] },
  });
  const { res, json } = await postApplication(actor, body);
  const claims = await claimsFor(actor.id);
  assert.equal(res.status, 201);
  assert.deepEqual(json.neighborhoodClaims, { saved: 2, failed: 0 });
  assert.equal(claims.length, 2);
  assert.ok(claims.every((c) => c.status === "draft"));
  assert.deepEqual(claims.map((c) => c.status), ["draft", "draft"]);
  assert.notEqual(claims[0].draft_capture, null);
  assert.equal(claims[0].consent_at, null);
  assert.equal(claims[0].submitted_at, null);
  console.log(
    `[dx3-create]     status=${res.status} saved=${json.neighborhoodClaims.saved} failed=${json.neighborhoodClaims.failed} rows=${claims.length} statuses=${claims.map((c) => c.status).join(",")} capture_on_first=${claims[0].draft_capture !== null} consent_at=${claims[0].consent_at === null ? "null" : "set"} submitted_at=${claims[0].submitted_at === null ? "null" : "set"}`,
  );
});

test("scorer: no claim was submitted or scored", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("scorer");
  await postApplication(actor, applicationBody(actor, "Kyoto", {
    neighborhoodClaims: [{ neighborhoodId: kyotoIds[0] }],
  }));
  const scorerTransitions = await db.execute(sql`
    SELECT count(*)::int AS n FROM neighborhood_claim_transitions
    WHERE claim_id IN (SELECT id FROM expert_neighborhood_claims WHERE expert_id = ${actor.id})
      AND actor_type = 'scorer'
  `);
  const submitted = await db.execute(sql`
    SELECT count(*)::int AS n FROM expert_neighborhood_claims
    WHERE expert_id = ${actor.id} AND (submitted_at IS NOT NULL OR consent_at IS NOT NULL)
  `);
  const calls = Number((scorerTransitions.rows[0] as { n: number }).n);
  assert.equal(calls, 0);
  assert.equal(Number((submitted.rows[0] as { n: number }).n), 0);
  console.log(`[dx3-scorer]     scorer_calls=${calls}`);
});

test("gate: an applicant still gets 403 on the claims route", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("gate");
  await postApplication(actor, applicationBody(actor, "Kyoto"));
  const res = await api("/api/expert/neighborhood-claims", actor.cookie, "POST", { neighborhoodId: kyotoIds[0] });
  assert.equal(res.status, 403);
  console.log(`[dx3-gate]       applicant POST /api/expert/neighborhood-claims status=${res.status}`);
});

test("other city: refused and counted as failed", async (t) => {
  if (!ok(t)) return;
  assert.ok(otherCityId, "[dx3] needs a neighborhood outside Kyoto");
  const actor = await applicant("othercity");
  const { res, json } = await postApplication(actor, applicationBody(actor, "Kyoto", {
    neighborhoodClaims: [{ neighborhoodId: otherCityId }],
  }));
  const claims = await claimsFor(actor.id);
  assert.equal(res.status, 201);
  assert.deepEqual(json.neighborhoodClaims, { saved: 0, failed: 1 });
  assert.equal(claims.length, 0);
  console.log(`[dx3-othercity]  status=${res.status} saved=${json.neighborhoodClaims.saved} failed=${json.neighborhoodClaims.failed} rows=${claims.length}`);
});

test("unknown neighborhood: refused and counted as failed", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("unknown");
  const { res, json } = await postApplication(actor, applicationBody(actor, "Kyoto", {
    neighborhoodClaims: [{ neighborhoodId: crypto.randomUUID() }],
  }));
  const claims = await claimsFor(actor.id);
  assert.equal(res.status, 201);
  assert.deepEqual(json.neighborhoodClaims, { saved: 0, failed: 1 });
  assert.equal(claims.length, 0);
  console.log(`[dx3-unknown]    status=${res.status} saved=${json.neighborhoodClaims.saved} failed=${json.neighborhoodClaims.failed} rows=${claims.length}`);
});

test("duplicates: one row per neighborhood", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("dupes");
  const body = applicationBody(actor, "Kyoto", {
    neighborhoodClaims: [kyotoIds[0], kyotoIds[1], kyotoIds[0]].map((neighborhoodId) => ({ neighborhoodId })),
  });
  const { res, json } = await postApplication(actor, body);
  const claims = await claimsFor(actor.id);
  assert.equal(res.status, 201);
  assert.deepEqual(json.neighborhoodClaims, { saved: 2, failed: 0 });
  assert.equal(new Set(claims.map((c) => c.neighborhood_id)).size, 2);
  console.log(`[dx3-dupes]      sent=3 distinct=2 saved=${json.neighborhoodClaims.saved} rows=${claims.length}`);
});

test("cap: the first three in order, the rest counted as failed", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("cap");
  const five = [kyotoIds[0], kyotoIds[1], kyotoIds[2], crypto.randomUUID(), crypto.randomUUID()];
  const body = applicationBody(actor, "Kyoto", {
    neighborhoodClaims: five.map((neighborhoodId) => ({ neighborhoodId })),
  });
  const { res, json } = await postApplication(actor, body);
  const claims = await claimsFor(actor.id);
  assert.equal(res.status, 201);
  assert.deepEqual(json.neighborhoodClaims, { saved: 3, failed: 2 });
  assert.equal(claims.length, 3);
  console.log(`[dx3-cap]        sent=5 saved=${json.neighborhoodClaims.saved} failed=${json.neighborhoodClaims.failed} rows=${claims.length} status=${res.status}`);
});

test("no claims: zero and zero", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("noclaims");
  const { res, json } = await postApplication(actor, applicationBody(actor, "Kyoto"));
  const claims = await claimsFor(actor.id);
  assert.equal(res.status, 201);
  assert.deepEqual(json.neighborhoodClaims, { saved: 0, failed: 0 });
  assert.equal(claims.length, 0);
  console.log(`[dx3-noclaims]   status=${res.status} neighborhoodClaims={saved:${json.neighborhoodClaims.saved},failed:${json.neighborhoodClaims.failed}} rows=${claims.length}`);
});

test("stamp: claims exist before the no-neighborhoods stamp", async (t) => {
  if (!ok(t)) return;
  const emptyActor = await applicant("stampempty");
  const empty = await postApplication(emptyActor, applicationBody(emptyActor, `NoSuchCity-${RUN}`));
  const emptyForm = await formFor(emptyActor.id);
  assert.equal(empty.res.status, 201);
  assert.notEqual(emptyForm?.no_neighborhoods_available_at, null);

  const claimActor = await applicant("stampclaim");
  const withClaim = await postApplication(claimActor, applicationBody(claimActor, "Kyoto", {
    neighborhoodClaims: [{ neighborhoodId: kyotoIds[0] }],
  }));
  const claimForm = await formFor(claimActor.id);
  assert.equal(withClaim.res.status, 201);
  assert.equal(claimForm?.no_neighborhoods_available_at, null);
  console.log(
    `[dx3-stamp]      city_with_no_rows: stamped=${emptyForm?.no_neighborhoods_available_at !== null}   city_with_claim: stamped=${claimForm?.no_neighborhoods_available_at !== null}`,
  );
});

test("resubmit: rejected application reuses its draft claims", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("resubmit");
  const body = applicationBody(actor, "Kyoto", {
    neighborhoodClaims: kyotoIds.slice(0, 2).map((neighborhoodId) => ({ neighborhoodId })),
  });
  const first = await postApplication(actor, body);
  assert.equal(first.res.status, 201);
  await db.execute(sql`UPDATE local_expert_forms SET status = 'rejected' WHERE user_id = ${actor.id}`);
  const second = await postApplication(actor, body);
  const claims = await claimsFor(actor.id);
  assert.equal(second.res.status, 200);
  assert.equal(claims.length, 2);
  assert.equal(new Set(claims.map((c) => c.neighborhood_id)).size, 2);
  console.log(`[dx3-resubmit]   status=${second.res.status} rows=${claims.length}`);
});

test("malformed claims are a 400 before any form row", async (t) => {
  if (!ok(t)) return;
  const actor = await applicant("malformed");
  const res = await api("/api/expert-application", actor.cookie, "POST", applicationBody(actor, "Kyoto", {
    neighborhoodClaims: "nope",
  }));
  const form = await formFor(actor.id);
  const claims = await claimsFor(actor.id);
  assert.equal(res.status, 400);
  assert.equal(form, null);
  assert.equal(claims.length, 0);
  console.log(`[dx3-malformed]  status=${res.status} form_rows=${form ? 1 : 0}`);
});
