/**
 * Task #1675 live authorization audit.
 *
 * The inventory/completeness test is always safe to run. The HTTP matrix is
 * deliberately opt-in because it creates one isolated ordinary-user fixture:
 *
 *   MUTATION_AUTH_AUDIT_OK=1 npx tsx --test \
 *     server/__tests__/mutation-auth/admin-mutation-auth.test.ts
 *
 * Production handlers are safe targets here: both requests must be rejected by
 * authorization middleware before body validation or any mutation handler.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/models/auth";
import {
  assertCasesCoverDiscoveredInventory,
  discoverAdminMutations,
  type AdminMutation,
} from "./admin-mutation-inventory";

const LIVE_AUDIT = process.env.MUTATION_AUTH_AUDIT_OK === "1";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const DISCOVERED = discoverAdminMutations();

// Kept as a distinct manifest so the completeness assertion compares the
// routes under test with independently discovered effective registrations.
const CASES: AdminMutation[] = DISCOVERED.map((mutation) => ({ ...mutation }));
const scrypt = promisify(crypto.scrypt);

let fixtureUserId: string | undefined;
let sessionCookie = "";
let auditDb: typeof import("../../db").db | undefined;

function concretePath(template: string): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_all, name: string) =>
    encodeURIComponent(`${name}-mutation-auth-probe`),
  );
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

async function diagnosticBody(response: Response): Promise<string> {
  const text = await response.text();
  return text.length <= 500 ? text : `${text.slice(0, 500)}…`;
}

async function assertDenied(
  mutation: AdminMutation,
  response: Response,
  expected: 401 | 403,
  principal: string,
): Promise<void> {
  const body = await diagnosticBody(response);
  assert.equal(
    response.status,
    expected,
    [
      `${mutation.method} ${mutation.path} (${mutation.source})`,
      `risk=${mutation.risk}`,
      `principal=${principal}`,
      `expected=${expected} actual=${response.status}`,
      `response=${body}`,
    ].join(" | "),
  );
}

async function requestMutation(mutation: AdminMutation, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return fetch(`${BASE_URL}${concretePath(mutation.path)}`, {
    method: mutation.method,
    headers,
    body: "{}",
    redirect: "manual",
  });
}

function assertSafeLiveAuditTarget(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing mutation authorization audit when NODE_ENV=production");
  }

  let hostname: string;
  try {
    hostname = new URL(BASE_URL).hostname.toLowerCase();
  } catch {
    throw new Error(`Refusing mutation authorization audit with invalid BASE_URL: ${BASE_URL}`);
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error(
      `Refusing mutation authorization audit against non-loopback BASE_URL: ${BASE_URL}`,
    );
  }

  if (
    process.env.PROD_DATABASE_URL &&
    process.env.DATABASE_URL === process.env.PROD_DATABASE_URL
  ) {
    throw new Error("Refusing mutation authorization audit against the production database");
  }
}

before(async () => {
  if (!LIVE_AUDIT) return;
  // All refusal checks must precede importing the DB module or assigning a
  // fixture id, ensuring unsafe targets fail closed before any fixture write.
  assertSafeLiveAuditTarget();

  auditDb = (await import("../../db")).db;
  fixtureUserId = crypto.randomUUID();
  const password = `MutationAuth-${crypto.randomBytes(12).toString("hex")}!`;
  const email = `mutation-auth-${crypto.randomUUID()}@example.invalid`;
  await auditDb.insert(users).values({
    id: fixtureUserId,
    email,
    password: await hashPassword(password),
    firstName: "Mutation",
    lastName: "Authorization Audit",
    role: "user",
    authProvider: "email",
  });

  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const loginBody = await diagnosticBody(login);
  assert.equal(
    login.status,
    200,
    `ordinary-user fixture login failed: status=${login.status} response=${loginBody}`,
  );
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

test("admin mutation test manifest exactly covers the discovered effective inventory", () => {
  assertCasesCoverDiscoveredInventory(CASES, DISCOVERED);
  assert.ok(CASES.length > 0, "the privileged mutation inventory must not be empty");
});

for (const mutation of CASES) {
  test(
    `${mutation.method} ${mutation.path} returns exact 401/403 before its privileged mutation (${mutation.risk})`,
    { skip: !LIVE_AUDIT && "set MUTATION_AUTH_AUDIT_OK=1 to run live HTTP authorization probes" },
    async () => {
      await assertDenied(
        mutation,
        await requestMutation(mutation),
        401,
        "unauthenticated",
      );
      await assertDenied(
        mutation,
        await requestMutation(mutation, sessionCookie),
        403,
        "authenticated ordinary user",
      );
      console.log(JSON.stringify({
        audit: "admin-mutation-auth",
        kind: "probe",
        endpoint: `${mutation.method} ${mutation.path}`,
        contexts: ["unauthenticated", "wrong-role"],
      }));
    },
  );
}