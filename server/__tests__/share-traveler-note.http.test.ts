/**
 * SH-1 — THE EXPERT'S TRAVELER NOTE IS TRAVELER-ONLY ON EVERY SHARE ENDPOINT (ledger
 * `2026-10-09-sh1-share-traveler-note`). One proof per endpoint that can be reached with a share
 * token; every assertion on a non-traveler scans the RAW body for the run's unique marker, so a
 * leak through any key or depth fails.
 *
 *   N1 — `GET /api/itinerary-share/:token`, ANONYMOUS "view" link: no note.
 *   N2 — the same rail, the plan's TRAVELER (trip owner, session): the note, unchanged.
 *   N3 — the same rail, a signed-in non-traveler holding a "suggest" link: no note.
 *   N4 — `GET /api/trips/:id?token=`, ANONYMOUS with the trip's share token: no note.
 *   N5 — `GET /api/trips/:id?token=`, a signed-in stranger with the token: no note.
 *   N6 — `GET /api/trips/:id`, the OWNER: the note, unchanged.
 *   N7 — `GET /api/trips/shared/:token` (trip-based share): no note, no per-item expert note.
 *   N8 — `GET /api/shared-trips/:token` (variant-based share): no note.
 *
 * BENCH-ONLY. Needs a booted app AND a disposable database (DATABASE_URL). Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/share-traveler-note.http.test.ts
 * The rule itself is proven with no database by server/__tests__/share-traveler-note.test.ts.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const NOTE = `sh1-traveler-note-${RUN}`;
const ITEM_NOTE = `sh1-item-note-${RUN}`;

const emails = {
  owner: `sh1-${RUN}-owner@t.test`,
  expert: `sh1-${RUN}-expert@t.test`,
  stranger: `sh1-${RUN}-stranger@t.test`,
};
const userIds: Record<string, string> = {};
const cookies: Record<string, string> = {};
const ids = {
  trip: crypto.randomUUID(),
  item: `sh1-${RUN}-itm`,
  comparison: `sh1-${RUN}-cmp`,
  variant: `sh1-${RUN}-var`,
  shareView: `sh1-${RUN}-shr-view`,
  shareSuggest: `sh1-${RUN}-shr-sug`,
};
const tokens = {
  trip: `sh1-${RUN}-trip-token`,
  view: `sh1-${RUN}-token-view`,
  suggest: `sh1-${RUN}-token-suggest`,
  sharedTrip: `sh1-${RUN}-st-trip`,
  sharedVariant: `sh1-${RUN}-st-variant`,
};

// ── Disposable-DB guard (mirrors the journey suite's; never defaults open) ───────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[share-traveler-note] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function registerUser(email: string, first: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: first, lastName: "NoteGate" }),
  });
  assert.equal(res.status, 201, `register ${email} failed (${res.status}): ${await res.clone().text()}`);
  return ((await res.json()) as any).user.id;
}

async function loginCookie(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login ${email} failed (${res.status}): ${await res.clone().text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, `login ${email} must set a session cookie`);
  return setCookie!.split(";")[0];
}

async function get(path: string, cookie?: string): Promise<{ raw: string; body: any; status: number }> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: cookie ? { cookie } : {} });
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { raw, body, status: res.status };
}

function assertNoNote(raw: string, where: string): void {
  assert.ok(!raw.includes(NOTE), `the expert's traveler note LEAKED on ${where}`);
  assert.ok(!raw.includes(ITEM_NOTE), `a per-item expert note LEAKED on ${where}`);
}

before(async () => {
  await assertDisposableDb();
  userIds.owner = await registerUser(emails.owner, "Owner");
  userIds.expert = await registerUser(emails.expert, "Reviewer");
  userIds.stranger = await registerUser(emails.stranger, "Stranger");
  cookies.owner = await loginCookie(emails.owner);
  cookies.expert = await loginCookie(emails.expert);
  cookies.stranger = await loginCookie(emails.stranger);

  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, share_token, expert_traveler_note)
    VALUES (${ids.trip}, ${userIds.owner}, ${`Note gate ${RUN}`}, 'Kyoto', '2026-11-01', '2026-11-04',
            ${tokens.trip}, ${NOTE})
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, expert_note)
    VALUES (${ids.item}, ${ids.trip}, ${`Fushimi Inari ${RUN}`}, 1, ${ITEM_NOTE})
  `);
  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, start_date, end_date, status)
    VALUES (${ids.comparison}, ${userIds.owner}, ${ids.trip}, ${`Note gate ${RUN}`}, 'Kyoto', '2026-11-01', '2026-11-04', 'completed')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_variants (id, comparison_id, name, description, total_cost, optimization_score)
    VALUES (${ids.variant}, ${ids.comparison}, ${`Variant ${RUN}`}, 'fixture', '100.00', 80)
  `);
  await db.execute(sql`
    INSERT INTO shared_itineraries (id, share_token, variant_id, shared_by_user_id, permissions, expert_status, expert_notes)
    VALUES (${ids.shareView}, ${tokens.view}, ${ids.variant}, ${userIds.owner}, 'view', 'pending', NULL)
  `);
  await db.execute(sql`
    INSERT INTO shared_itineraries (id, share_token, variant_id, shared_by_user_id, permissions, expert_status, expert_notes)
    VALUES (${ids.shareSuggest}, ${tokens.suggest}, ${ids.variant}, ${userIds.owner}, 'suggest', 'pending', NULL)
  `);
  await db.execute(sql`
    INSERT INTO shared_trips (trip_id, shared_by, share_token, expires_at)
    VALUES (${ids.trip}, ${userIds.owner}, ${tokens.sharedTrip}, NOW() + INTERVAL '1 day')
  `);
  await db.execute(sql`
    INSERT INTO shared_trips (variant_id, comparison_id, shared_by, share_token, expires_at)
    VALUES (${ids.variant}, ${ids.comparison}, ${userIds.owner}, ${tokens.sharedVariant}, NOW() + INTERVAL '1 day')
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM shared_trips WHERE share_token IN (${tokens.sharedTrip}, ${tokens.sharedVariant})`);
  await db.execute(sql`DELETE FROM shared_itineraries WHERE id IN (${ids.shareView}, ${ids.shareSuggest})`);
  await db.execute(sql`DELETE FROM itinerary_variants WHERE id = ${ids.variant}`);
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${ids.comparison}`);
  await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${ids.item}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${userIds.owner}, ${userIds.expert}, ${userIds.stranger})`);
});

test("N1 — itinerary-share, anonymous view link: no note", async () => {
  const { status, raw, body } = await get(`/api/itinerary-share/${tokens.view}`);
  assert.equal(status, 200, raw);
  assertNoNote(raw, "itinerary-share (anonymous)");
  assert.equal(body.expertTravelerNote, null);
});

test("N2 — itinerary-share, the plan's traveler: the note", async () => {
  const { status, raw, body } = await get(`/api/itinerary-share/${tokens.view}`, cookies.owner);
  assert.equal(status, 200, raw);
  assert.equal(body.expertTravelerNote, NOTE);
});

test("N3 — itinerary-share, a signed-in non-traveler on a suggest link: no note", async () => {
  const { status, raw, body } = await get(`/api/itinerary-share/${tokens.suggest}`, cookies.expert);
  assert.equal(status, 200, raw);
  assertNoNote(raw, "itinerary-share (suggest link)");
  assert.equal(body.expertTravelerNote, null);
});

test("N4 — trip GET with the share token, anonymous: no note", async () => {
  const { status, raw, body } = await get(`/api/trips/${ids.trip}?token=${tokens.trip}`);
  assert.equal(status, 200, raw);
  assertNoNote(raw, "trip GET ?token= (anonymous)");
  assert.equal(body.expertTravelerNote, null);
});

test("N5 — trip GET with the share token, a signed-in stranger: no note", async () => {
  const { status, raw, body } = await get(`/api/trips/${ids.trip}?token=${tokens.trip}`, cookies.stranger);
  assert.equal(status, 200, raw);
  assertNoNote(raw, "trip GET ?token= (stranger)");
  assert.equal(body.expertTravelerNote, null);
});

test("N6 — trip GET, the owner: the note", async () => {
  const { status, raw, body } = await get(`/api/trips/${ids.trip}`, cookies.owner);
  assert.equal(status, 200, raw);
  assert.equal(body.expertTravelerNote, NOTE);
});

test("N7 — trips/shared/:token (trip-based share): no note", async () => {
  const { status, raw } = await get(`/api/trips/shared/${tokens.sharedTrip}`);
  assert.equal(status, 200, raw);
  assertNoNote(raw, "/api/trips/shared/:token");
});

test("N8 — shared-trips/:token (variant-based share): no note", async () => {
  const { status, raw } = await get(`/api/shared-trips/${tokens.sharedVariant}`);
  assert.equal(status, 200, raw);
  assertNoNote(raw, "/api/shared-trips/:token");
});
