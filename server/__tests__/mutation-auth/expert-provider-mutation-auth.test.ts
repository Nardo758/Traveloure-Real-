/**
 * Authenticated wrong-role audit for the expert, provider, and local-expert
 * payment/user-data write surface.  The live portion is intentionally opt-in:
 *
 *   MUTATION_AUTH_AUDIT_OK=1 npx tsx --test \
 *     server/__tests__/mutation-auth/expert-provider-mutation-auth.test.ts
 *
 * It uses one disposable ordinary user.  Probed routes are the routes covered
 * by the role backstop assembled in registerRoutes; therefore a 403 is proof
 * that the request stopped before a handler can validate `{}` or mutate data.
 *
 * A SECOND probe set, `RESOURCE_PROBES`, covers the handler-owned rails that
 * sit under the role-console prefixes but OUTSIDE every assembled backstop.
 * Those are probed against a disposable owner + booking + quote fixture as
 * anonymous, as the resource's own traveler (a non-owner), and as the owner —
 * never excluded (ledger `2026-09-16-ci-red-repairs-3`).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import { endpointKey } from "../../../scripts/mutation-auth/endpoint-key";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/models/auth";

type Method = "POST" | "PUT" | "PATCH" | "DELETE";
type Risk = "payments" | "user-data" | "admin" | "other";
type ManifestMutation = {
  method: Method;
  effectivePath: string;
  source: string;
  line: number;
  risk: Risk;
};
type MutationManifest = { mutations: ManifestMutation[] };

const LIVE_AUDIT = process.env.MUTATION_AUTH_AUDIT_OK === "1";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const manifest = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"),
  "utf8",
)) as MutationManifest;
const scrypt = promisify(crypto.scrypt);

// ONE spelling of the endpoint key (scripts/mutation-auth/endpoint-key.ts, §18 rule 1).
const keyOf = endpointKey;
const underRoleConsole = (pathname: string) =>
  /^\/api\/(?:expert|provider|local-expert)(?:\/|$)/.test(pathname);
const concretePath = (template: string) => template.replace(
  /:([A-Za-z0-9_]+)/g,
  (_all, name: string) => encodeURIComponent(`${name}-mutation-auth-probe`),
);

type AuditSafetyConfig = {
  nodeEnv?: string;
  baseUrl: string;
  databaseUrl?: string;
  productionDatabaseUrl?: string;
};

/**
 * Returns the first reason a live audit must be refused.  This pure predicate
 * is called before importing the DB module or creating the fixture.
 */
function liveAuditRefusalReason(config: AuditSafetyConfig): string | undefined {
  if (config.nodeEnv === "production") {
    return "NODE_ENV=production";
  }

  let hostname: string;
  try {
    hostname = new URL(config.baseUrl).hostname.toLowerCase();
  } catch {
    return `BASE_URL is invalid: ${config.baseUrl}`;
  }
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    return `BASE_URL is not loopback: ${config.baseUrl}`;
  }

  if (
    config.databaseUrl &&
    config.productionDatabaseUrl &&
    config.databaseUrl === config.productionDatabaseUrl
  ) {
    return "DATABASE_URL equals PROD_DATABASE_URL";
  }
  return undefined;
}

/*
 * The role backstop's prefix set is READ OUT OF THE PRODUCTION ASSEMBLY, never
 * restated here.  It used to be a hand copy of routes.ts's three arrays, and it
 * DRIFTED: production grew `/api/expert/neighborhood-claims` (ruling 27) while
 * the copy still carried `/api/expert/templates`, whose lane was retired by
 * ledger `2026-09-03-expert-templates-consumer-sunset`.  A second statement of
 * one decision is the derivation-drift class CLAUDE.md §18 rule 1 names, and a
 * drifted copy here silently DROPS routes from the audit — the worst failure a
 * security audit can have, because it reads green.
 *
 * STATED NEGATIVE SPACE: this reads the three array literals by NAME out of the
 * source text.  It proves the prefixes are the ones production assembles; it
 * does NOT prove the middleware still consults all three, and it cannot see a
 * prefix added under a fourth name.  If any array is renamed or removed the
 * parse throws, so the failure is loud rather than a silently shrunk audit.
 */
const ROLE_BACKSTOP_PREFIX_ARRAYS = [
  "EARNER_SELF_SERVICE_PREFIXES",
  "EXPERT_SELF_SERVICE_PREFIXES",
  "PROVIDER_SELF_SERVICE_PREFIXES",
] as const;

