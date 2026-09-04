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
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
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

const keyOf = (mutation: Pick<ManifestMutation, "method" | "effectivePath">) =>
  `${mutation.method} ${mutation.effectivePath}`;
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

// These are copied from the production assembly at routes.ts:698-742, rather
// than inferred from endpoint names.  /api/provider/services is deliberately
// an earner (expert/provider/admin) backstop, not a provider-only one.
const ROLE_BACKSTOP_PREFIXES = [
  "/api/expert/neighborhoods",
  "/api/expert/profile-notes",
  "/api/expert/profile",
  "/api/expert/photo",
  "/api/expert/selected-services",
  "/api/expert/specializations",
  "/api/expert/service-listings",
  "/api/expert/templates",
  "/api/expert/services",
  "/api/expert/knowledge-nuggets",
  "/api/provider/request-verification-review",
  "/api/provider/services",
] as const;
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
  "POST /api/expert/ready-made": "Ready-made authoring application flow is resource/role-checked by its router, outside the assembled expert-prefix backstop.",
  "PATCH /api/expert/ready-made/:id": "Ready-made authoring is handler/resource-authorized; a real author fixture is required.",
  "POST /api/expert/ready-made/:id/build-review": "Ready-made build review is handler/resource-authorized; a real author fixture is required.",
  "POST /api/expert/ready-made/:id/submit": "Ready-made submission is handler/resource-authorized; a real author fixture is required.",
  "POST /api/expert/ready-made/:id/withdraw": "Ready-made withdrawal is handler/resource-authorized; a real author fixture is required.",
  "DELETE /api/expert/ready-made/build/:id": "Ready-made build deletion is handler/resource-authorized; a real author fixture is required.",
  "PATCH /api/expert/ready-made/build/:tripId": "Ready-made build editing is handler/resource-authorized; a real author fixture is required.",
  "POST /api/expert/ready-made/from-trip/:tripId": "Trip-to-ready-made conversion is handler/resource-authorized; a real authored trip fixture is required.",
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
  const password = `MutationAuth-${crypto.randomBytes(12).toString("hex")}!`;
  const email = `mutation-auth-${crypto.randomUUID()}@example.invalid`;
  await auditDb.insert(users).values({
    id: fixtureUserId, email, password: await hashPassword(password),
    firstName: "Mutation", lastName: "Authorization Audit", role: "user", authProvider: "email",
  });
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }), redirect: "manual",
  });
  assert.equal(login.status, 200, `ordinary-user fixture login failed: status=${login.status} response=${await diagnosticBody(login)}`);
  sessionCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(sessionCookie, "ordinary-user fixture login did not return a session cookie");
});

after(async () => {
  if (!fixtureUserId || !auditDb) return;
  try {
    await auditDb.execute(sql`
      DELETE FROM sessions
      WHERE sess->'passport'->'user'->'claims'->>'sub' = ${fixtureUserId}
         OR sess->'passport'->'user'->>'id' = ${fixtureUserId}
    `);
  } finally {
    await auditDb.delete(users).where(eq(users.id, fixtureUserId));
  }
});

test("every high-risk expert/provider/local-expert manifest route is probed or explicitly excluded", () => {
  assert.ok(HIGH_RISK.length > 0, "high-risk role-console inventory must not be empty");
  const highRiskKeys = new Set(HIGH_RISK.map(keyOf));
  const probeKeys = new Set(PROBES.map(keyOf));
  const exclusionKeys = new Set(Object.keys(EXCLUSIONS));
  assert.deepEqual([...highRiskKeys].filter((key) => !probeKeys.has(key) && !exclusionKeys.has(key)), [],
    "high-risk role-console mutations missing a probe or explicit exclusion");
  assert.deepEqual([...exclusionKeys].filter((key) => !highRiskKeys.has(key)), [],
    "stale role-console mutation exclusions");
  for (const mutation of PROBES) {
    assert.equal(EXCLUSIONS[keyOf(mutation)], undefined, `${keyOf(mutation)} cannot be both probed and excluded`);
  }
  for (const mutation of HIGH_RISK.filter((item) => !probeKeys.has(keyOf(item)))) {
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