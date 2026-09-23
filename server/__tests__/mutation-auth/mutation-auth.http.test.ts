/**
 * Task #1675 — isolated User A/User B mutation authorization proof.
 *
 * This suite targets an already-running local development server. It creates
 * both users and User B's trip directly, so a valid resource owned by another
 * real user is always used; random-ID 400/404 responses are never evidence.
 * No endpoint that can call an external provider is exercised.
 *
 * Run only against a disposable DB/server:
 *   MUTATION_AUTH_AUDIT_OK=1 npx tsx --test server/__tests__/mutation-auth/mutation-auth.http.test.ts
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { itineraryItems, tripExpertAdvisors, trips } from "@shared/schema";

const enabled = process.env.MUTATION_AUTH_AUDIT_OK === "1";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const scrypt = promisify(crypto.scrypt);
const createdUserIds: string[] = [];

function assertSafeFixtureTarget(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing task #1675 fixture writes when NODE_ENV=production");
  }

  let baseHostname: string;
  try {
    baseHostname = new URL(BASE).hostname.toLowerCase();
  } catch {
    throw new Error(`Refusing task #1675 fixture writes: BASE_URL is invalid (${BASE})`);
  }
  if (baseHostname !== "127.0.0.1" && baseHostname !== "localhost") {
    throw new Error(
      `Refusing task #1675 fixture writes: BASE_URL must be loopback localhost/127.0.0.1 (received ${baseHostname})`,
    );
  }

  if (
    process.env.PROD_DATABASE_URL &&
    process.env.DATABASE_URL === process.env.PROD_DATABASE_URL
  ) {
    throw new Error("Refusing task #1675 fixture writes against the production database");
  }
}

type FixtureUser = { id: string; email: string; password: string; cookie: string };
let userA: FixtureUser;
let userB: FixtureUser;
let userBTripId: string;
let userBItemId: string;
let originalBTrip: { id: string; userId: string | null; title: string | null; destination: string };

/**
 * Selected from the task #1675 generated mutation manifest.  These are the
 * effective trip-scoped, user-data/payment-domain mutations.  The list
 * deliberately excludes claim (share-token transfer semantics), bulk email/
 * invite (outbound mail), itinerary generation/advisor narration (AI), and
 * every external-provider route.  Duplicated declarations in routes.ts and
 * trips.routes.ts are represented once because HTTP can only reach one
 * effective handler for a path.
 */
const tripScopedUserDataMutations = [
  ["POST", "/api/trips/:tripId/participants"],
  ["POST", "/api/trips/:tripId/contracts"],
  ["POST", "/api/trips/:tripId/contracts/:contractId/documents"],
  ["POST", "/api/trips/:tripId/transactions"],
  ["POST", "/api/trips/:tripId/transactions/split"],
  ["POST", "/api/trips/:tripId/budget/calculate-split"],
  ["POST", "/api/trips/:tripId/itinerary-items"],
  ["POST", "/api/trips/:tripId/itinerary/reorder"],
  ["POST", "/api/trips/:tripId/itinerary/optimize-order"],
  ["POST", "/api/trips/:tripId/activate-transport"],
  ["POST", "/api/trips/:tripId/emergency-contacts"],
  ["POST", "/api/trips/:tripId/emergency/initialize"],
  ["POST", "/api/trips/:tripId/alerts"],
  ["POST", "/api/trips/:tripId/anchors"],
  ["POST", "/api/trips/:tripId/day-boundaries"],
  ["POST", "/api/trips/:tripId/validate-schedule"],
  ["POST", "/api/trips/:tripId/anchors/:anchorId/impacts"],
  ["POST", "/api/trips/:tripId/anchor-suggestions"],
  ["POST", "/api/trips/:tripId/analytics/infer"],
  ["PATCH", "/api/trips/:tripId/itinerary-items/:itemId"],
  ["DELETE", "/api/trips/:tripId/itinerary-items/:itemId"],
  ["PATCH", "/api/trips/:tripId/expert-traveler-note"],
  ["POST", "/api/trips/:tripId/changes"],
  ["DELETE", "/api/trips/:tripId/changes/:changeId"],
  ["POST", "/api/trips/:tripId/items/:itemId/route"],
  ["POST", "/api/trips/:tripId/finalize"],
  ["POST", "/api/trips/:tripId/reopen"],
  ["POST", "/api/trips/:tripId/transport-legs/generate"],
  ["PATCH", "/api/trips/:tripId/transport-legs/:legId"],
  ["DELETE", "/api/trips/:tripId/transport-legs/:legId"],
] as const;