function readRoleBackstopPrefixes(): string[] {
  const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
  const prefixes: string[] = [];
  for (const name of ROLE_BACKSTOP_PREFIX_ARRAYS) {
    const declaration = new RegExp(`const\\s+${name}\\s*(?::[^=]+)?=\\s*\\[([^\\]]*)\\]`);
    const match = source.match(declaration);
    if (!match) {
      throw new Error(
        `server/routes.ts no longer declares ${name}; the role backstop audit cannot read its prefixes`,
      );
    }
    const entries = Array.from(match[1].matchAll(/["'`]([^"'`]+)["'`]/g)).map((m) => m[1]);
    if (entries.length === 0) {
      throw new Error(`server/routes.ts declares ${name} with no prefixes`);
    }
    prefixes.push(...entries);
  }
  return prefixes;
}

const ROLE_BACKSTOP_PREFIXES: readonly string[] = readRoleBackstopPrefixes();
const hasRoleBackstop = (pathname: string) =>
  ROLE_BACKSTOP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/*
 * Do not turn validation, a random nested id, or handler-level ownership into
 * false authorization evidence.  Each excluded route is deliberately named:
 * it is outside the production prefix backstop above and needs a purpose-built
 * resource fixture (or is an ordinary-user application action), not a 400/404
 * acceptance rule in this audit.
 */
const EXCLUSIONS: Readonly<Record<string, string>> = {
  "POST /api/expert/:expertId/tip": "Intentional customer payment action: routes.ts explicitly excludes expert tips so ordinary users may tip an expert.",
  "POST /api/expert/ai-tasks/:taskId/approve": "Handler-owned AI-task workflow; no assembled expert-prefix role backstop covers /api/expert/ai-tasks.",
  "POST /api/expert/ai-tasks/:taskId/regenerate": "Handler-owned AI-task workflow; no assembled expert-prefix role backstop covers /api/expert/ai-tasks.",
  "POST /api/expert/ai-tasks/:taskId/reject": "Handler-owned AI-task workflow; no assembled expert-prefix role backstop covers /api/expert/ai-tasks.",
  "POST /api/expert/ai-tasks/delegate": "Handler-owned AI-task workflow; no assembled expert-prefix role backstop covers /api/expert/ai-tasks.",
  "POST /api/expert/assignments/:assignmentId/accept": "Assignment application workflow uses handler/resource authorization, not the assembled expert-prefix role backstop.",
  "PATCH /api/expert/assignments/:assignmentId/workspace-status": "Assignment workspace state is resource-authorized in its handler; a concrete assigned-resource fixture is required.",
  "POST /api/expert/bookings/:id/complete": "Booking completion is owner-authorized in its shared handler; no expert-prefix role backstop covers bookings.",
  "PATCH /api/expert/bookings/:id/status": "Booking status is owner-authorized in its shared handler; no expert-prefix role backstop covers bookings.",
  "POST /api/expert/reviews/:id/respond": "Review response is handler-owned by the reviewed service/expert; a real review fixture is required.",
  "PATCH /api/expert/role": "Intentional role-application/self-service flow: ordinary users may request an expert role, and EVERY expert track switch requires admin review (ledger 2026-09-04-earn-role-safety).",
  "POST /api/expert/trips/:tripId/vendors": "Trip vendor write is trip-resource-authorized; a real non-owned trip fixture is required.",
  "DELETE /api/expert/vendors/:vendorId": "Trip vendor deletion is trip-resource-authorized; a real non-owned trip fixture is required.",
  "PUT /api/expert/vendors/:vendorId": "Trip vendor update is trip-resource-authorized; a real non-owned trip fixture is required.",
  "POST /api/provider/availability": "Provider availability is handler/resource-authorized outside the assembled provider-prefix role backstop.",
  "DELETE /api/provider/availability/:id": "Provider availability is handler/resource-authorized outside the assembled provider-prefix role backstop.",
  "PATCH /api/provider/availability/:id": "Provider availability is handler/resource-authorized outside the assembled provider-prefix role backstop.",
  "POST /api/provider/blackout-dates": "Provider blackout-date workflow is handler/resource-authorized; a provider resource fixture is required.",
  "DELETE /api/provider/blackout-dates/:id": "Provider blackout-date workflow is handler/resource-authorized; a provider resource fixture is required.",
  "PUT /api/provider/booking-requests/:requestId/respond": "Provider booking-request response is resource-authorized; a real request fixture is required.",
  "POST /api/provider/bookings/:id/complete": "Booking completion is owner-authorized in its shared handler; no provider-prefix role backstop covers bookings.",
  "PATCH /api/provider/bookings/:id/status": "Booking status is owner-authorized in its shared handler; no provider-prefix role backstop covers bookings.",
  "POST /api/provider/bundles": "Provider bundle authoring is handler-owned; no assembled provider-prefix role backstop covers bundles.",
  "DELETE /api/provider/bundles/:id": "Provider bundle authoring is handler/resource-authorized; a real provider fixture is required.",
  "PATCH /api/provider/bundles/:id": "Provider bundle authoring is handler/resource-authorized; a real provider fixture is required.",
  "POST /api/provider/properties": "Provider property authoring is handler-owned; no assembled provider-prefix role backstop covers properties.",
  "DELETE /api/provider/properties/:id": "Provider property authoring is handler/resource-authorized; a real provider fixture is required.",
  "PATCH /api/provider/properties/:id": "Provider property authoring is handler/resource-authorized; a real provider fixture is required.",
  "POST /api/provider/properties/:id/rooms": "Provider room authoring is handler/resource-authorized; a real provider property fixture is required.",
  "DELETE /api/provider/rooms/:id": "Provider room authoring is handler/resource-authorized; a real provider room fixture is required.",
  "PATCH /api/provider/rooms/:id": "Provider room authoring is handler/resource-authorized; a real provider room fixture is required.",
  "PATCH /api/provider/settings": "Provider settings are handler/session-resource authorized outside the assembled provider-prefix role backstop.",
};

/*
 * Handler-owned rails PROBED WITH A REAL RESOURCE FIXTURE, never excluded.
 * These sit under the role-console prefixes but outside every assembled prefix
 * backstop: `/api/expert|provider/bookings/:id/component-failed` and
 * `/api/provider/quotes/:quoteId/*` carry `isAuthenticated` plus an OWNERSHIP
 * check inside the handler, so the prefix probe above cannot see them, and an
 * exclusion would be an allowlist on a mutation rail (CLAUDE.md §14/§19
 * posture).  The live audit below probes each one three ways: anonymous ⇒ 401
 * before the handler; the resource's own TRAVELER (a party who is not its
 * owner) ⇒ the handler's ownership refusal, with the row proven unchanged; the
 * OWNER ⇒ past the ownership gate.  The ownership refusal is a 404, not a 403 —
 * "no such thing" and "not yours" are the same sentence so the rail cannot be
 * used to probe which rows exist (Locked Decision 40's posture).  The value is
 * the fixture the probe needs; adding a key here without a probe below fails
 * the live audit's own tally.  Ledger `2026-09-16-ci-red-repairs-3`.
 */
const RESOURCE_PROBES: Readonly<Record<string, "booking" | "quote" | "readyMade">> = {
  "POST /api/expert/bookings/:id/component-failed": "booking",
  "POST /api/provider/bookings/:id/component-failed": "booking",
  "POST /api/provider/quotes/:quoteId/issue": "quote",
  "POST /api/provider/quotes/:quoteId/withdraw": "quote",
  "POST /api/expert/ready-made": "readyMade",
  "PATCH /api/expert/ready-made/:id": "readyMade",
  "POST /api/expert/ready-made/:id/build-review": "readyMade",
  "POST /api/expert/ready-made/:id/submit": "readyMade",
  "POST /api/expert/ready-made/:id/withdraw": "readyMade",
  "DELETE /api/expert/ready-made/build/:id": "readyMade",
  "PATCH /api/expert/ready-made/build/:tripId": "readyMade",
  "POST /api/expert/ready-made/from-trip/:tripId": "readyMade",
};

const HIGH_RISK = (() => {
  const seen = new Set<string>();
  return manifest.mutations.filter((mutation) => {
    const key = keyOf(mutation);
    if (seen.has(key)) return false;
    seen.add(key);
    return underRoleConsole(mutation.effectivePath) &&
      (mutation.risk === "payments" || mutation.risk === "user-data");
  });
})();
const PROBES = HIGH_RISK.filter((mutation) => hasRoleBackstop(mutation.effectivePath));

let fixtureUserId: string | undefined;
let sessionCookie = "";
let auditDb: typeof import("../../db").db | undefined;
// The RESOURCE_PROBES fixture: a disposable OWNER (stored role `service_provider`), one listing
// they own, one booking on it where the ordinary user is the TRAVELER, and one `requested` quote
// on it from that same traveler.  Created and deleted with the ordinary user.
let ownerUserId: string | undefined;
let ownerCookie = "";
let fixtureServiceId: string | undefined;
let fixtureBookingId: string | undefined;
let fixtureQuoteId: string | undefined;
let readyMadeAuthorId: string | undefined;
let readyMadeAuthorCookie = "";

function emitEvidence(evidence: Record<string, unknown>): void {
  console.log(JSON.stringify({ audit: "expert-provider-wrong-role", ...evidence }));
}
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
async function diagnosticBody(response: Response): Promise<string> {
  const body = await response.text();
  return body.length <= 500 ? body : `${body.slice(0, 500)}…`;
}
async function createLoginFixture(input: { id: string; role: string; firstName: string }): Promise<string> {
  const password = `MutationAuth-${crypto.randomBytes(12).toString("hex")}!`;
  const email = `mutation-auth-${crypto.randomUUID()}@example.invalid`;
  await auditDb!.insert(users).values({
    id: input.id, email, password: await hashPassword(password),
    firstName: input.firstName, lastName: "Authorization Audit", role: input.role, authProvider: "email",
  });
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }), redirect: "manual",
  });
  assert.equal(login.status, 200, `${input.role} fixture login failed: status=${login.status} response=${await diagnosticBody(login)}`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(cookie, `${input.role} fixture login did not return a session cookie`);
  return cookie;
}
async function fixtureRowStatus(table: "service_bookings" | "service_quotes", id: string): Promise<string | undefined> {
  const result = table === "service_bookings"
    ? await auditDb!.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`)
    : await auditDb!.execute(sql`SELECT status FROM service_quotes WHERE id = ${id}`);
  return (result.rows[0] as { status?: string } | undefined)?.status;
}
async function readyMadeTripRow(id: string): Promise<{ title?: string } | undefined> {
  const result = await auditDb!.execute(sql`SELECT title FROM trips WHERE id = ${id}`);
  return result.rows[0] as { title?: string } | undefined;
}
async function readyMadeListingRow(id: string): Promise<{
  title?: string;
  status?: string;
  build_review?: unknown;
} | undefined> {
  const result = await auditDb!.execute(sql`
    SELECT title, status, build_review
    FROM ready_made_trips
    WHERE id = ${id}
  `);
  return result.rows[0] as { title?: string; status?: string; build_review?: unknown } | undefined;
}
async function readyMadeListingCountForTrip(tripId: string): Promise<number> {
  const result = await auditDb!.execute(sql`
    SELECT count(*)::int AS count
    FROM ready_made_trips
    WHERE source_trip_id = ${tripId}
  `);
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}
async function readyMadeAuthorTripCount(authorId: string): Promise<number> {
  const result = await auditDb!.execute(sql`
    SELECT count(*)::int AS count
    FROM trips
    WHERE author_id = ${authorId}
  `);
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

before(async () => {
  if (!LIVE_AUDIT) return;
  const refusal = liveAuditRefusalReason({
    nodeEnv: process.env.NODE_ENV,
    baseUrl: BASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    productionDatabaseUrl: process.env.PROD_DATABASE_URL,
  });
  if (refusal) {
    throw new Error(`Refusing mutation authorization audit: ${refusal}`);
  }
  auditDb = (await import("../../db")).db;
  fixtureUserId = crypto.randomUUID();
  sessionCookie = await createLoginFixture({ id: fixtureUserId, role: "user", firstName: "Mutation" });

  // The RESOURCE_PROBES fixture.  Raw rows on the same tables the handlers read (the
  // `service-quotes` and `acceptance-rails` DB suites' shapes); nothing is charged, no Stripe
  // id is planted (§19a), and the ordinary user above is the traveler on both rows.
  ownerUserId = crypto.randomUUID();
  ownerCookie = await createLoginFixture({ id: ownerUserId, role: "service_provider", firstName: "Owner" });
  fixtureServiceId = `mutation-auth-svc-${crypto.randomUUID()}`;
  fixtureBookingId = `mutation-auth-booking-${crypto.randomUUID()}`;
  fixtureQuoteId = `mutation-auth-quote-${crypto.randomUUID()}`;
  await auditDb.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, price_type, booking_mode,
                                   delivery_method, status, approval_status)
    VALUES (${fixtureServiceId}, ${ownerUserId}, 'Mutation authorization audit listing', 'fixture', NULL,
            'custom_quote', 'request', 'in_person', 'active', 'approved')
  `);
  await auditDb.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
                                  total_amount, platform_fee, provider_earnings, confirmed_at)
    VALUES (${fixtureBookingId}, ${fixtureServiceId}, ${fixtureUserId}, ${ownerUserId}, 'confirmed',
            '100.00', '25.00', '75.00', NOW())
  `);
  await auditDb.execute(sql`
    INSERT INTO service_quotes (id, service_id, traveler_id, position, status)
    VALUES (${fixtureQuoteId}, ${fixtureServiceId}, ${fixtureUserId}, 1, 'requested')
  `);

  readyMadeAuthorId = crypto.randomUUID();
  readyMadeAuthorCookie = await createLoginFixture({
    id: readyMadeAuthorId,
    role: "local_expert",
    firstName: "Ready Made Author",
  });
});

after(async () => {
  if (!auditDb) return;
  const db = auditDb;
  const cleanup: Array<() => Promise<unknown>> = [
    () => db.execute(sql`DELETE FROM ready_made_trips WHERE author_id = ${readyMadeAuthorId ?? ""}`),
    () => db.execute(sql`DELETE FROM trips WHERE author_id = ${readyMadeAuthorId ?? ""}`),
    // Child rows first: the quote and the booking reference the listing and both users.
    () => db.execute(sql`DELETE FROM service_quotes WHERE id = ${fixtureQuoteId ?? ""}`),
    () => db.execute(sql`DELETE FROM content_registry WHERE content_id IN (${fixtureBookingId ?? ""}, ${fixtureServiceId ?? ""})`),
    () => db.execute(sql`DELETE FROM service_bookings WHERE id = ${fixtureBookingId ?? ""}`),
    () => db.execute(sql`DELETE FROM provider_services WHERE id = ${fixtureServiceId ?? ""}`),
    () => db.execute(sql`
      DELETE FROM sessions
      WHERE sess->'passport'->'user'->'claims'->>'sub' IN (${fixtureUserId ?? ""}, ${ownerUserId ?? ""}, ${readyMadeAuthorId ?? ""})
         OR sess->'passport'->'user'->>'id' IN (${fixtureUserId ?? ""}, ${ownerUserId ?? ""}, ${readyMadeAuthorId ?? ""})
    `),
    () => readyMadeAuthorId ? db.delete(users).where(eq(users.id, readyMadeAuthorId)) : Promise.resolve(),
    () => ownerUserId ? db.delete(users).where(eq(users.id, ownerUserId)) : Promise.resolve(),
    () => fixtureUserId ? db.delete(users).where(eq(users.id, fixtureUserId)) : Promise.resolve(),
  ];
  let firstError: unknown;
  for (const step of cleanup) {
    try { await step(); } catch (error) { firstError ??= error; }
  }
  if (firstError) throw firstError;
});

test("every high-risk expert/provider/local-expert manifest route is probed or explicitly excluded", () => {
  assert.ok(HIGH_RISK.length > 0, "high-risk role-console inventory must not be empty");
  const highRiskKeys = new Set(HIGH_RISK.map(keyOf));
  const probeKeys = new Set(PROBES.map(keyOf));
  const resourceProbeKeys = new Set(Object.keys(RESOURCE_PROBES));
  const exclusionKeys = new Set(Object.keys(EXCLUSIONS));
  assert.deepEqual(
    [...highRiskKeys].filter((key) => !probeKeys.has(key) && !resourceProbeKeys.has(key) && !exclusionKeys.has(key)),
    [],
    "high-risk role-console mutations missing a probe or explicit exclusion",
  );
  assert.deepEqual([...exclusionKeys].filter((key) => !highRiskKeys.has(key)), [],
    "stale role-console mutation exclusions");
  assert.deepEqual([...resourceProbeKeys].filter((key) => !highRiskKeys.has(key)), [],
    "stale resource-fixture probes: the rail is gone, or is no longer high-risk");
  for (const mutation of PROBES) {
    assert.equal(EXCLUSIONS[keyOf(mutation)], undefined, `${keyOf(mutation)} cannot be both probed and excluded`);
    assert.equal(RESOURCE_PROBES[keyOf(mutation)], undefined,
      `${keyOf(mutation)} is under an assembled prefix backstop; the prefix probe covers it and a resource fixture would be a second proof of one gate`);
  }
  for (const key of resourceProbeKeys) {
    assert.equal(EXCLUSIONS[key], undefined, `${key} cannot be both resource-probed and excluded`);
  }
  for (const mutation of HIGH_RISK.filter((item) => !probeKeys.has(keyOf(item)) && !resourceProbeKeys.has(keyOf(item)))) {
    emitEvidence({ kind: "excluded", endpoint: keyOf(mutation), source: mutation.source, line: mutation.line, reason: EXCLUSIONS[keyOf(mutation)] });
  }
});

test("live audit safety guard fails closed before fixture creation", () => {
  const safe: AuditSafetyConfig = {
    nodeEnv: "test",
    baseUrl: "http://127.0.0.1:5000",
    databaseUrl: "postgres://audit",
    productionDatabaseUrl: "postgres://production",
  };
  assert.equal(liveAuditRefusalReason(safe), undefined);
  assert.equal(
    liveAuditRefusalReason({ ...safe, baseUrl: "http://localhost:5000" }),
    undefined,
  );
  assert.match(
    liveAuditRefusalReason({ ...safe, nodeEnv: "production" }) ?? "",
    /NODE_ENV=production/,
  );
  assert.match(
    liveAuditRefusalReason({ ...safe, baseUrl: "https://audit.example.com" }) ?? "",
    /not loopback/,
  );
  assert.match(
    liveAuditRefusalReason({ ...safe, baseUrl: "not a URL" }) ?? "",
    /invalid/,
  );
  assert.match(
    liveAuditRefusalReason({
      ...safe,
      databaseUrl: "postgres://production",
      productionDatabaseUrl: "postgres://production",
    }) ?? "",
    /equals PROD_DATABASE_URL/,
  );
});

test("ordinary user receives exact 403 from every assembled expert/provider role backstop", {
  skip: !LIVE_AUDIT && "set MUTATION_AUTH_AUDIT_OK=1 to run live HTTP authorization probes",
}, async () => {
  const failures: Array<{ endpoint: string; status?: number; error?: string }> = [];
  const statuses: Record<string, number> = {};
  // Sequential requests preserve route-level JSONL evidence and ensure every
  // backstop is attempted even after a prior failure.
  for (const mutation of PROBES) {
    const requestPath = concretePath(mutation.effectivePath);
    try {
      const response = await fetch(`${BASE_URL}${requestPath}`, {
        method: mutation.method,
        headers: { "content-type": "application/json", cookie: sessionCookie },
        body: "{}", redirect: "manual",
      });
      const body = await diagnosticBody(response);
      statuses[String(response.status)] = (statuses[String(response.status)] ?? 0) + 1;
      emitEvidence({ kind: "probe", endpoint: keyOf(mutation), source: mutation.source, line: mutation.line,
        url: `${BASE_URL}${requestPath}`, expectedStatus: 403, actualStatus: response.status, response: body });
      if (response.status !== 403) failures.push({ endpoint: keyOf(mutation), status: response.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitEvidence({ kind: "probe-error", endpoint: keyOf(mutation), source: mutation.source, line: mutation.line, error: message });
      failures.push({ endpoint: keyOf(mutation), error: message });
    }
  }
  emitEvidence({ kind: "summary", probed: PROBES.length, statuses, failures });
  assert.deepEqual(failures, [], "wrong-role routes must return exact 403 from their role backstop");
});

test("handler-owned rails: anonymous 401, the non-owner is refused before the handler acts, the owner passes the ownership gate", {
  skip: !LIVE_AUDIT && "set MUTATION_AUTH_AUDIT_OK=1 to run live HTTP authorization probes",
}, async () => {
  assert.ok(fixtureBookingId && fixtureQuoteId && ownerCookie && sessionCookie, "the RESOURCE_PROBES fixture was not created");
  const manifestRow = new Map(HIGH_RISK.map((mutation) => [keyOf(mutation), mutation]));
  const probed = new Set<string>();

  // Sequential and status-exact, like the prefix probe above.  `principal` names who asked.
  const send = async (endpoint: string, principal: string, cookie: string | undefined, body: unknown, expectedStatus: number) => {
    const mutation = manifestRow.get(endpoint);
    assert.ok(mutation, `${endpoint} is not a high-risk manifest route`);
    const requestPath = mutation.effectivePath
      .replace(":quoteId", encodeURIComponent(fixtureQuoteId!))
      .replace(":id", encodeURIComponent(fixtureBookingId!));
    const response = await fetch(`${BASE_URL}${requestPath}`, {
      method: mutation.method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body), redirect: "manual",
    });
    const text = await diagnosticBody(response);
    emitEvidence({ kind: "probe", endpoint, principal, source: mutation.source, line: mutation.line,
      url: `${BASE_URL}${requestPath}`, expectedStatus, actualStatus: response.status, response: text });
    assert.equal(response.status, expectedStatus, `${endpoint} as ${principal}: expected ${expectedStatus}, got ${response.status}: ${text}`);
    probed.add(endpoint);
    return text;
  };
  const bookingStatus = () => fixtureRowStatus("service_bookings", fixtureBookingId!);
  const quoteStatus = () => fixtureRowStatus("service_quotes", fixtureQuoteId!);

  // ── The two component-failed rails share ONE handler; each mount is probed on its own path. ──
  for (const endpoint of Object.keys(RESOURCE_PROBES).filter((key) => RESOURCE_PROBES[key] === "booking")) {
    await send(endpoint, "anonymous", undefined, {}, 401);
    // The booking's own TRAVELER: a party to the row who is not its owner.  Refused as
    // "not found or not yours" BEFORE the body is read, and the row is untouched.
    const refusal = await send(endpoint, "traveler (non-owner)", sessionCookie, {}, 404);
    assert.match(refusal, /not yours/, "the ownership refusal is the handler's own sentence");
    assert.equal(await bookingStatus(), "confirmed", "a refused non-owner must not change the row");
    // The OWNER passes the ownership gate: with an empty body the NEXT statement — body validation —
    // answers, and that 400 names this handler's own field.  Nothing is recorded (§13: the probe
    // proves the gate, not a bundle that does not exist).
    const past = await send(endpoint, "owner", ownerCookie, {}, 400);
    assert.match(past, /componentServiceId/, "the owner reached body validation, i.e. passed ownership");
    assert.equal(await bookingStatus(), "confirmed");
  }

  // ── The quote rails: issue, then withdraw, on ONE `requested` quote. ──
  const issue = "POST /api/provider/quotes/:quoteId/issue";
  const withdraw = "POST /api/provider/quotes/:quoteId/withdraw";
  assert.equal(RESOURCE_PROBES[issue], "quote");
  assert.equal(RESOURCE_PROBES[withdraw], "quote");
  // A VALID body, so the refusal below is the ownership check inside `issueQuote` and not the
  // zod parse that precedes it (an empty body would 400 for owner and stranger alike).
  const validIssueBody = { amountCents: 12500 };
  await send(issue, "anonymous", undefined, validIssueBody, 401);
  const issueRefusal = await send(issue, "traveler (non-owner)", sessionCookie, validIssueBody, 404);
  assert.match(issueRefusal, /"code":"not_found"/, "no such quote and not yours are ONE sentence");
  assert.equal(await quoteStatus(), "requested", "a refused non-owner must not move the quote");
  await send(withdraw, "anonymous", undefined, {}, 401);
  const withdrawRefusal = await send(withdraw, "traveler (non-owner)", sessionCookie, {}, 404);
  assert.match(withdrawRefusal, /"code":"not_found"/);
  assert.equal(await quoteStatus(), "requested");
  // The OWNER: issue moves requested → quoted; withdraw moves quoted → withdrawn.  Both are the
  // rails' own atomic conditionals, exercised once each on a disposable row.
  await send(issue, "owner", ownerCookie, validIssueBody, 200);
  assert.equal(await quoteStatus(), "quoted", "the owner's issue must land");
  await send(withdraw, "owner", ownerCookie, {}, 200);
  assert.equal(await quoteStatus(), "withdrawn", "the owner's withdraw must land");

  // The tally: every RESOURCE_PROBES rail was probed here, and nothing else was.
  const expected = Object.keys(RESOURCE_PROBES)
    .filter((key) => RESOURCE_PROBES[key] === "booking" || RESOURCE_PROBES[key] === "quote")
    .sort();
  assert.deepEqual([...probed].sort(), expected,
    "booking/quote RESOURCE_PROBES and their live probes must name the same rails");
  emitEvidence({ kind: "summary", resourceProbed: probed.size });
});

test("ready-made authoring rails: anonymous is refused, non-author writes nothing, author succeeds", {
  skip: !LIVE_AUDIT && "set MUTATION_AUTH_AUDIT_OK=1 to run live HTTP authorization probes",
}, async () => {
  assert.ok(
    readyMadeAuthorId && readyMadeAuthorCookie && fixtureUserId && sessionCookie,
    "the ready-made author fixture was not created",
  );
  const manifestRow = new Map(HIGH_RISK.map((mutation) => [keyOf(mutation), mutation]));
  const probed = new Set<string>();

  const send = async (
    endpoint: string,
    principal: string,
    cookie: string | undefined,
    replacements: Record<string, string>,
    body: unknown,
    expectedStatus: number,
  ) => {
    const mutation = manifestRow.get(endpoint);
    assert.ok(mutation, `${endpoint} is not a high-risk manifest route`);
    let requestPath = mutation.effectivePath;
    for (const [name, value] of Object.entries(replacements)) {
      requestPath = requestPath.replace(`:${name}`, encodeURIComponent(value));
    }
    const response = await fetch(`${BASE_URL}${requestPath}`, {
      method: mutation.method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
      redirect: "manual",
    });
    const text = await diagnosticBody(response);
    emitEvidence({
      kind: "probe",
      endpoint,
      principal,
      source: mutation.source,
      line: mutation.line,
      url: `${BASE_URL}${requestPath}`,
      expectedStatus,
      actualStatus: response.status,
      response: text,
    });
    assert.equal(
      response.status,
      expectedStatus,
      `${endpoint} as ${principal}: expected ${expectedStatus}, got ${response.status}: ${text}`,
    );
    probed.add(endpoint);
    return text;
  };
  const parseJson = (text: string) => JSON.parse(text) as Record<string, any>;

  const create = "POST /api/expert/ready-made";
  assert.equal(await readyMadeAuthorTripCount(readyMadeAuthorId), 0);
  await send(create, "anonymous", undefined, {}, {}, 401);
  await send(create, "ordinary user (role denied)", sessionCookie, {}, {}, 403);
  assert.equal(await readyMadeAuthorTripCount(readyMadeAuthorId), 0,
    "a role-denied create must not mint an authoring trip");
  const created = parseJson(await send(create, "author", readyMadeAuthorCookie, {}, {
    title: "Mutation auth ready-made build",
    destination: "Kyoto",
    durationDays: 1,
  }, 201));
  const tripId = String(created.tripId);
  assert.ok(tripId, "author create must return a trip id");
  assert.equal((await readyMadeTripRow(tripId))?.title, "Mutation auth ready-made build");

  const editBuild = "PATCH /api/expert/ready-made/build/:tripId";
  await send(editBuild, "anonymous", undefined, { tripId }, { title: "Anonymous edit" }, 401);
  await send(editBuild, "ordinary user (non-author)", sessionCookie, { tripId }, { title: "Non-owner edit" }, 403);
  assert.equal((await readyMadeTripRow(tripId))?.title, "Mutation auth ready-made build",
    "a refused non-author must not edit the build");
  await send(editBuild, "author", readyMadeAuthorCookie, { tripId }, {
    title: "Mutation auth edited build",
  }, 200);
  assert.equal((await readyMadeTripRow(tripId))?.title, "Mutation auth edited build");

  const fromTrip = "POST /api/expert/ready-made/from-trip/:tripId";
  await send(fromTrip, "anonymous", undefined, { tripId }, {}, 401);
  await send(fromTrip, "ordinary user (role denied)", sessionCookie, { tripId }, {}, 403);
  assert.equal(await readyMadeListingCountForTrip(tripId), 0,
    "a refused non-author must not ship a listing");
  const shipped = parseJson(await send(fromTrip, "author", readyMadeAuthorCookie, { tripId }, {}, 201));
  const listingId = String(shipped.listingId);
  assert.ok(listingId, "author ship-to-store must return a listing id");

  const patchListing = "PATCH /api/expert/ready-made/:id";
  await send(patchListing, "anonymous", undefined, { id: listingId }, { title: "Anonymous listing edit" }, 401);
  await send(patchListing, "ordinary user (non-author)", sessionCookie, { id: listingId }, { title: "Non-owner listing edit" }, 404);
  assert.equal((await readyMadeListingRow(listingId))?.title, "Mutation auth edited build",
    "a refused non-author must not edit the listing");
  await send(patchListing, "author", readyMadeAuthorCookie, { id: listingId }, {
    title: "Mutation auth complete listing",
  }, 200);
  assert.equal((await readyMadeListingRow(listingId))?.title, "Mutation auth complete listing");

  const heroMeta = {
    unsplashId: "mutation-auth-photo",
    photographer: "Authorization Audit",
    profileUrl: "https://unsplash.com/@mutation-auth",
  };
  await auditDb!.execute(sql`
    UPDATE ready_made_trips
    SET plan_type = 'city_itinerary',
        pricing_mode = 'fixed',
        price_cents = 500,
        hero_image_url = 'https://images.unsplash.com/photo-mutation-auth',
        hero_image_meta = ${JSON.stringify(heroMeta)}::jsonb,
        duration_days = 1
    WHERE id = ${listingId}
  `);
  await auditDb!.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status)
    VALUES (${`mutation-auth-item-${crypto.randomUUID()}`}, ${tripId},
            'Mutation authorization itinerary item', 1, 0, 'in_planning')
  `);

  const buildReview = "POST /api/expert/ready-made/:id/build-review";
  await send(buildReview, "anonymous", undefined, { id: listingId }, {}, 401);
  await send(buildReview, "ordinary user (non-author)", sessionCookie, { id: listingId }, {}, 404);
  assert.equal((await readyMadeListingRow(listingId))?.build_review, null,
    "a refused non-author must not write a build review");
  await send(buildReview, "author", readyMadeAuthorCookie, { id: listingId }, {}, 200);
  assert.ok((await readyMadeListingRow(listingId))?.build_review,
    "the author must persist a real build review");

  const submit = "POST /api/expert/ready-made/:id/submit";
  await send(submit, "anonymous", undefined, { id: listingId }, {}, 401);
  await send(submit, "ordinary user (non-author)", sessionCookie, { id: listingId }, {}, 404);
  assert.equal((await readyMadeListingRow(listingId))?.status, "draft",
    "a refused non-author must not submit the listing");
  await send(submit, "author", readyMadeAuthorCookie, { id: listingId }, {}, 200);
  assert.equal((await readyMadeListingRow(listingId))?.status, "submitted");

  const withdraw = "POST /api/expert/ready-made/:id/withdraw";
  await send(withdraw, "anonymous", undefined, { id: listingId }, {}, 401);
  await send(withdraw, "ordinary user (non-author)", sessionCookie, { id: listingId }, {}, 404);
  assert.equal((await readyMadeListingRow(listingId))?.status, "submitted",
    "a refused non-author must not withdraw the listing");
  await send(withdraw, "author", readyMadeAuthorCookie, { id: listingId }, {}, 200);
  assert.equal((await readyMadeListingRow(listingId))?.status, "withdrawn");

  const deletionBuild = parseJson(await send(create, "author (delete fixture)", readyMadeAuthorCookie, {}, {
    title: "Mutation auth disposable delete build",
    destination: "Kyoto",
    durationDays: 1,
  }, 201));
  const deleteTripId = String(deletionBuild.tripId);
  const deleteBuild = "DELETE /api/expert/ready-made/build/:id";
  await send(deleteBuild, "anonymous", undefined, { id: deleteTripId }, {}, 401);
  await send(deleteBuild, "ordinary user (non-author)", sessionCookie, { id: deleteTripId }, {}, 403);
  assert.ok(await readyMadeTripRow(deleteTripId),
    "a refused non-author must not delete the build");
  await send(deleteBuild, "author", readyMadeAuthorCookie, { id: deleteTripId }, {}, 204);
  assert.equal(await readyMadeTripRow(deleteTripId), undefined);

  const expected = Object.keys(RESOURCE_PROBES)
    .filter((key) => RESOURCE_PROBES[key] === "readyMade")
    .sort();
  assert.deepEqual([...probed].sort(), expected,
    "ready-made RESOURCE_PROBES and their live probes must name the same eight rails");
  emitEvidence({ kind: "summary", readyMadeResourceProbed: probed.size });
});
