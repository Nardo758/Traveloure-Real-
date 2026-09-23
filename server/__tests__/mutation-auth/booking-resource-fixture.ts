/**
 * The ONE disposable owner + listing + booking + quote fixture, and the ONE
 * live-audit safety predicate, shared by every authenticated mutation-auth
 * suite (CLAUDE.md §18 rule 1).
 *
 * It was born inside `expert-provider-mutation-auth.test.ts`, where it proved
 * the handler-owned rails under the role-console prefixes.  The payment rails
 * on `/api/bookings/*` need exactly the same rows with a DIFFERENT authorized
 * party — there the TRAVELER is the principal and the listing owner is not —
 * so the fixture moved here rather than being copied.  A second builder is the
 * derivation-drift class §18 rule 1 names, and on an authorization audit a
 * drifted fixture is the worst kind: it reads green.
 *
 * THREE PRINCIPALS, and the third is why this module exists.  `traveler` is
 * the booking's own traveler, `owner` is the listing's owner, and `stranger`
 * is neither — a party to nothing.  A rail whose authorized party is the
 * traveler cannot be proven by the owner alone (the owner is a party to the
 * row), and a rail whose authorized party is the owner cannot be proven by the
 * traveler alone.  The stranger is the arm that is never a party to anything.
 *
 * STATED NEGATIVE SPACE: this builds ROWS, not history.  The booking is born
 * `confirmed` with no Stripe id planted (§19a — a planted PaymentIntent would
 * make the row read as authorized to every consumer keyed on that column), no
 * balance, no components and no delivery.  So a probe against it proves the
 * AUTHORIZATION gate and nothing about the handler's later state machine; a
 * rail that needs a balance or a component must build that itself.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/models/auth";

const scrypt = promisify(crypto.scrypt);

export type AuditSafetyConfig = {
  nodeEnv?: string;
  baseUrl: string;
  databaseUrl?: string;
  productionDatabaseUrl?: string;
};

/**
 * Returns the first reason a live audit must be refused.  Pure, and called
 * BEFORE the DB module is imported or any row is created — these suites send
 * real POST/PATCH/PUT/DELETE requests, two of which are refund rails, so the
 * guard that keeps them off a production database has to run first and has to
 * fail closed.
 */
export function liveAuditRefusalReason(config: AuditSafetyConfig): string | undefined {
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

/** Response body, truncated — a diagnostic, never an assertion target on its own. */
export async function diagnosticBody(response: Response): Promise<string> {
  const body = await response.text();
  return body.length <= 500 ? body : `${body.slice(0, 500)}…`;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

type Db = typeof import("../../db").db;

/**
 * Creates a disposable account and logs it in over the real login route, so the
 * cookie a probe carries is a real session and not a hand-built one.
 */
export async function createLoginFixture(
  db: Db,
  baseUrl: string,
  input: { id: string; role: string; firstName: string },
): Promise<string> {
  const password = `MutationAuth-${crypto.randomBytes(12).toString("hex")}!`;
  const email = `mutation-auth-${crypto.randomUUID()}@example.invalid`;
  await db.insert(users).values({
    id: input.id, email, password: await hashPassword(password),
    firstName: input.firstName, lastName: "Authorization Audit", role: input.role, authProvider: "email",
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }), redirect: "manual",
  });
  assert.equal(
    login.status, 200,
    `${input.role} fixture login failed: status=${login.status} response=${await diagnosticBody(login)}`,
  );
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(cookie, `${input.role} fixture login did not return a session cookie`);
  return cookie;
}

export type BookingResourceFixture = {
  db: Db;
  travelerUserId: string;
  travelerCookie: string;
  ownerUserId: string;
  ownerCookie: string;
  strangerUserId: string;
  strangerCookie: string;
  serviceId: string;
  bookingId: string;
  quoteId: string;
};

