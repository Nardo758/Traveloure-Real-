/**
 * THE ANONYMOUS MINT MUST ANSWER — AND WHAT IT ANSWERS IS "SIGN IN", NOT A PLAN.
 *
 * Ledger `2026-09-14-guest-trip-mint-responds`, punchlist **R-9** (verified 2026-09-14 by the
 * lane that found it, fixed here).
 *
 * WHY IT EXISTS. `POST /api/trips` had a guest branch: an anonymous caller was minted a NULL-owner
 * `trips` row and then handed a `shareToken`. The token line read the BARE GLOBAL `crypto` —
 * `server/routes.ts` imports only `randomBytes` from `node:crypto`, and in an ESM module `crypto`
 * is the Web Crypto object, which has no `randomBytes` — so it threw
 * `TypeError: crypto.randomBytes is not a function` (reproduced at `server/routes.ts:1339`) into
 * the handler's `catch`, which re-threw it out of an async Express 4 handler. Express never sees
 * that rejection: THE RESPONSE NEVER ARRIVED. The row was already committed, so a guest was left
 * with an orphan plan they had no address for while their request hung until they gave up
 * (measured: row present, no reply in 45 s).
 *
 * WHAT WAS RULED, AND WHY THE TOKEN LINE WAS NOT SIMPLY REPAIRED.
 * `2026-09-13-guest-cart-becomes-plan` states the negative space out loud — "NO GUEST PLAN AND NO
 * GUEST OPTIMIZATION (G2 stays HELD, nothing lets an anonymous principal own a `trips` row)" — and
 * punchlist D-15 rules the flow that replaces it: the guest's work lives in the CART (LD 39's
 * sanctioned fallback), they sign in AT THE MOMENT with the gate checked BEFORE anything is minted
 * (LD 42 D5), and the cart's lines become the plan's items through `POST /api/cart/resolve-trip`.
 * Making the token work would have SHIPPED guest trips as a side effect of fixing a hang.
 *
 *   R1  IT ANSWERS. An unauthenticated mint with a VALID body returns a status WITHIN the request —
 *       401 with a message the caller can act on. The request carries its own abort deadline, so
 *       the pre-fix behaviour (no response at all) FAILS this proof instead of stalling the suite.
 *   R2  NOTHING IS LEFT BEHIND. The refusal writes no `trips` row — no NULL-owner row carrying the
 *       posted title exists afterwards, and the table's NULL-owner count is unchanged. An orphan
 *       row nobody can address is worse than a refusal (§13).
 *   R3  THE GATE IS FIRST. A body that would also fail validation (end before start) still answers
 *       401, never 400 — proof the refusal precedes the parse and therefore precedes every write
 *       (LD 42 D5: the gate is checked before anything is minted).
 *   R4  THE OWNER PATH IS UNTOUCHED. An authenticated mint still answers 201 and still carries the
 *       server-derived mint invariants: `market_slug` and `timezone` derived from the destination
 *       (LD 30, LD 42 D12), a `tracking_number`, and the owner's `trip_collaborators` row.
 *   R5  THE DEFECT CLASS IS PINNED. With comments stripped, `server/routes.ts` calls no method on
 *       the bare `crypto` global — the file has no namespace import, so any such call is the same
 *       TypeError waiting to happen, and inside an async handler it is another silent hang.
 *
 * NEGATIVE SPACE, STATED. This suite proves what the ROUTE does. It does not prove that any client
 * surface stops offering the mint to a signed-out visitor (`IntakePanel` still does; the server
 * refusal is the enforcement — a UI rule never keeps a write out, §14 posture), and it asserts
 * nothing about NULL-owner rows already on disk, which are deliberately not backfilled and are
 * indistinguishable from the expert-AUTHORING drafts that legitimately carry a NULL `user_id`.
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this file
 * writes is created and deleted by it. No Stripe key is exercised — nothing here charges.
 *
 * Run solo against a local dev server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/guest-trip-mint-responds.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

/**
 * A HANG MUST FAIL, NEVER STALL. The whole defect was "no response", so every request in this file
 * carries its own deadline — generous enough that a slow CI box is not a false red, short enough
 * that the pre-fix behaviour reports as a failed assertion rather than eating the job's clock.
 */
