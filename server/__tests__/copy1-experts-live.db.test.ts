/**
 * COPY-1 §4k (ledger `2026-11-04-copy1-exp-qa-swaps`): GET /api/public/signup-mode carries `expertsLive: boolean` —
 * whether the launch market has an approved, non-test expert (the same read as /api/experts?location=<city>).
 *
 *   T4 the route answers a boolean; with no approved expert in the market ⇒ false; one approved, routable expert ⇒
 *      true; the same expert flagged as a test account ⇒ false again.
 *
 * The market under test is Cartagena (an operating market with no expert in the fixtures); the route test mounts the
 * public router in-process. SHOW_DEMO_EXPERTS is unset here, so seed-domain experts never count.
 *
 * DISPOSABLE DB ONLY. Run: npx tsx --test --test-force-exit server/__tests__/copy1-experts-live.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); }
  catch { return "<none>"; }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[copy1-experts-live] REFUSING to write fixtures to '${host}'.`);
}
const priorDemo = process.env.SHOW_DEMO_EXPERTS;
delete process.env.SHOW_DEMO_EXPERTS;

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const express = (await import("express")).default;
const { expertsLiveIn } = await import("../services/experts-live.service");
const launchPublicRouter = (await import("../routes/launch-public.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const USER = `copy1-${RUN}-expert`;
const MARKET = "cartagena";

before(async () => {
  assert.equal(await expertsLiveIn(MARKET), false, "precondition: no approved expert in Cartagena");
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${USER}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${USER}`).catch(() => {});
  } finally {
    if (priorDemo === undefined) delete process.env.SHOW_DEMO_EXPERTS;
    else process.env.SHOW_DEMO_EXPERTS = priorDemo;
    await pool.end();
  }
});

test("T4 — the route answers expertsLive as a boolean", async () => {
  const app = express();
  app.use(launchPublicRouter);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/api/public/signup-mode`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.expertsLive, "boolean");
    assert.deepEqual(Object.keys(body).sort(), ["expertsLive", "launchMarketSlug", "mode"]);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("T4 — 0 approved experts ⇒ false; 1 ⇒ true; a test account never counts", async () => {
  assert.equal(await expertsLiveIn(MARKET), false);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, is_test)
    VALUES (${USER}, ${`${USER}@copy1.invalid`}, 'Copy', 'One', 'local_expert', NULL)
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, city, destinations, specialties,
                                    identity_verification_status, stripe_connect_status)
    VALUES (${`${USER}-form`}, ${USER}, 'Copy', 'One', ${`${USER}@copy1.invalid`}, 'approved', 'Cartagena',
            ${JSON.stringify(["Cartagena"])}::jsonb, '[]'::jsonb, 'verified', 'complete')
  `);
  assert.equal(await expertsLiveIn(MARKET), true, "one approved, routable expert in the market");
  assert.equal(await expertsLiveIn("porto"), false, "another market is not lit by it");
  await db.execute(sql`UPDATE users SET is_test = true WHERE id = ${USER}`);
  assert.equal(await expertsLiveIn(MARKET), false, "a test account never counts");
  assert.equal(await expertsLiveIn(null), false, "no launch market ⇒ false");
});