/** The status of one fixture row — the proof that a refused principal changed nothing. */
export async function fixtureRowStatus(
  db: Db,
  table: "service_bookings" | "service_quotes",
  id: string,
): Promise<string | undefined> {
  const result = table === "service_bookings"
    ? await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`)
    : await db.execute(sql`SELECT status FROM service_quotes WHERE id = ${id}`);
  return (result.rows[0] as { status?: string } | undefined)?.status;
}

export async function createBookingResourceFixture(baseUrl: string): Promise<BookingResourceFixture> {
  const db = (await import("../../db")).db;
  const travelerUserId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();
  const strangerUserId = crypto.randomUUID();
  const travelerCookie = await createLoginFixture(db, baseUrl, { id: travelerUserId, role: "user", firstName: "Mutation" });
  const ownerCookie = await createLoginFixture(db, baseUrl, { id: ownerUserId, role: "service_provider", firstName: "Owner" });
  const strangerCookie = await createLoginFixture(db, baseUrl, { id: strangerUserId, role: "user", firstName: "Stranger" });

  // Raw rows on the same tables the handlers read (the `service-quotes` and `acceptance-rails`
  // DB suites' shapes); nothing is charged and no Stripe id is planted (§19a).
  const serviceId = `mutation-auth-svc-${crypto.randomUUID()}`;
  const bookingId = `mutation-auth-booking-${crypto.randomUUID()}`;
  const quoteId = `mutation-auth-quote-${crypto.randomUUID()}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, price_type, booking_mode,
                                   delivery_method, status, approval_status)
    VALUES (${serviceId}, ${ownerUserId}, 'Mutation authorization audit listing', 'fixture', NULL,
            'custom_quote', 'request', 'in_person', 'active', 'approved')
  `);
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
                                  total_amount, platform_fee, provider_earnings, confirmed_at)
    VALUES (${bookingId}, ${serviceId}, ${travelerUserId}, ${ownerUserId}, 'confirmed',
            '100.00', '25.00', '75.00', NOW())
  `);
  await db.execute(sql`
    INSERT INTO service_quotes (id, service_id, traveler_id, position, status)
    VALUES (${quoteId}, ${serviceId}, ${travelerUserId}, 1, 'requested')
  `);

  return {
    db, travelerUserId, travelerCookie, ownerUserId, ownerCookie,
    strangerUserId, strangerCookie, serviceId, bookingId, quoteId,
  };
}

/**
 * Deletes every row the fixture created, child rows first.  Each step is
 * attempted even after an earlier one throws, and the FIRST error is rethrown,
 * so a partial cleanup is loud rather than a slow leak of audit rows into the
 * database the next run reads.
 */
export async function destroyBookingResourceFixture(
  fixture: Pick<BookingResourceFixture, "db"> & Partial<BookingResourceFixture>,
): Promise<void> {
  const { db } = fixture;
  const ids = [fixture.travelerUserId ?? "", fixture.ownerUserId ?? "", fixture.strangerUserId ?? ""];
  const steps: Array<() => Promise<unknown>> = [
    () => db.execute(sql`DELETE FROM service_quotes WHERE id = ${fixture.quoteId ?? ""}`),
    () => db.execute(sql`DELETE FROM content_registry WHERE content_id IN (${fixture.bookingId ?? ""}, ${fixture.serviceId ?? ""})`),
    () => db.execute(sql`DELETE FROM service_bookings WHERE id = ${fixture.bookingId ?? ""}`),
    () => db.execute(sql`DELETE FROM provider_services WHERE id = ${fixture.serviceId ?? ""}`),
    () => db.execute(sql`
      DELETE FROM sessions
      WHERE sess->'passport'->'user'->'claims'->>'sub' IN (${ids[0]}, ${ids[1]}, ${ids[2]})
         OR sess->'passport'->'user'->>'id' IN (${ids[0]}, ${ids[1]}, ${ids[2]})
    `),
    ...ids.filter(Boolean).map((id) => () => db.delete(users).where(eq(users.id, id))),
  ];
  let firstError: unknown;
  for (const step of steps) {
    try { await step(); } catch (error) { firstError ??= error; }
  }
  if (firstError) throw firstError;
}
