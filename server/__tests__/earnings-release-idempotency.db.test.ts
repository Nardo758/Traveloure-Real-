/**
 * EARNINGS RELEASE — double-fire safety proof (scheduler-reliability lane #1712).
 *
 * `earnings-release` is now fired by an external cron (POST /internal/jobs/earnings-release) as well
 * as its in-process defense-in-depth timer, so the endpoint and the timer can both call
 * `storage.releaseMaturedEarnings()` in the same window. This is the `[guarded]` property that
 * matters most: a MONEY job that runs twice must not pay twice. Release is the flip that makes an
 * earning payable, so the proof is that a second pass over the SAME matured rows changes nothing.
 *
 * The transition is `held → releasable` under an atomic conditional `UPDATE … WHERE status='held'
 * AND available_at <= now AND dispute_state IS DISTINCT FROM 'open'` (storage.releaseMaturedEarnings,
 * §15). Once a row is `releasable` it is no longer `held`, so a second pass cannot match it — that is
 * what makes the endpoint and the timer racing safe. This file proves it against real rows:
 *
 *   A. A matured, undisputed held earning (expert AND provider) is released on the first pass.
 *   B. A future-dated held earning and a disputed held earning are NOT released (negatives that a
 *      broken predicate would flip).
 *   C. IDEMPOTENT — a second pass leaves every one of A's and B's rows in exactly the state the
 *      first pass left it: the released rows stay `releasable` (never re-processed, never double
 *      counted), the withheld rows stay `held`.
 *
 * Assertions read THIS file's own marked rows (expert_id / provider_id = this run's user), never a
 * global count, so ambient seed rows in the CI database cannot mask or fake the result.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/earnings-release-idempotency.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const userId = `earnrel-${RUN}-user`;

// Fixed ids so assertions can read each row back by identity.
const E = {
  matured: `earnrel-${RUN}-e-matured`,
  future: `earnrel-${RUN}-e-future`,
  disputed: `earnrel-${RUN}-e-disputed`,
};
const P = {
  matured: `earnrel-${RUN}-p-matured`,
  future: `earnrel-${RUN}-p-future`,
};

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// ── Disposable-DB guard (mirrors checkout-claim-sweep.db.test.ts; never defaults open) ──────────
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
      `[earnings-release] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

async function statusOf(table: "expert_earnings" | "provider_earnings", id: string): Promise<string | null> {
  const col = table === "expert_earnings" ? sql`expert_earnings` : sql`provider_earnings`;
  const r = await db.execute(sql`SELECT status FROM ${col} WHERE id = ${id}`);
  return ((r.rows[0] as any)?.status as string) ?? null;
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${userId}, ${`earnrel-${RUN}@t.test`}, 'Earn', 'Release')
  `);

  // Expert earnings: matured+undisputed (release), future-dated (hold), disputed (hold).
  await db.execute(sql`
    INSERT INTO expert_earnings (id, expert_id, type, amount, status, dispute_state, available_at) VALUES
      (${E.matured},  ${userId}, 'tip', '50.00', 'held', 'none', ${PAST}::timestamptz),
      (${E.future},   ${userId}, 'tip', '50.00', 'held', 'none', ${FUTURE}::timestamptz),
      (${E.disputed}, ${userId}, 'tip', '50.00', 'held', 'open', ${PAST}::timestamptz)
  `);

  // Provider earnings: matured+undisputed (release), future-dated (hold).
  await db.execute(sql`
    INSERT INTO provider_earnings (id, provider_id, type, amount, status, dispute_state, available_at) VALUES
      (${P.matured}, ${userId}, 'service_booking', '80.00', 'held', 'none', ${PAST}::timestamptz),
      (${P.future},  ${userId}, 'service_booking', '80.00', 'held', 'none', ${FUTURE}::timestamptz)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM expert_earnings WHERE expert_id = ${userId}`);
  await db.execute(sql`DELETE FROM provider_earnings WHERE provider_id = ${userId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
});

test("first pass releases the matured, undisputed earnings and withholds the rest", async () => {
  const res = await storage.releaseMaturedEarnings();
  // Ambient-tolerant sanity: the run at minimum released our two matured rows.
  assert.ok(res.expert >= 1, `expected >=1 expert release, got ${res.expert}`);
  assert.ok(res.provider >= 1, `expected >=1 provider release, got ${res.provider}`);

  assert.equal(await statusOf("expert_earnings", E.matured), "releasable", "matured expert earning must release");
  assert.equal(await statusOf("provider_earnings", P.matured), "releasable", "matured provider earning must release");

  // Negatives: a broken predicate would flip these.
  assert.equal(await statusOf("expert_earnings", E.future), "held", "future-dated earning must NOT release");
  assert.equal(await statusOf("expert_earnings", E.disputed), "held", "disputed earning must NOT release");
  assert.equal(await statusOf("provider_earnings", P.future), "held", "future-dated provider earning must NOT release");
});

test("second pass is a no-op on every row — no double-release (the [guarded] no-double-pay property)", async () => {
  const before2 = {
    eMatured: await statusOf("expert_earnings", E.matured),
    pMatured: await statusOf("provider_earnings", P.matured),
    eFuture: await statusOf("expert_earnings", E.future),
    eDisputed: await statusOf("expert_earnings", E.disputed),
    pFuture: await statusOf("provider_earnings", P.future),
  };

  await storage.releaseMaturedEarnings();

  // Exactly the state the first pass left: released stay releasable, withheld stay held.
  assert.equal(await statusOf("expert_earnings", E.matured), before2.eMatured, "released expert earning changed on 2nd pass");
  assert.equal(await statusOf("provider_earnings", P.matured), before2.pMatured, "released provider earning changed on 2nd pass");
  assert.equal(await statusOf("expert_earnings", E.future), before2.eFuture, "future expert earning changed on 2nd pass");
  assert.equal(await statusOf("expert_earnings", E.disputed), before2.eDisputed, "disputed expert earning changed on 2nd pass");
  assert.equal(await statusOf("provider_earnings", P.future), before2.pFuture, "future provider earning changed on 2nd pass");

  // And they are definitively released, not silently reverted.
  assert.equal(before2.eMatured, "releasable");
  assert.equal(before2.pMatured, "releasable");
});