const REQUEST_DEADLINE_MS = 20_000;

const travelerEmail = `gmint-${RUN}-traveler@t.test`;
let travelerCookie = "";
let travelerId = "";
const GUEST_TITLE = `Guest mint ${RUN}`;
const OWNER_TITLE = `Owner mint ${RUN}`;

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
      `[guest-trip-mint-responds] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** One fetch with an abort deadline, so "never answered" is an ASSERTION FAILURE, not a stall. */
async function api(
  pathname: string,
  cookie: string | undefined,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; json: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = undefined;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body is reported through `text` */
    }
    return { status: res.status, json, text };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      assert.fail(
        `${method} ${pathname} NEVER ANSWERED within ${REQUEST_DEADLINE_MS}ms — this is punchlist R-9 ` +
          `(the handler threw out of an async Express handler and no response was ever sent).`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** A valid mint body: real destination, real dates, budget as the STRING the decimal column takes. */
function mintBody(title: string): Record<string, unknown> {
  const start = new Date(Date.now() + 45 * 86400000).toISOString().split("T")[0];
  const end = new Date(Date.now() + 50 * 86400000).toISOString().split("T")[0];
  return { title, destination: "Kyoto, Japan", startDate: start, endDate: end, budget: "3000" };
}

async function countOwnerlessTrips(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM trips WHERE user_id IS NULL`);
  return Number((r.rows[0] as any).n);
}

async function tripsTitled(title: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT id, user_id, market_slug, timezone, tracking_number, share_token
    FROM trips WHERE title = ${title}
  `);
  return r.rows as any[];
}

/** `server/routes.ts` with comments stripped — R5 reads CODE, never the prose that describes it. */
function readCodeWithoutComments(rel: string): string {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ""))
    .join("\n");
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: travelerEmail,
    password: PASSWORD,
    firstName: "Guest",
    lastName: "Mint",
  });
  assert.equal(reg.status, 201, `register traveler failed (${reg.status}): ${reg.text}`);
  travelerId = reg.json?.user?.id;
  assert.ok(travelerId, "register must return the new user's id");

  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: travelerEmail, password: PASSWORD }),
  });
  assert.equal(login.status, 200, "login must succeed for the registered traveler");
  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie, "login must set a session cookie");
  travelerCookie = setCookie!.split(";")[0];
});

after(async () => {
  try {
    for (const title of [GUEST_TITLE, OWNER_TITLE, `${GUEST_TITLE} (invalid dates)`]) {
      const rows = await tripsTitled(title);
      for (const row of rows) {
        await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${row.id}`);
        await db.execute(sql`DELETE FROM trips WHERE id = ${row.id}`);
      }
    }
    if (travelerId) {
      await db.execute(sql`DELETE FROM trip_collaborators WHERE user_id = ${travelerId}`);
      await db.execute(sql`DELETE FROM trips WHERE user_id = ${travelerId}`);
    }
    await db.execute(sql`DELETE FROM users WHERE email = ${travelerEmail}`);
  } finally {
    await pool.end();
  }
});

// ── R1 / R2 ───────────────────────────────────────────────────────────────────────────────────
test("R1: an unauthenticated mint ANSWERS — 401 with a message, inside the request", async () => {
  const res = await api("/api/trips", undefined, "POST", mintBody(GUEST_TITLE));

  assert.equal(res.status, 401, `expected the anonymous mint to be refused, got ${res.status}: ${res.text}`);
  assert.ok(
    typeof res.json?.message === "string" && res.json.message.length > 0,
    "the refusal must carry a message the caller can act on, not an empty body",
  );
  assert.match(
    res.json.message,
    /sign in/i,
    "the refusal names the one thing the caller can do about it (LD 42 D5: sign in at the moment)",
  );
  assert.ok(
    res.json?.id === undefined && res.json?.shareToken === undefined,
    "a refusal hands back no plan and no share token — there is nothing to address",
  );
});

