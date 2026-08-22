/**
 * Lane nav-storefront D4 — GET /api/ready-made ?authorId= filter proofs.
 *
 * D2 added an optional author filter to the public store feed (the expert-profile
 * Ready-Made lane's data source), mirroring GET /api/expert-templates' ?expertId=
 * posture with a plain-id validation. The proofs:
 *   • RM-1  ?authorId=A returns ONLY A's approved listings (B's are absent).
 *   • RM-2  no param → the unchanged full feed (both authors present).
 *   • RM-3  a non-plain-id authorId (quotes/spaces/SQL punctuation) → 400, never a query.
 *   • RM-4  the filter never widens the read-gate: A's NON-approved listing stays
 *           invisible even when A is explicitly asked for (F2/§10 — approval is
 *           enforced at the API regardless of filter).
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000
 * (same posture as posting-opportunities-frame.http.test.ts) — actors via the app's own
 * auth API, disposable-DB-guarded SQL for trips / ready_made_trips fixture rows.
 *
 * Run solo: npx tsx --test server/__tests__/ready-made-author-filter.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors posting-opportunities-frame; never defaults open) ──
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
    // NULL inet_server_addr() (local socket/loopback) is itself a disposable-local signal.
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[ready-made-author-filter] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `rmaf-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const createdListingIds: string[] = [];

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = emailTag(label);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "RmAuthorFilter", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

/** Authoring trip (userId NULL + author_id set — the §2a shape the store lane uses). */
async function makeAuthoringTrip(authorId: string, label: string): Promise<string> {
  const id = crypto.randomUUID();
  await readPool.query(
    `INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status)
     VALUES ($1, NULL, $2, $3, 'Kyoto', '2026-09-01', '2026-09-03', 'draft')`,
    [id, authorId, `RM author-filter source trip ${label} ${RUN}`],
  );
  createdTripIds.push(id);
  return id;
}

async function makeListing(
  authorId: string,
  sourceTripId: string,
  label: string,
  status: "approved" | "submitted",
): Promise<string> {
  const id = crypto.randomUUID();
  await readPool.query(
    `INSERT INTO ready_made_trips
       (id, author_id, source_trip_id, market, title, duration_days, plan_type,
        pricing_mode, price_cents, status, active, reviewed_at)
     VALUES ($1, $2, $3, 'Kyoto', $4, 3, 'city_itinerary',
             'fixed', 12000, $5, true, CASE WHEN $5 = 'approved' THEN now() ELSE NULL END)`,
    [id, authorId, sourceTripId, `RM author-filter ${label} ${RUN}`, status],
  );
  createdListingIds.push(id);
  return id;
}

let authorA: Actor;
let authorB: Actor;
let approvedA: string;
let approvedB: string;
let submittedA: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);

  await assertDisposableDb();

  authorA = await registerActor("a");
  authorB = await registerActor("b");

  const tripA1 = await makeAuthoringTrip(authorA.id, "a1");
  const tripA2 = await makeAuthoringTrip(authorA.id, "a2");
  const tripB1 = await makeAuthoringTrip(authorB.id, "b1");

  approvedA = await makeListing(authorA.id, tripA1, "approved-a", "approved");
  approvedB = await makeListing(authorB.id, tripB1, "approved-b", "approved");
  // RM-4 fixture: A also has a listing that is NOT approved.
  submittedA = await makeListing(authorA.id, tripA2, "submitted-a", "submitted");
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdListingIds) {
      await readPool.query(`DELETE FROM ready_made_trips WHERE id = $1`, [id]).catch(() => {});
    }
    for (const id of createdTripIds) {
      await readPool.query(`DELETE FROM trips WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

async function feed(query = ""): Promise<{ status: number; listings: any[] }> {
  const res = await fetch(`${BASE_URL}/api/ready-made${query}`);
  if (!res.ok) return { status: res.status, listings: [] };
  const body = (await res.json()) as any;
  return { status: res.status, listings: body.listings ?? [] };
}

test("RM-1: ?authorId=A returns only A's approved listings", async () => {
  const { status, listings } = await feed(`?authorId=${encodeURIComponent(authorA.id)}`);
  assert.equal(status, 200);
  const ids = listings.map((l) => l.id);
  assert.ok(ids.includes(approvedA), "A's approved listing must be in A's filtered feed");
  assert.ok(!ids.includes(approvedB), "B's listing must NOT appear in A's filtered feed");
  // Every returned row is A's (by the fixture set — foreign rows may exist in a shared
  // dev DB, so assert only over the rows this run created).
  assert.ok(!ids.includes(submittedA), "non-approved never leaks (see RM-4)");
});

test("RM-2: no param → unchanged full feed (both authors present)", async () => {
  const { status, listings } = await feed();
  assert.equal(status, 200);
  const ids = listings.map((l) => l.id);
  assert.ok(ids.includes(approvedA), "full feed carries A's approved listing");
  assert.ok(ids.includes(approvedB), "full feed carries B's approved listing");
});

test("RM-3: a non-plain-id authorId is rejected with 400", async () => {
  const { status } = await feed(`?authorId=${encodeURIComponent(`no pe'; DROP TABLE x;--`)}`);
  assert.equal(status, 400);
});

test("RM-4: the filter never widens the read-gate — A's submitted listing stays invisible", async () => {
  const { status, listings } = await feed(`?authorId=${encodeURIComponent(authorA.id)}`);
  assert.equal(status, 200);
  const ids = listings.map((l) => l.id);
  assert.ok(!ids.includes(submittedA), "submitted listing must not surface even author-filtered");
});
