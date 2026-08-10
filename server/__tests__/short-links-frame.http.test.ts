/**
 * D4 — FRAME-AWARE SHORT LINKS (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md, decision-maker
 * ratified Aug 10 2026).
 *
 * Proves the four load-bearing claims of the migration-193 `short_links.frame` column:
 *   (a) an OMITTED frame preserves today's exact behavior — the untagged link is minted once
 *       and re-fetched (deduped) on repeat, exactly as before this change.
 *   (b) frame PARTICIPATES IN DEDUPE — a frame-tagged request never returns the untagged link
 *       (or a different frame's link) and vice versa; each frame mints its OWN code.
 *   (c) an INVALID frame (outside the closed SHARE_FRAMES allowlist) is rejected (400).
 *   (d) legacy/untagged NULL-frame rows are represented HONESTLY in GET /api/me/link-analytics'
 *       frameBreakdown — under an explicit "untagged" bucket, never dropped, never folded into a
 *       real frame.
 *
 * Transport: real HTTP against the ALREADY-RUNNING dev server on http://127.0.0.1:5000, same
 * posture as service-deliverable.http.test.ts / journey-suite-negatives.http.test.ts — fixtures
 * via the app's own auth API for the user (real FK-safe id + session cookie), direct
 * disposable-DB-guarded SQL for the provider_services row (no HTTP path for it needed here).
 *
 * Run solo: npx tsx --test server/__tests__/short-links-frame.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const readPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors service-deliverable.http.test.ts; never defaults open) ──
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
      `[short-links-frame] REFUSING to write fixtures: DATABASE_URL host '${csHost ?? "<none>"}' / ` +
        `server addr '${serverAddr ?? "<local-socket>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const emailTag = (label: string) => `slf-${RUN}-${label}@t.test`;
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

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
    body: JSON.stringify({ email, password: PASSWORD, firstName: "ShortLink", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function makeService(ownerId: string): Promise<string> {
  const id = `slf-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await readPool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, description, price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, 'fixture short-link frame service', '40.00', 'active', 'approved', 'pdf')`,
    [id, ownerId, `D4 short-link service ${RUN}`],
  );
  createdServiceIds.push(id);
  return id;
}

let owner: Actor;
let serviceId: string;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev')`);

  await assertDisposableDb();

  owner = await registerActor("owner");
  serviceId = await makeService(owner.id);
});

after(async () => {
  try {
    await assertDisposableDb();
    // short_links cascades from users (owner_user_id ON DELETE CASCADE), but delete explicitly
    // first so a partial failure never leaves orphaned fixture rows for the next run to trip on.
    await readPool.query(`DELETE FROM short_links WHERE owner_user_id = $1`, [owner?.id ?? "__none__"]).catch(() => {});
    for (const id of createdServiceIds) {
      await readPool.query(`DELETE FROM provider_services WHERE id = $1`, [id]).catch(() => {});
    }
    for (const email of createdEmails) {
      await readPool.query(`DELETE FROM users WHERE email = $1`, [email]).catch(() => {});
    }
  } finally {
    await readPool.end().catch(() => {});
  }
});

// ── (a) omitted frame preserves today's exact behavior ──────────────────────────────────────

let untaggedCode: string;

test("D4-a1: an omitted frame mints an untagged link, frame: null in the response", async () => {
  const res = await api("/api/short-links", owner.cookie, "POST", { targetType: "service", targetId: serviceId });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.code);
  assert.equal(body.frame, null);
  untaggedCode = body.code;
});

test("D4-a2: repeating the same omitted-frame request re-fetches the SAME code (dedupe unchanged)", async () => {
  const res = await api("/api/short-links", owner.cookie, "POST", { targetType: "service", targetId: serviceId });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, untaggedCode);
  assert.equal(body.frame, null);
});

// ── (b) frame participates in dedupe — each frame gets its OWN code ─────────────────────────

let feedCode: string;
let storyCode: string;

test("D4-b1: a frame-tagged request mints a DIFFERENT code than the untagged link", async () => {
  const res = await api("/api/short-links", owner.cookie, "POST", {
    targetType: "service",
    targetId: serviceId,
    frame: "feed",
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.frame, "feed");
  assert.notEqual(body.code, untaggedCode);
  feedCode = body.code;
});

test("D4-b2: repeating the same frame-tagged request re-fetches the SAME frame-tagged code", async () => {
  const res = await api("/api/short-links", owner.cookie, "POST", {
    targetType: "service",
    targetId: serviceId,
    frame: "feed",
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, feedCode);
});

test("D4-b3: a DIFFERENT frame for the same target mints a THIRD, distinct code", async () => {
  const res = await api("/api/short-links", owner.cookie, "POST", {
    targetType: "service",
    targetId: serviceId,
    frame: "story",
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.frame, "story");
  assert.notEqual(body.code, untaggedCode);
  assert.notEqual(body.code, feedCode);
  storyCode = body.code;
});

// ── (c) an invalid frame is rejected ─────────────────────────────────────────────────────────

test("D4-c1: a frame outside the closed SHARE_FRAMES allowlist is rejected (400)", async () => {
  const res = await api("/api/short-links", owner.cookie, "POST", {
    targetType: "service",
    targetId: serviceId,
    frame: "not-a-real-frame",
  });
  assert.equal(res.status, 400);
});

// ── (d) legacy/untagged rows are represented honestly in analytics ──────────────────────────

test("D4-d1: link-analytics frameBreakdown carries feed, story AND an explicit untagged bucket", async () => {
  const res = await api("/api/me/link-analytics?days=365", owner.cookie);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.ok(Array.isArray(body.frameBreakdown));
  const byFrame = new Map<string | null, any>(body.frameBreakdown.map((r: any) => [r.frame, r]));

  assert.ok(byFrame.has("feed"), "feed bucket must be present (a real link carries it)");
  assert.equal(byFrame.get("feed").linkCount, 1);

  assert.ok(byFrame.has("story"), "story bucket must be present (a real link carries it)");
  assert.equal(byFrame.get("story").linkCount, 1);

  assert.ok(byFrame.has(null), "the untagged bucket must be present, not dropped");
  assert.equal(byFrame.get(null).label, "Untagged");
  assert.equal(byFrame.get(null).linkCount, 1);

  // §13: a frame this owner never created (route, review) is ABSENT, never a zero-filled guess.
  assert.ok(!byFrame.has("route"), "a frame with no link for this owner must be absent, not zero-filled");
  assert.ok(!byFrame.has("review"), "a frame with no link for this owner must be absent, not zero-filled");

  // Per-link rows also carry their real frame (or null for the untagged link).
  const linkRows = body.links as Array<{ code: string; frame: string | null }>;
  const byCode = new Map(linkRows.map((r) => [r.code, r.frame]));
  assert.equal(byCode.get(feedCode), "feed");
  assert.equal(byCode.get(storyCode), "story");
  assert.equal(byCode.get(untaggedCode), null);
});