const antiOracleOwnershipDenials = new Set([
  "POST /api/trips/:tripId/activate-transport",
  "POST /api/trips/:tripId/analytics/infer",
]);

function concretizeBTripPath(template: string): string {
  return template
    .replace(/:tripId\b/g, userBTripId)
    .replace(/:itemId\b/g, userBItemId)
    // Nested IDs must be syntactically plausible but must not name somebody
    // else's row. Authorization must reject on B's real parent trip first.
    .replace(/:[A-Za-z]+Id\b/g, "00000000-0000-4000-8000-000000000001");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

async function request(pathname: string, options: { method: string; cookie?: string; body?: unknown }) {
  return fetch(`${BASE}${pathname}`, {
    method: options.method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
}

async function createAndLogin(label: "A" | "B"): Promise<FixtureUser> {
  const id = crypto.randomUUID();
  const password = `MutationAuth-${label}-${crypto.randomBytes(12).toString("hex")}!`;
  const email = `mutation-auth-${runId}-${label.toLowerCase()}@example.invalid`;
  await db.insert(users).values({
    id, email, password: await hashPassword(password), firstName: "Mutation", lastName: `User${label}`,
    role: "user", authProvider: "email",
  });
  createdUserIds.push(id);
  const login = await request("/api/auth/login", { method: "POST", body: { email, password } });
  if (login.status !== 200) {
    assert.fail(
      `fixture User ${label} must be able to log in: status=${login.status} body=${await login.text()}`,
    );
  }
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(cookie, `fixture User ${label} must receive a session cookie`);
  return { id, email, password, cookie };
}

async function assertBTripUnchanged(caseName: string) {
  const [current] = await db.select({
    id: trips.id, userId: trips.userId, title: trips.title, destination: trips.destination,
  }).from(trips).where(eq(trips.id, userBTripId));
  assert.deepEqual(current, originalBTrip, `${caseName}: User B's persisted trip changed`);
}

before(async () => {
  if (!enabled) return;
  assertSafeFixtureTarget();
  userA = await createAndLogin("A");
  userB = await createAndLogin("B");
  const [trip] = await db.insert(trips).values({
    userId: userB.id,
    title: `B-private-${runId}`,
    destination: "Authorization Fixture City",
    startDate: "2031-01-10",
    endDate: "2031-01-12",
    status: "draft",
  }).returning({ id: trips.id, userId: trips.userId, title: trips.title, destination: trips.destination });
  userBTripId = trip.id;
  originalBTrip = trip;
  const [item] = await db.insert(itineraryItems).values({
    tripId: userBTripId,
    title: `B-private-item-${runId}`,
    dayNumber: 1,
    routingStatus: "in_planning",
  } as any).returning({ id: itineraryItems.id });
  userBItemId = item.id;
});

after(async () => {
  if (!enabled || createdUserIds.length === 0) return;
  await db.delete(trips).where(eq(trips.id, userBTripId));
  for (const userId of createdUserIds) {
    await db.execute(sql`
      DELETE FROM sessions
      WHERE sess->'passport'->'user'->'claims'->>'sub' = ${userId}
         OR sess->'passport'->'user'->>'id' = ${userId}
    `);
  }
  await db.delete(users).where(inArray(users.id, createdUserIds));
});

for (const mutation of [
  { method: "PATCH", suffix: "", body: { title: `A-overwrite-${runId}` } },
  { method: "DELETE", suffix: "", body: {} },
] as const) {
  test(`trip ${mutation.method}: anonymous and User A cannot mutate real User B fixture`, { skip: !enabled }, async () => {
    const path = `/api/trips/${userBTripId}${mutation.suffix}`;
    const anonymous = await request(path, { method: mutation.method, body: mutation.body });
    assert.ok([401, 403].includes(anonymous.status), `${mutation.method} anonymous status was ${anonymous.status}`);
    await assertBTripUnchanged(`${mutation.method} anonymous`);

    const crossOwner = await request(path, { method: mutation.method, cookie: userA.cookie, body: mutation.body });
    await assertBTripUnchanged(`${mutation.method} User A→User B`);
    console.log(`[mutation-auth evidence] ${JSON.stringify({ endpoint: `${mutation.method} /api/trips/:id`, method: mutation.method, path, actor: "User A", status: crossOwner.status, unchanged: true })}`);
    assert.ok(
      [401, 403].includes(crossOwner.status),
      `${mutation.method} User A→User B must be denied before mutation; status=${crossOwner.status}`,
    );
  });
}

test("optimization payment creation rejects User A for User B's real trip before Stripe", { skip: !enabled }, async () => {
  const response = await request("/api/optimization-payments", {
    method: "POST",
    cookie: userA.cookie,
    body: { tripId: userBTripId },
  });
  await assertBTripUnchanged("optimization payment User A→User B");
  console.log(`[mutation-auth evidence] ${JSON.stringify({
    endpoint: "POST /api/optimization-payments",
    method: "POST",
    path: "/api/optimization-payments",
    actor: "User A",
    status: response.status,
    unchanged: true,
    externalCallsExpected: 0,
  })}`);
  assert.equal(response.status, 403, "cross-owner optimization payment must stop before Stripe");
});

// POST /api/trips/:tripId/advisors is NOT in the generic loop above, on purpose: that loop sends
// an empty body, and this rail refuses an empty body at its address shape (exactly one of
// `handle` / `localExpertId`) with a 400 before ownership is ever asked — a 400 there would prove
// nothing about ownership. So each address kind is sent WELL-FORMED, naming an expert that does not
// exist. That makes the status a discriminator: the service checks ownership BEFORE it resolves the
// expert, so a 403 can only be the ownership refusal — skip ownership and the same body answers 404.
// The side effect the rail exists to make is an advisor row on the plan, which the trip row would
// not show, so that is asserted directly.
test("trip advisor invitation rejects anonymous and User A on User B's real trip, by handle and by id", { skip: !enabled }, async () => {
  const path = `/api/trips/${userBTripId}/advisors`;
  const endpoint = "POST /api/trips/:tripId/advisors";
  const advisorRows = async () =>
    db.select({ id: tripExpertAdvisors.id }).from(tripExpertAdvisors).where(eq(tripExpertAdvisors.tripId, userBTripId));
  for (const [address, body] of [
    ["handle", { handle: `no-such-expert-${runId}`.slice(0, 30) }],
    ["id", { localExpertId: `no-such-expert-${runId}` }],
  ] as const) {
    const anonymous = await request(path, { method: "POST", body });
    assert.ok([401, 403].includes(anonymous.status), `${address} anonymous status was ${anonymous.status}`);

    const crossOwner = await request(path, { method: "POST", cookie: userA.cookie, body });
    await assertBTripUnchanged(`advisors by ${address} User A→User B`);
    assert.deepEqual(await advisorRows(), [], `advisors by ${address}: an advisor row was written on User B's plan`);
    console.log(`[mutation-auth evidence] ${JSON.stringify({ endpoint, method: "POST", path, actor: "User A", address, status: crossOwner.status, unchanged: true })}`);
    assert.equal(crossOwner.status, 403, `advisors by ${address}: User A→User B must be refused by ownership before the expert is resolved; status=${crossOwner.status}`);

    // The discriminator, proven rather than asserted: the OWNER sending the identical body passes
    // ownership and is answered 404 for the unknown expert. So the body is well-formed, it reaches
    // expert resolution, and User A's 403 above can only be the ownership refusal.
    const owner = await request(path, { method: "POST", cookie: userB.cookie, body });
    assert.equal(owner.status, 404, `advisors by ${address}: the owner must pass ownership and reach expert resolution; status=${owner.status}`);
    assert.deepEqual(await advisorRows(), [], `advisors by ${address}: an unknown expert must not produce an advisor row`);
  }
});

test("every selected trip-scoped User A → User B mutation is forbidden before validation", { skip: !enabled }, async () => {
  const evidence: Array<{ method: string; path: string; status: number; unchanged: true }> = [];
  const notProven: Array<{ method: string; template: string; status: number }> = [];
  for (const [method, template] of tripScopedUserDataMutations) {
    const path = concretizeBTripPath(template);
    // An empty object is intentional. A 400/404 would merely show validation
    // or a nested-ID lookup; exact 403 proves User A was rejected for User B's
    // real parent trip before either can become ownership evidence.
    const body = template.endsWith("/items/:itemId/route") ? { to: "with_expert" } : {};
    const response = await request(path, { method, cookie: userA.cookie, body });
    await assertBTripUnchanged(`${method} ${template} User A→User B`);
    const row = { endpoint: `${method} ${template}`, method, path, status: response.status, unchanged: true as const };
    evidence.push(row);
    console.log(`[mutation-auth evidence] ${JSON.stringify(row)}`);
    const secureStatus = response.status === 403 ||
      (response.status === 404 && antiOracleOwnershipDenials.has(`${method} ${template}`));
    if (!secureStatus) notProven.push({ method, template, status: response.status });
  }
  console.log(`[mutation-auth evidence-summary] ${JSON.stringify({ selected: evidence.length, evidence })}`);
  assert.deepEqual(
    notProven,
    [],
    `These trip-scoped endpoints did not prove owner rejection before validation: ${JSON.stringify(notProven)}`,
  );
});