test("R2: the refusal leaves NO trips row behind — no orphan a guest cannot address (§13)", async () => {
  const before = await countOwnerlessTrips();
  const res = await api("/api/trips", undefined, "POST", mintBody(GUEST_TITLE));
  assert.equal(res.status, 401);

  assert.deepEqual(
    await tripsTitled(GUEST_TITLE),
    [],
    "the refused mint wrote a trips row — that is the pre-fix orphan this lane exists to stop",
  );
  assert.equal(
    await countOwnerlessTrips(),
    before,
    "the NULL-owner trips count moved across a refusal — nothing may be minted for an anonymous caller",
  );
});

// ── R3 ────────────────────────────────────────────────────────────────────────────────────────
test("R3: the gate precedes the PARSE — an invalid body is still 401, never 400", async () => {
  const body = mintBody(`${GUEST_TITLE} (invalid dates)`);
  // End BEFORE start: this body is refused by the handler's own date validation, which runs after
  // the zod parse. If the caller sees 400, the request reached validation — i.e. the gate is not
  // first, and everything before it already ran.
  const start = body.startDate as string;
  body.startDate = body.endDate as string;
  body.endDate = start;

  const res = await api("/api/trips", undefined, "POST", body);
  assert.equal(
    res.status,
    401,
    `an anonymous caller must be refused BEFORE the body is judged; got ${res.status}: ${res.text}`,
  );
  assert.deepEqual(await tripsTitled(`${GUEST_TITLE} (invalid dates)`), []);
});

// ── R4 ────────────────────────────────────────────────────────────────────────────────────────
test("R4: the OWNER path still mints — 201, with the server-derived invariants intact", async () => {
  const res = await api("/api/trips", travelerCookie, "POST", mintBody(OWNER_TITLE));
  assert.equal(res.status, 201, `authenticated mint failed (${res.status}): ${res.text}`);
  assert.ok(res.json?.id, "a successful mint answers with the plan");
  assert.equal(res.json.userId, travelerId, "§14: the owner is the session user, never the body");

  const rows = await tripsTitled(OWNER_TITLE);
  assert.equal(rows.length, 1, "exactly one row is minted");
  const row = rows[0] as any;
  // LD 30 / LD 42 D12 — both derived server-side from the destination at write time.
  assert.equal(row.market_slug, "kyoto", "market_slug is a NAMED mint invariant (LD 42 D12)");
  assert.equal(row.timezone, "Asia/Tokyo", "the plan's IANA zone is stamped at mint (LD 30)");
  assert.ok(row.tracking_number, "every plan mints its identity at birth");

  const collab = await db.execute(sql`
    SELECT role FROM trip_collaborators WHERE trip_id = ${row.id} AND user_id = ${travelerId}
  `);
  assert.equal(
    (collab.rows[0] as any)?.role,
    "owner",
    "the owner's trip_collaborators row is written in the same operation (trip-mint owner-access invariant)",
  );
});

// ── R5 ────────────────────────────────────────────────────────────────────────────────────────
test("R5: no code in server/routes.ts calls a method on the bare `crypto` global", async () => {
  const code = readCodeWithoutComments("server/routes.ts");
  const hits = code.split("\n").filter((line) => /(?<![\w.$])crypto\s*\.\s*\w/.test(line));
  assert.deepEqual(
    hits,
    [],
    "server/routes.ts imports named helpers from `node:crypto` and has NO namespace import, so a " +
      "`crypto.<method>` call resolves to the ESM Web Crypto global and throws — the exact TypeError " +
      "that hung the guest mint. Import the helper you need (e.g. `randomBytes`) instead.",
  );
});
